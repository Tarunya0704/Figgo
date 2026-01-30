import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  validateWebhookPayload,
  getWebhooksByTeam,
  processWebhookPayload,
  createSyncEventFromWebhook,
  updateWebhookPing,
  recordWebhookError,
} from "@/lib/figma/webhooks";
import type { WebhookPayload } from "@/lib/figma/types";

// ============================================================================
// POST - Receive Figma Webhook Events
// ============================================================================

export async function POST(request: NextRequest) {
  let payload: WebhookPayload;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse webhook payload:", error);
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  console.log(`[Figma Webhook] Received event: ${payload.event_type}`, {
    webhookId: payload.webhook_id,
    fileKey: payload.file_key,
    timestamp: payload.timestamp,
  });

  // Validate webhook exists and passcode matches
  const storedWebhook = await prisma.figmaWebhook.findUnique({
    where: { webhookId: payload.webhook_id },
  });

  if (!storedWebhook) {
    console.error(`[Figma Webhook] Unknown webhook ID: ${payload.webhook_id}`);
    return NextResponse.json(
      { error: "Unknown webhook" },
      { status: 404 }
    );
  }

  if (!validateWebhookPayload(payload, storedWebhook.passcode)) {
    console.error(`[Figma Webhook] Invalid passcode for webhook: ${payload.webhook_id}`);
    await recordWebhookError(payload.webhook_id, "Invalid passcode");
    return NextResponse.json(
      { error: "Invalid passcode" },
      { status: 401 }
    );
  }

  // Handle PING events (webhook health check)
  if (payload.event_type === "PING") {
    console.log(`[Figma Webhook] PING received for webhook: ${payload.webhook_id}`);
    await updateWebhookPing(payload.webhook_id);
    return NextResponse.json({ status: "ok", type: "pong" });
  }

  try {
    // Process the webhook payload
    const event = processWebhookPayload(payload);

    // Find affected projects
    const affectedProjects = await findAffectedProjects(
      payload.file_key,
      storedWebhook.userId
    );

    if (affectedProjects.length === 0) {
      console.log(
        `[Figma Webhook] No projects found for file: ${payload.file_key}`
      );
      // Still acknowledge the webhook
      return NextResponse.json({
        status: "ok",
        message: "No projects affected",
      });
    }

    // Create sync events for each affected project
    const syncEventIds: string[] = [];
    for (const project of affectedProjects) {
      const syncEventId = await createSyncEventFromWebhook(
        project.id,
        event,
        payload.webhook_id
      );
      syncEventIds.push(syncEventId);

      console.log(
        `[Figma Webhook] Created sync event ${syncEventId} for project ${project.name}`
      );
    }

    // Update webhook last ping time
    await updateWebhookPing(payload.webhook_id);

    // Queue the sync events for processing (async)
    // In production, this would be a job queue (Bull, SQS, etc.)
    for (const syncEventId of syncEventIds) {
      processSyncEvent(syncEventId).catch((error) => {
        console.error(`[Figma Webhook] Error processing sync event ${syncEventId}:`, error);
      });
    }

    return NextResponse.json({
      status: "ok",
      message: `Created ${syncEventIds.length} sync event(s)`,
      syncEventIds,
    });
  } catch (error: any) {
    console.error("[Figma Webhook] Error processing webhook:", error);
    await recordWebhookError(payload.webhook_id, error.message);

    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find all projects that are linked to a Figma file
 */
async function findAffectedProjects(
  fileKey: string | undefined,
  userId: string
) {
  if (!fileKey) return [];

  return prisma.project.findMany({
    where: {
      userId,
      figmaFileKey: fileKey,
    },
    select: {
      id: true,
      name: true,
      figmaNodeId: true,
    },
  });
}

/**
 * Process a sync event (async background task)
 * In production, this would be handled by a job queue
 */
async function processSyncEvent(syncEventId: string): Promise<void> {
  // Mark as processing
  await prisma.syncEvent.update({
    where: { id: syncEventId },
    data: { status: "processing" },
  });

  try {
    const syncEvent = await prisma.syncEvent.findUnique({
      where: { id: syncEventId },
      include: {
        project: {
          include: {
            user: true,
            components: true,
          },
        },
      },
    });

    if (!syncEvent || !syncEvent.project) {
      throw new Error("Sync event or project not found");
    }

    // Get Figma integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId: syncEvent.project.userId,
          provider: "figma",
        },
      },
    });

    if (!integration) {
      throw new Error("Figma integration not found");
    }

    // Import FigmaService dynamically to avoid circular deps
    const { FigmaService } = await import("@/lib/figma/service");
    const figmaService = new FigmaService(integration.accessToken);

    // Fetch latest file data
    const fileData = await figmaService.getFile(syncEvent.project.figmaFileKey);

    // Detect changes by comparing with stored components
    const changes = await detectComponentChanges(
      syncEvent.project.id,
      syncEvent.project.components,
      fileData,
      figmaService
    );

    // Update sync event with diff summary
    await prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: "completed",
        processedAt: new Date(),
        semanticDiff: changes,
        actionsTriggered: {
          componentsUpdated: changes.modified.length,
          componentsAdded: changes.added.length,
          componentsRemoved: changes.removed.length,
        },
      },
    });

    // Create notifications for significant changes
    if (changes.modified.length > 0 || changes.added.length > 0) {
      await prisma.notification.create({
        data: {
          userId: syncEvent.project.userId,
          type: "design_change",
          title: "Design Updated",
          message: `${changes.modified.length} component(s) modified, ${changes.added.length} added in "${syncEvent.project.name}"`,
          projectId: syncEvent.project.id,
          actionUrl: `/dashboard/projects/${syncEvent.project.id}/sync`,
        },
      });
    }

    console.log(
      `[Figma Webhook] Sync event ${syncEventId} completed:`,
      changes
    );
  } catch (error: any) {
    console.error(`[Figma Webhook] Sync event ${syncEventId} failed:`, error);

    await prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: "failed",
        errorMessage: error.message,
      },
    });
  }
}

