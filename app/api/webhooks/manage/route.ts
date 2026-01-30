import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { getFigmaIntegration } from "@/lib/figma/oauth";
import { FigmaWebhookService } from "@/lib/figma/webhooks";

// ============================================================================
// GET - List User's Webhooks
// ============================================================================

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const webhooks = await prisma.figmaWebhook.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      webhookId: true,
      teamId: true,
      status: true,
      eventTypes: true,
      lastPingAt: true,
      errorCount: true,
      lastError: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ webhooks });
}

// ============================================================================
// POST - Register New Webhook
// ============================================================================

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get Figma integration
  const integration = await getFigmaIntegration(user.id);
  if (!integration) {
    return NextResponse.json(
      { error: "Figma not connected" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { teamId } = body;

  if (!teamId) {
    return NextResponse.json(
      { error: "Team ID is required" },
      { status: 400 }
    );
  }

  try {
    const webhookService = new FigmaWebhookService(
      integration.accessToken,
      user.id
    );

    // Get the base URL for our webhook endpoint
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Register webhooks for sync events
    const registrations = await webhookService.registerSyncWebhooks(
      teamId,
      baseUrl
    );

    return NextResponse.json({
      success: true,
      webhooks: registrations.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        status: r.status,
      })),
    });
  } catch (error: any) {
    console.error("Failed to register webhooks:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register webhooks" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Remove Webhook
// ============================================================================

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const webhookId = searchParams.get("webhookId");

  if (!webhookId) {
    return NextResponse.json(
      { error: "Webhook ID is required" },
      { status: 400 }
    );
  }

  // Verify webhook belongs to user
  const webhook = await prisma.figmaWebhook.findFirst({
    where: {
      webhookId,
      userId: user.id,
    },
  });

  if (!webhook) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
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
    const webhookService = new FigmaWebhookService(
      integration.accessToken,
      user.id
    );

    await webhookService.deleteWebhook(webhookId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete webhook:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
