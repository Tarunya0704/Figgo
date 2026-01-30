import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// ============================================================================
// GET - List User's Projects
// ============================================================================

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "20");

  const projects = await prisma.project.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
    },
    include: {
      components: {
        select: {
          id: true,
          syncStatus: true,
        },
      },
      _count: {
        select: {
          syncEvents: true,
          deployments: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ projects });
}

// ============================================================================
// POST - Create New Project
// ============================================================================

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, figmaUrl, framework, styling } = body;

  if (!name || !figmaUrl) {
    return NextResponse.json(
      { error: "Name and Figma URL are required" },
      { status: 400 }
    );
  }

  // Parse Figma URL
  const { parseFigmaUrl } = await import("@/lib/figma/service");
  const parsed = parseFigmaUrl(figmaUrl);

  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid Figma URL" },
      { status: 400 }
    );
  }

  // Check user's project limit
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const projectLimit = user.plan === "free" ? 3 : user.plan === "pro" ? 20 : 100;
  if (user.projectsUsed >= projectLimit) {
    return NextResponse.json(
      { error: "Project limit reached. Please upgrade your plan." },
      { status: 403 }
    );
  }

  // Create project
  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name,
      description,
      figmaFileId: parsed.fileKey,
      figmaFileKey: parsed.fileKey,
      figmaNodeId: parsed.nodeId,
      figmaDesignUrl: figmaUrl,
      framework: framework || "nextjs",
      styling: styling || "tailwind",
      status: "pending",
    },
  });

  // Increment user's project count
  await prisma.user.update({
    where: { id: session.user.id },
    data: { projectsUsed: { increment: 1 } },
  });

  return NextResponse.json({ project }, { status: 201 });
}
