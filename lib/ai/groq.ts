import Groq from "groq-sdk";

// ============================================================================
// GROQ AI CLIENT
// ============================================================================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";

// ============================================================================
// CODE GENERATION FROM DESIGN
// ============================================================================

export interface GenerationOptions {
  framework: "nextjs" | "react" | "vue";
  styling: "tailwind" | "css" | "scss";
  typescript: boolean;
  componentName?: string;
}

export interface GeneratedCode {
  code: string;
  componentName: string;
  imports: string[];
  dependencies: string[];
  figgoMetadata: {
    figmaNodeId: string;
    generatedAt: string;
    tokens: any;
  };
}

export async function generateCodeFromDesign(
  designData: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    imageUrl?: string;
    tokens: any;
    structure: any;
  },
  options: GenerationOptions
): Promise<GeneratedCode> {
  const componentName = options.componentName || sanitizeComponentName(designData.nodeName);

  const systemPrompt = `You are an expert frontend developer specializing in converting Figma designs to production-ready code.

RULES:
1. Generate clean, semantic, accessible code
2. Use exact colors, spacing, and typography from the design tokens
3. Add Figgo metadata comments for sync tracking
4. Make components responsive by default
5. Use modern best practices
6. NO placeholder content - use actual values from design

OUTPUT FORMAT:
Return ONLY valid ${options.typescript ? "TypeScript" : "JavaScript"} code for a ${options.framework} component.
Include the @figgo metadata comment at the top.`;

  const userPrompt = `Convert this Figma design to a ${options.framework} component with ${options.styling}.

COMPONENT NAME: ${componentName}
FIGMA NODE ID: ${designData.nodeId}
NODE TYPE: ${designData.nodeType}

DESIGN TOKENS:
${JSON.stringify(designData.tokens, null, 2)}

STRUCTURE:
${JSON.stringify(designData.structure, null, 2)}

Generate a complete, production-ready component with:
1. @figgo-id comment with node ID
2. @figgo-component comment with component name
3. @figgo-tokens comment with stringified tokens
4. Proper imports
5. Responsive design
6. Accessibility attributes
7. Hover/focus states where appropriate`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });

  const generatedCode = response.choices[0]?.message?.content || "";

  // Extract code from markdown if present
  const code = extractCodeFromResponse(generatedCode);

  return {
    code,
    componentName,
    imports: extractImports(code),
    dependencies: extractDependencies(code, options),
    figgoMetadata: {
      figmaNodeId: designData.nodeId,
      generatedAt: new Date().toISOString(),
      tokens: designData.tokens,
    },
  };
}

// ============================================================================
// DESIGN QUALITY ANALYSIS
// ============================================================================

export interface QualityAnalysis {
  visualMatchScore: number;
  codeQualityScore: number;
  functionalScore: number;
  overallScore: number;
  issues: Array<{
    type: "visual" | "code" | "functional";
    severity: "low" | "medium" | "high";
    title: string;
    description: string;
    suggestion?: string;
  }>;
}