/**
 * Detect changes between stored components and current Figma state
 */
async function detectComponentChanges(
  projectId: string,
  storedComponents: Array<{
    id: string;
    figmaNodeId: string;
    figmaNodeName: string;
    designTokens: any;
  }>,
  fileData: any,
  figmaService: any
): Promise<{
  added: Array<{ nodeId: string; name: string }>;
  modified: Array<{ nodeId: string; name: string; changes: string[] }>;
  removed: Array<{ nodeId: string; name: string }>;
}> {
  const changes = {
    added: [] as Array<{ nodeId: string; name: string }>,
    modified: [] as Array<{ nodeId: string; name: string; changes: string[] }>,
    removed: [] as Array<{ nodeId: string; name: string }>,
  };

  // Extract current components from file
  const currentComponents = figmaService.extractComponents(fileData.document);
  const currentNodeIds = new Set(currentComponents.map((c: any) => c.nodeId));
  const storedNodeIds = new Set(storedComponents.map((c) => c.figmaNodeId));

  // Find added components
  for (const current of currentComponents) {
    if (!storedNodeIds.has(current.nodeId)) {
      changes.added.push({
        nodeId: current.nodeId,
        name: current.name,
      });
    }
  }

  // Find removed components
  for (const stored of storedComponents) {
    if (!currentNodeIds.has(stored.figmaNodeId)) {
      changes.removed.push({
        nodeId: stored.figmaNodeId,
        name: stored.figmaNodeName,
      });
    }
  }

  // Find modified components (compare tokens)
  for (const stored of storedComponents) {
    const current = currentComponents.find(
      (c: any) => c.nodeId === stored.figmaNodeId
    );

    if (current) {
      // Get nodes to extract current tokens
      const nodes = await figmaService.getNodes(
        fileData.name,
        [current.nodeId]
      );

      if (nodes[current.nodeId]) {
        const currentTokens = figmaService.extractDesignTokens(
          nodes[current.nodeId].document
        );

        const tokenChanges = compareTokens(
          stored.designTokens || {},
          currentTokens
        );

        if (tokenChanges.length > 0) {
          changes.modified.push({
            nodeId: current.nodeId,
            name: current.name,
            changes: tokenChanges,
          });

          // Update component in database
          await prisma.component.update({
            where: { id: stored.id },
            data: {
              designTokens: currentTokens,
              tokenVersion: { increment: 1 },
              figmaLastModified: new Date(),
              syncStatus: "outdated",
              changeFrequency: { increment: 1 },
            },
          });

          // Create token version record
          await prisma.designTokenVersion.create({
            data: {
              componentId: stored.id,
              version:
                ((stored as any).tokenVersion || 0) + 1,
              tokens: currentTokens,
              changedFields: tokenChanges,
              changeType: "modified",
              changeSource: "figma_webhook",
            },
          });
        }
      }
    }
  }

  return changes;
}

/**
 * Compare two token sets and return list of changed fields
 */
function compareTokens(oldTokens: any, newTokens: any): string[] {
  const changes: string[] = [];

  // Compare colors
  const oldColors = new Set(
    (oldTokens.colors || []).map((c: any) => c.hex)
  );
  const newColors = new Set(
    (newTokens.colors || []).map((c: any) => c.hex)
  );

  if (!setsEqual(oldColors, newColors)) {
    changes.push("colors");
  }

  // Compare typography
  const oldTypo = JSON.stringify(oldTokens.typography || []);
  const newTypo = JSON.stringify(newTokens.typography || []);

  if (oldTypo !== newTypo) {
    changes.push("typography");
  }

  // Compare spacing
  const oldSpacing = JSON.stringify(oldTokens.spacing || []);
  const newSpacing = JSON.stringify(newTokens.spacing || []);

  if (oldSpacing !== newSpacing) {
    changes.push("spacing");
  }

  // Compare shadows
  const oldShadows = JSON.stringify(oldTokens.shadows || []);
  const newShadows = JSON.stringify(newTokens.shadows || []);

  if (oldShadows !== newShadows) {
    changes.push("shadows");
  }

  // Compare borders
  const oldBorders = JSON.stringify(oldTokens.borders || []);
  const newBorders = JSON.stringify(newTokens.borders || []);

  if (oldBorders !== newBorders) {
    changes.push("borders");
  }

  return changes;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
