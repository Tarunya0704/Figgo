import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import type { WebhookEventType, WebhookPayload, WebhookRegistration } from "./types";

// ============================================================================
// FIGMA WEBHOOK SERVICE
// ============================================================================

export class FigmaWebhookService {
  private client: AxiosInstance;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.client = axios.create({
      baseURL: "https://api.figma.com/v2",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    this.userId = userId;
  }

  // ==========================================================================
  // WEBHOOK REGISTRATION
  // ==========================================================================

  /**
   * Register a new webhook for a Figma team
   */
  async registerWebhook(
    teamId: string,
    eventType: WebhookEventType,
    endpoint: string,
    description: string = "Figgo Pro Sync Webhook"
  ): Promise<WebhookRegistration> {
    // Generate a secure passcode
    const passcode = crypto.randomBytes(32).toString("hex");

    try {
      const response = await this.client.post<WebhookRegistration>("/webhooks", {
        event_type: eventType,
        team_id: teamId,
        endpoint,
        passcode,
        description,
      });

      // Store webhook in database
      await prisma.figmaWebhook.create({
        data: {
          userId: this.userId,
          webhookId: response.data.id,
          teamId,
          endpoint,
          passcode,
          eventTypes: [eventType],
          status: "active",
        },
      });

      return response.data;
    } catch (error: any) {
      console.error("Failed to register webhook:", error.response?.data || error.message);
      throw new Error(`Failed to register Figma webhook: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Register all essential webhooks for sync
   */
  async registerSyncWebhooks(teamId: string, baseEndpoint: string): Promise<WebhookRegistration[]> {
    const eventTypes: WebhookEventType[] = [
      "FILE_UPDATE",
      "FILE_VERSION_UPDATE",
      "LIBRARY_PUBLISH",
    ];

    const registrations: WebhookRegistration[] = [];

    for (const eventType of eventTypes) {
      const endpoint = `${baseEndpoint}/api/webhooks/figma`;
      const registration = await this.registerWebhook(
        teamId,
        eventType,
        endpoint,
        `Figgo Pro - ${eventType}`
      );
      registrations.push(registration);
    }

    return registrations;
  }

  // ==========================================================================
  // WEBHOOK MANAGEMENT
  // ==========================================================================

  /**
   * List all webhooks for a team
   */
  async listWebhooks(teamId: string): Promise<{ webhooks: WebhookRegistration[] }> {
    const response = await this.client.get(`/teams/${teamId}/webhooks`);
    return response.data;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.client.delete(`/webhooks/${webhookId}`);

    // Remove from database
    await prisma.figmaWebhook.deleteMany({
      where: {
        webhookId,
        userId: this.userId,
      },
    });
  }

  /**
   * Update webhook status
   */
  async updateWebhookStatus(
    webhookId: string,
    status: "ACTIVE" | "PAUSED"
  ): Promise<WebhookRegistration> {
    const response = await this.client.put<WebhookRegistration>(`/webhooks/${webhookId}`, {
      status,
    });

    // Update database
    await prisma.figmaWebhook.updateMany({
      where: { webhookId },
      data: { status: status.toLowerCase() },
    });

    return response.data;
  }

  // ==========================================================================
  // WEBHOOK REQUESTS (Send test events)
  // ==========================================================================

  /**
   * Send a ping to verify webhook is working
   */
  async pingWebhook(webhookId: string): Promise<void> {
    await this.client.post(`/webhooks/${webhookId}/requests`);
  }
}

// ============================================================================
// WEBHOOK PAYLOAD VALIDATION
// ============================================================================

/**
 * Validate incoming webhook payload
 */
export function validateWebhookPayload(
  payload: WebhookPayload,
  storedPasscode: string
): boolean {
  return payload.passcode === storedPasscode;
}

/**
 * Get stored webhook by ID
 */
export async function getStoredWebhook(webhookId: string) {
  return prisma.figmaWebhook.findUnique({
    where: { webhookId },
    include: {
      user: {
        select: { id: true, email: true },
      },
    },
  });
}

/**
 * Get webhooks by team ID
 */
export async function getWebhooksByTeam(teamId: string) {
  return prisma.figmaWebhook.findMany({
    where: { teamId },
  });
}

// ============================================================================
// WEBHOOK EVENT PROCESSOR
// ============================================================================

export interface ProcessedWebhookEvent {
  type: WebhookEventType;
  fileKey?: string;
  fileName?: string;
  triggeredBy?: { id: string; handle: string };
  timestamp: Date;
  changes?: {
    type: "file_update" | "version_update" | "library_publish" | "comment" | "ping";
    details: Record<string, any>;
  };
}

/**
 * Process and normalize webhook payload
 */
export function processWebhookPayload(payload: WebhookPayload): ProcessedWebhookEvent {
  const event: ProcessedWebhookEvent = {
    type: payload.event_type,
    fileKey: payload.file_key,
    fileName: payload.file_name,
    triggeredBy: payload.triggered_by,
    timestamp: new Date(payload.timestamp),
  };

  switch (payload.event_type) {
    case "FILE_UPDATE":
      event.changes = {
        type: "file_update",
        details: {
          modifiedAt: payload.modified_at,
        },
      };
      break;

    case "FILE_VERSION_UPDATE":
      event.changes = {
        type: "version_update",
        details: {
          versionId: payload.version_id,
          label: payload.label,
          description: payload.description,
          createdAt: payload.created_at,
        },
      };
      break;

    case "LIBRARY_PUBLISH":
      event.changes = {
        type: "library_publish",
        details: {
          libraryItems: payload.library_items,
        },
      };
      break;

    case "FILE_COMMENT":
      event.changes = {
        type: "comment",
        details: {
          comments: payload.comment,
        },
      };
      break;

    case "PING":
      event.changes = {
        type: "ping",
        details: {
          retries: payload.retries,
        },
      };
      break;
  }

  return event;
}

// ============================================================================
// SYNC EVENT CREATION
// ============================================================================

/**
 * Create a sync event from a webhook payload
 */
export async function createSyncEventFromWebhook(
  projectId: string,
  event: ProcessedWebhookEvent,
  webhookId: string
): Promise<string> {
  const syncEvent = await prisma.syncEvent.create({
    data: {
      projectId,
      eventType: event.type,
      eventSource: "figma_webhook",
      figmaEventId: webhookId + "-" + event.timestamp.toISOString(),
      figmaUserId: event.triggeredBy?.id,
      status: "pending",
      diffSummary: event.changes?.details ? event.changes.details : undefined,
    },
  });

  return syncEvent.id;
}

/**
 * Update webhook last ping time
 */
export async function updateWebhookPing(webhookId: string): Promise<void> {
  await prisma.figmaWebhook.updateMany({
    where: { webhookId },
    data: {
      lastPingAt: new Date(),
      errorCount: 0,
    },
  });
}

/**
 * Record webhook error
 */
export async function recordWebhookError(
  webhookId: string,
  error: string
): Promise<void> {
  await prisma.figmaWebhook.updateMany({
    where: { webhookId },
    data: {
      lastError: error,
      errorCount: { increment: 1 },
    },
  });
}
