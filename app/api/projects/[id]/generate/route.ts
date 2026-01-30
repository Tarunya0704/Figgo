import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getFigmaIntegration } from "@/lib/figma/oauth";
import { FigmaService } from "@/lib/figma/service";
import { generateCodeFromDesign, analyzeDesignQuality } from "@/lib/ai/groq";

// ============================================================================
// POST - Generate Code from Figma Design
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Get project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get Figma integration
  const integration = await getFigmaIntegration(session.user.id);
  if (!integration) {
    return NextResponse.json(
      { error: "Figma not connected" },
      { status: 400 }
    );
  }

  // Update status to generating
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "generating", progress: 10 },
  });

  // Start generation in background
  generateCode(projectId, project, integration.accessToken, session.user.id).catch(
    (error) => {
      console.error("Generation failed:", error);
      prisma.project.update({
        where: { id: projectId },
        data: { status: "failed" },
      });
    }
  );

  return NextResponse.json({
    success: true,
    message: "Generation started",
    projectId,
  });
}

// ============================================================================
// Background Generation Process
// ============================================================================

async function generateCode(
  projectId: string,
  project: {
    figmaFileKey: string;
    figmaNodeId: string | null;
    name: string;
    framework: string;
    styling: string;
  },
  accessToken: string,
  userId: string
): Promise<void> {
  const figmaService = new FigmaService(accessToken);

  try {
    // Step 1: Fetch Figma file (20%)
    await updateProgress(projectId, 20, "Fetching design from Figma...");

    const fileData = await figmaService.getFile(project.figmaFileKey);

    // Step 2: Get target node (30%)
    await updateProgress(projectId, 30, "Extracting design structure...");

    let targetNode = fileData.document;
    if (project.figmaNodeId) {
      const nodes = await figmaService.getNodes(project.figmaFileKey, [
        project.figmaNodeId,
      ]);
      if (nodes[project.figmaNodeId]) {
        targetNode = nodes[project.figmaNodeId].document;
      }
    }

    // Step 3: Extract design tokens (40%)
    await updateProgress(projectId, 40, "Extracting design tokens...");

    const tokens = figmaService.extractDesignTokens(targetNode);
    const components = figmaService.extractComponents(targetNode);

    // Step 4: Get preview image (50%)
    await updateProgress(projectId, 50, "Generating preview...");

    let imageUrl: string | undefined;
    if (project.figmaNodeId) {
      const images = await figmaService.getImages(project.figmaFileKey, [
        project.figmaNodeId,
      ]);
      imageUrl = images[project.figmaNodeId];
    }

    // Step 5: Generate code with AI (70%)
    await updateProgress(projectId, 70, "Generating code with AI...");

    const generated = await generateCodeFromDesign(
      {
        nodeId: project.figmaNodeId || "root",
        nodeName: targetNode.name || project.name,
        nodeType: targetNode.type || "FRAME",
        imageUrl,
        tokens,
        structure: {
          name: targetNode.name,
          type: targetNode.type,
          children: targetNode.children?.map((c: any) => ({
            name: c.name,
            type: c.type,
          })),
        },
      },
      {
        framework: project.framework as any,
        styling: project.styling as any,
        typescript: true,
      }
    );

    // Step 6: Analyze quality (85%)
    await updateProgress(projectId, 85, "Analyzing code quality...");

    const quality = await analyzeDesignQuality(
      { tokens, imageUrl },
      generated.code
    );

    // Step 7: Save components to registry (90%)
    await updateProgress(projectId, 90, "Registering components...");

    // Create component entries
    for (const comp of components) {
      await prisma.component.upsert({
        where: {
          projectId_figmaNodeId: {
            projectId,
            figmaNodeId: comp.nodeId,
          },
        },
        update: {
          figmaNodeName: comp.name,
          figmaNodeType: comp.type,
          designTokens: tokens,
          figmaLastModified: new Date(),
          syncStatus: "synced",
        },
        create: {
          projectId,
          figmaNodeId: comp.nodeId,
          figmaNodeName: comp.name,
          figmaNodeType: comp.type,
          componentName: generated.componentName,
          designTokens: tokens,
          figmaLastModified: new Date(),
          syncStatus: "synced",
        },
      });
    }

    // Step 8: Final update (100%)
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "review",
        progress: 100,
        figmaImageUrl: imageUrl,
        visualMatchScore: quality.visualMatchScore,
        codeQualityScore: quality.codeQualityScore,
        functionalScore: quality.functionalScore,
      },
    });

    // Store generated code (in a real app, this would go to a separate table or file storage)
    // For now, we'll create a GenerationLog entry
    await prisma.generationLog.create({
      data: {
        projectId,
        step: "code_generation",
        status: "completed",
        message: "Code generated successfully",
        metadata: {
          componentName: generated.componentName,
          code: generated.code,
          imports: generated.imports,
          dependencies: generated.dependencies,
          quality,
        },
      },
    });

    // Create issues from quality analysis
    for (const issue of quality.issues) {
      await prisma.projectIssue.create({
        data: {
          projectId,
          type: issue.type,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
        },
      });
    }

    // Create notification
    await prisma.notification.create({
      data: {
        userId,
        type: "sync_complete",
        title: "Code Generated",
        message: `"${project.name}" is ready for review with ${quality.overallScore}% quality score`,
        projectId,
        actionUrl: `/dashboard/projects/${projectId}/review`,
      },
    });

    console.log(`[Generation] Completed for project ${projectId}`);
  } catch (error: any) {
    console.error(`[Generation] Failed for project ${projectId}:`, error);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "failed",
      },
    });

    await prisma.generationLog.create({
      data: {
        projectId,
        step: "code_generation",
        status: "failed",
        message: error.message,
      },
    });

    throw error;
  }
}

async function updateProgress(
  projectId: string,
  progress: number,
  message: string
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress },
  });

  await prisma.generationLog.create({
    data: {
      projectId,
      step: "progress_update",
      status: "in_progress",
      message,
      metadata: { progress },
    },
  });
}
