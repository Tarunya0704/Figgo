import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { getFigmaIntegration } from "@/lib/figma/oauth";
import { FigmaService } from "@/lib/figma/service";

// ============================================================================
// POST - Selective Component Update (KILLER FEATURE)
// Updates only the selected component without affecting others
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; componentId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, componentId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get component with project
  const component = await prisma.component.findFirst({
    where: {
      id: componentId,
      projectId,
      project: { userId: user.id },
    },
    include: {
      project: true,
    },
  });

  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  // Get Figma integration
  const integration = await getFigmaIntegration(user.id);
  if (!integration) {
    return NextResponse.json(
      { error: "Figma not connected" },
      { status: 400 }
    );
  }

  try {
    const figmaService = new FigmaService(integration.accessToken);

    // Fetch only this specific node from Figma
    const nodes = await figmaService.getNodes(component.project.figmaFileKey, [
      component.figmaNodeId,
    ]);

    const nodeData = nodes[component.figmaNodeId];
    if (!nodeData) {
      return NextResponse.json(
        { error: "Component not found in Figma" },
        { status: 404 }
      );
    }

    // Extract current tokens from Figma
    const currentTokens = figmaService.extractDesignTokens(nodeData.document);

    // Get previous tokens
    const previousTokens = component.designTokens as any || {};

    // Calculate semantic diff
    const diff = calculateSemanticDiff(previousTokens, currentTokens);

    // Create token version for audit trail
    await prisma.designTokenVersion.create({
      data: {
        componentId: component.id,
        version: (component.tokenVersion || 0) + 1,
        tokens: currentTokens,
        changedFields: diff.changedFields,
        changeType: diff.changedFields.length > 0 ? "modified" : "unchanged",
        changeSource: "manual",
      },
    });

    // Update component
    await prisma.component.update({
      where: { id: component.id },
      data: {
        figmaNodeName: nodeData.document.name,
        designTokens: currentTokens,
        tokenVersion: { increment: 1 },
        figmaLastModified: new Date(),
        syncStatus: "synced",
        changeFrequency: { increment: 1 },
      },
    });

    // Create sync event
    await prisma.syncEvent.create({
      data: {
        projectId,
        componentId: component.id,
        eventType: "COMPONENT_CHANGE",
        eventSource: "manual_trigger",
        status: "completed",
        processedAt: new Date(),
        semanticDiff: diff,
      },
    });

    // Create notification if there were significant changes
    if (diff.changedFields.length > 0) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "design_change",
          title: "Component Updated",
          message: `"${component.figmaNodeName}" synced with ${diff.changedFields.length} change(s): ${diff.changedFields.join(", ")}`,
          projectId,
          componentId: component.id,
          actionUrl: `/dashboard/projects/${projectId}/components/${componentId}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      component: {
        id: component.id,
        name: nodeData.document.name,
        syncStatus: "synced",
        tokenVersion: (component.tokenVersion || 0) + 1,
      },
      diff,
      message: diff.changedFields.length > 0
        ? `Updated with changes: ${diff.changedFields.join(", ")}`
        : "No changes detected",
    });
  } catch (error: any) {
    console.error("Failed to update component:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update component" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - Get Component Diff Preview
// Shows what would change if the component is updated
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; componentId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, componentId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get component with project
  const component = await prisma.component.findFirst({
    where: {
      id: componentId,
      projectId,
      project: { userId: user.id },
    },
    include: {
      project: true,
      tokenVersions: {
        orderBy: { version: "desc" },
        take: 5,
      },
    },
  });

  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  // Get Figma integration
  const integration = await getFigmaIntegration(user.id);
  if (!integration) {
    return NextResponse.json(
      { error: "Figma not connected" },
      { status: 400 }
    );
  }

  try {
    const figmaService = new FigmaService(integration.accessToken);

    // Fetch current state from Figma
    const nodes = await figmaService.getNodes(component.project.figmaFileKey, [
      component.figmaNodeId,
    ]);

    const nodeData = nodes[component.figmaNodeId];
    if (!nodeData) {
      return NextResponse.json(
        { error: "Component not found in Figma" },
        { status: 404 }
      );
    }

    // Extract current tokens from Figma
    const figmaTokens = figmaService.extractDesignTokens(nodeData.document);

    // Get stored tokens
    const storedTokens = component.designTokens as any || {};

    // Calculate diff
    const diff = calculateSemanticDiff(storedTokens, figmaTokens);

    return NextResponse.json({
      component: {
        id: component.id,
        name: component.figmaNodeName,
        syncStatus: component.syncStatus,
        tokenVersion: component.tokenVersion,
        lastModified: component.figmaLastModified,
      },
      storedTokens,
      figmaTokens,
      diff,
      history: component.tokenVersions,
      needsUpdate: diff.changedFields.length > 0,
    });
  } catch (error: any) {
    console.error("Failed to preview component diff:", error);
    return NextResponse.json(
      { error: error.message || "Failed to preview diff" },
      { status: 500 }
    );
  }
}

// ============================================================================
// SEMANTIC DIFF CALCULATOR
// ============================================================================

interface SemanticDiff {
  changedFields: string[];
  colors: {
    added: string[];
    removed: string[];
    modified: Array<{ from: string; to: string }>;
  };
  typography: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  spacing: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  shadows: {
    added: number;
    removed: number;
    modified: number;
  };
  borders: {
    added: number;
    removed: number;
    modified: number;
  };
}

function calculateSemanticDiff(
  oldTokens: any,
  newTokens: any
): SemanticDiff {
  const diff: SemanticDiff = {
    changedFields: [],
    colors: { added: [], removed: [], modified: [] },
    typography: { added: [], removed: [], modified: [] },
    spacing: { added: [], removed: [], modified: [] },
    shadows: { added: 0, removed: 0, modified: 0 },
    borders: { added: 0, removed: 0, modified: 0 },
  };

  // Compare colors
  const oldColors = new Map(
    (oldTokens.colors || []).map((c: any) => [c.hex.toLowerCase(), c])
  );
  const newColors = new Map(
    (newTokens.colors || []).map((c: any) => [c.hex.toLowerCase(), c])
  );

  for (const [hex, color] of newColors) {
    if (!oldColors.has(hex)) {
      diff.colors.added.push(hex);
    }
  }

  for (const [hex, color] of oldColors) {
    if (!newColors.has(hex)) {
      diff.colors.removed.push(hex);
    }
  }

  if (diff.colors.added.length > 0 || diff.colors.removed.length > 0) {
    diff.changedFields.push("colors");
  }

  // Compare typography
  const oldTypo = new Map(
    (oldTokens.typography || []).map((t: any) => [
      `${t.fontFamily}-${t.fontSize}-${t.fontWeight}`,
      t,
    ])
  );
  const newTypo = new Map(
    (newTokens.typography || []).map((t: any) => [
      `${t.fontFamily}-${t.fontSize}-${t.fontWeight}`,
      t,
    ])
  );

  for (const [key] of newTypo) {
    if (!oldTypo.has(key)) {
      diff.typography.added.push(key);
    }
  }

  for (const [key] of oldTypo) {
    if (!newTypo.has(key)) {
      diff.typography.removed.push(key);
    }
  }

  if (diff.typography.added.length > 0 || diff.typography.removed.length > 0) {
    diff.changedFields.push("typography");
  }

  // Compare spacing
  const oldSpacing = new Set(
    (oldTokens.spacing || []).map((s: any) => `${s.type}-${s.value}`)
  );
  const newSpacing = new Set(
    (newTokens.spacing || []).map((s: any) => `${s.type}-${s.value}`)
  );

  for (const key of newSpacing) {
    if (!oldSpacing.has(key)) {
      diff.spacing.added.push(key);
    }
  }

  for (const key of oldSpacing) {
    if (!newSpacing.has(key)) {
      diff.spacing.removed.push(key);
    }
  }

  if (diff.spacing.added.length > 0 || diff.spacing.removed.length > 0) {
    diff.changedFields.push("spacing");
  }

  // Compare shadows (simplified)
  const oldShadowCount = (oldTokens.shadows || []).length;
  const newShadowCount = (newTokens.shadows || []).length;

  if (oldShadowCount !== newShadowCount) {
    diff.shadows.added = Math.max(0, newShadowCount - oldShadowCount);
    diff.shadows.removed = Math.max(0, oldShadowCount - newShadowCount);
    diff.changedFields.push("shadows");
  }

  // Compare borders (simplified)
  const oldBorderCount = (oldTokens.borders || []).length;
  const newBorderCount = (newTokens.borders || []).length;

  if (oldBorderCount !== newBorderCount) {
    diff.borders.added = Math.max(0, newBorderCount - oldBorderCount);
    diff.borders.removed = Math.max(0, oldBorderCount - newBorderCount);
    diff.changedFields.push("borders");
  }

  return diff;
}
