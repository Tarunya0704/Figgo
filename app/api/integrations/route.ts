import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ============================================================================
// GET - Get All Integration Statuses
// ============================================================================

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.integration.findMany({
    where: { userId: session.user.id },
    select: {
      provider: true,
      scope: true,
      expiresAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Transform to a map by provider
  const integrationMap: Record<string, any> = {};

  for (const integration of integrations) {
    const metadata = integration.metadata as any;

    integrationMap[integration.provider] = {
      connected: true,
      scope: integration.scope,
      expiresAt: integration.expiresAt,
      connectedAt: integration.createdAt,
      // Provider-specific display info
      ...(integration.provider === "figma" && {
        displayName: metadata?.handle || metadata?.email || "Figma User",
        avatar: metadata?.img_url,
      }),
      ...(integration.provider === "github" && {
        displayName: metadata?.login || "GitHub User",
        avatar: metadata?.avatar_url,
        name: metadata?.name,
      }),
      ...(integration.provider === "vercel" && {
        displayName: metadata?.username || "Vercel User",
        avatar: metadata?.avatar,
        email: metadata?.email,
        teams: metadata?.teams || [],
      }),
    };
  }

  // Add disconnected status for missing integrations
  const allProviders = ["figma", "github", "vercel"];
  for (const provider of allProviders) {
    if (!integrationMap[provider]) {
      integrationMap[provider] = { connected: false };
    }
  }

  return NextResponse.json({ integrations: integrationMap });
}

// ============================================================================
// DELETE - Disconnect an Integration
// ============================================================================

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (!provider || !["figma", "github", "vercel"].includes(provider)) {
    return NextResponse.json(
      { error: "Invalid provider" },
      { status: 400 }
    );
  }

  await prisma.integration.deleteMany({
    where: {
      userId: session.user.id,
      provider,
    },
  });

  return NextResponse.json({ success: true });
}
