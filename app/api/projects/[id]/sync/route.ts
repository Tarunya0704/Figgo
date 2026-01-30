import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { getFigmaIntegration } from "@/lib/figma/oauth";
import { FigmaService } from "@/lib/figma/service";

// ============================================================================
// GET - Get Sync Status for a Project
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get project with components and recent sync events
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: user.id,
    },
    include: {
      components: {
        select: {
          id: true,
          figmaNodeId: true,
          figmaNodeName: true,
          componentName: true,
          syncStatus: true,
          figmaLastModified: true,
          codeLastGenerated: true,
          changeFrequency: true,
        },
      },
      syncEvents: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          eventType: true,
          status: true,
          semanticDiff: true,
          createdAt: true,
          processedAt: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Calculate sync summary
  const syncSummary = {
    totalComponents: project.components.length,
    syncedComponents: project.components.filter(
      (c) => c.syncStatus === "synced"
    ).length,
    outdatedComponents: project.components.filter(
      (c) => c.syncStatus === "outdated"
    ).length,
    conflictComponents: project.components.filter(
      (c) => c.syncStatus === "conflict"
    ).length,
    lastSyncEvent: project.syncEvents[0] || null,
    pendingSyncEvents: project.syncEvents.filter(
      (e) => e.status === "pending" || e.status === "processing"
    ).length,
  };

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      figmaFileKey: project.figmaFileKey,
      figmaNodeId: project.figmaNodeId,
    },
    components: project.components,
    syncEvents: project.syncEvents,
    syncSummary,
  });
}

// ============================================================================
// POST - Manually Trigger Sync for a Project
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: user.id,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
    // Create a manual sync event
    const syncEvent = await prisma.syncEvent.create({
      data: {
        projectId,
        eventType: "FILE_UPDATE",
        eventSource: "manual_trigger",
        status: "pending",
      },
    });

    // Process sync in background
    processManualSync(syncEvent.id, project, integration.accessToken).catch(
      (error) => {
        console.error("Manual sync failed:", error);
      }
    );

    return NextResponse.json({
      success: true,
      syncEventId: syncEvent.id,
      message: "Sync started",
    });
  } catch (error: any) {
    console.error("Failed to start sync:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start sync" },
      { status: 500 }
    );
  }
}

// ============================================================================
// Background Sync Processing
// ============================================================================

async function processManualSync(
  syncEventId: string,
  project: {
    id: string;
    figmaFileKey: string;
    figmaNodeId: string | null;
  },
  accessToken: string
): Promise<void> {
  // Mark as processing
  await prisma.syncEvent.update({
    where: { id: syncEventId },
    data: { status: "processing" },
  });

  try {
    const figmaService = new FigmaService(accessToken);

    // Fetch latest file data
    const fileData = await figmaService.getFile(project.figmaFileKey);

    // Get the target node (or full document)
    let targetNode = fileData.document;
    if (project.figmaNodeId) {
      const nodes = await figmaService.getNodes(project.figmaFileKey, [
        project.figmaNodeId,
      ]);
      if (nodes[project.figmaNodeId]) {
        targetNode = nodes[project.figmaNodeId].document;
      }
    }

    // Extract components and tokens
    const components = figmaService.extractComponents(targetNode);
    const tokens = figmaService.extractDesignTokens(targetNode);

    // Get existing components
    const existingComponents = await prisma.component.findMany({
      where: { projectId: project.id },
    });

    const existingNodeIds = new Set(existingComponents.map((c) => c.figmaNodeId));
    const newNodeIds = new Set(components.map((c) => c.nodeId));

    // Track changes
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    // Add new components
    for (const comp of components) {
      if (!existingNodeIds.has(comp.nodeId)) {
        await prisma.component.create({
          data: {
            projectId: project.id,
            figmaNodeId: comp.nodeId,
            figmaNodeName: comp.name,
            figmaNodeType: comp.type,
            componentName: sanitizeComponentName(comp.name),
            designTokens: tokens,
            figmaLastModified: new Date(),
            syncStatus: "synced",
          },
        });
        added.push(comp.nodeId);
      }
    }

    // Update existing components
    for (const existing of existingComponents) {
      if (!newNodeIds.has(existing.figmaNodeId)) {
        // Component was removed from Figma
        await prisma.component.delete({
          where: { id: existing.id },
        });
        removed.push(existing.figmaNodeId);
      } else {
        // Check for changes
        const currentComp = components.find(
          (c) => c.nodeId === existing.figmaNodeId
        );
        if (currentComp) {
          // Compare and update if needed
          const hasChanges = JSON.stringify(existing.designTokens) !== JSON.stringify(tokens);
          if (hasChanges) {
            await prisma.component.update({
              where: { id: existing.id },
              data: {
                figmaNodeName: currentComp.name,
                designTokens: tokens,
                tokenVersion: { increment: 1 },
                figmaLastModified: new Date(),
                syncStatus: "synced",
                changeFrequency: { increment: 1 },
              },
            });
            modified.push(existing.figmaNodeId);
          }
        }
      }
    }

    // Update sync event
    await prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: "completed",
        processedAt: new Date(),
        semanticDiff: { added, modified, removed },
        actionsTriggered: {
          componentsAdded: added.length,
          componentsModified: modified.length,
          componentsRemoved: removed.length,
        },
      },
    });

    console.log(
      `[Manual Sync] Completed for project ${project.id}:`,
      { added: added.length, modified: modified.length, removed: removed.length }
    );
  } catch (error: any) {
    console.error(`[Manual Sync] Failed for project ${project.id}:`, error);

    await prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: "failed",
        errorMessage: error.message,
      },
    });
  }
}

function sanitizeComponentName(name: string): string {
  // Convert Figma name to valid React component name
  return name
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^(\d)/, "_$1")
    .replace(/^(.)/, (c) => c.toUpperCase());
}