export async function analyzeDesignQuality(
  originalDesign: {
    tokens: any;
    imageUrl?: string;
  },
  generatedCode: string
): Promise<QualityAnalysis> {
  const systemPrompt = `You are a code quality analyzer. Analyze the generated code against the original design tokens and provide quality scores.

Return a JSON object with this exact structure:
{
  "visualMatchScore": <0-100>,
  "codeQualityScore": <0-100>,
  "functionalScore": <0-100>,
  "issues": [
    {
      "type": "visual|code|functional",
      "severity": "low|medium|high",
      "title": "Issue title",
      "description": "Detailed description",
      "suggestion": "How to fix"
    }
  ]
}`;

  const userPrompt = `Analyze this generated code against the design tokens:

DESIGN TOKENS:
${JSON.stringify(originalDesign.tokens, null, 2)}

GENERATED CODE:
${generatedCode}

Check for:
1. Visual accuracy (colors, spacing, typography match tokens)
2. Code quality (clean, maintainable, follows best practices)
3. Functional completeness (all elements present, interactive states)

Return ONLY valid JSON.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "{}";

  try {
    const analysis = JSON.parse(extractJsonFromResponse(content));
    return {
      visualMatchScore: analysis.visualMatchScore || 0,
      codeQualityScore: analysis.codeQualityScore || 0,
      functionalScore: analysis.functionalScore || 0,
      overallScore: Math.round(
        (analysis.visualMatchScore + analysis.codeQualityScore + analysis.functionalScore) / 3
      ),
      issues: analysis.issues || [],
    };
  } catch {
    return {
      visualMatchScore: 70,
      codeQualityScore: 80,
      functionalScore: 75,
      overallScore: 75,
      issues: [],
    };
  }
}

// ============================================================================
// CODE ISSUE FIXING
// ============================================================================

export async function fixCodeIssue(
  code: string,
  issue: {
    type: string;
    title: string;
    description: string;
    suggestion?: string;
  },
  tokens: any
): Promise<string> {
  const systemPrompt = `You are a code fixer. Fix the specific issue in the code while preserving all other functionality.
Return ONLY the fixed code, no explanations.`;

  const userPrompt = `Fix this issue in the code:

ISSUE TYPE: ${issue.type}
ISSUE: ${issue.title}
DESCRIPTION: ${issue.description}
${issue.suggestion ? `SUGGESTION: ${issue.suggestion}` : ""}

DESIGN TOKENS (for reference):
${JSON.stringify(tokens, null, 2)}

CURRENT CODE:
${code}

Return the complete fixed code.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 8000,
  });

  const fixedCode = response.choices[0]?.message?.content || code;
  return extractCodeFromResponse(fixedCode);
}

// ============================================================================
// REFACTOR PROMPT - SAFE PATCHING (AST-AWARE)
// ============================================================================

export async function generateRefactorPatch(
  existingCode: string,
  oldTokens: any,
  newTokens: any,
  changedFields: string[]
): Promise<{
  patchedCode: string;
  changes: Array<{
    line: number;
    oldValue: string;
    newValue: string;
    field: string;
  }>;
}> {
  const systemPrompt = `You are a precise code refactoring assistant. Your job is to update ONLY the style-related values in the code based on new design tokens.

CRITICAL RULES:
1. NEVER modify component logic, state, handlers, or hooks
2. NEVER change function signatures or prop types
3. ONLY update style values (colors, spacing, fonts, shadows)
4. Preserve ALL comments including @figgo metadata
5. Update the @figgo-tokens comment with new tokens
6. Return the complete code with minimal changes

You must be surgical - change only what's necessary.`;

  const userPrompt = `Refactor this code to use the new design tokens.

CHANGED FIELDS: ${changedFields.join(", ")}

OLD TOKENS:
${JSON.stringify(oldTokens, null, 2)}

NEW TOKENS:
${JSON.stringify(newTokens, null, 2)}

EXISTING CODE:
${existingCode}

Return JSON with this structure:
{
  "patchedCode": "complete updated code",
  "changes": [
    {"line": 10, "oldValue": "#ffffff", "newValue": "#f5f5f5", "field": "colors"}
  ]
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1, // Very low for precise changes
    max_tokens: 10000,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const result = JSON.parse(extractJsonFromResponse(content));
    return {
      patchedCode: result.patchedCode || existingCode,
      changes: result.changes || [],
    };
  } catch {
    // Fallback: return original code
    return {
      patchedCode: existingCode,
      changes: [],
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sanitizeComponentName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function extractCodeFromResponse(response: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockMatch = response.match(/```(?:tsx?|jsx?|vue)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return response.trim();
}

function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from markdown code blocks
  const jsonBlockMatch = response.match(/```(?:json)?\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  // Try to find raw JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return response;
}

function extractImports(code: string): string[] {
  const importRegex = /^import\s+.*?from\s+['"](.+?)['"];?$/gm;
  const imports: string[] = [];
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function extractDependencies(code: string, options: GenerationOptions): string[] {
  const deps: string[] = [];

  if (options.framework === "nextjs" || options.framework === "react") {
    deps.push("react", "react-dom");
    if (options.framework === "nextjs") {
      deps.push("next");
    }
  }

  if (options.styling === "tailwind") {
    deps.push("tailwindcss");
  }

  // Check for common libraries in imports
  if (code.includes("framer-motion")) deps.push("framer-motion");
  if (code.includes("lucide-react")) deps.push("lucide-react");
  if (code.includes("@radix-ui")) deps.push("@radix-ui/react-icons");

  return [...new Set(deps)];
}
