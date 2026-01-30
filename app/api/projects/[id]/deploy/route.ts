import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { deployProject, rollbackDeployment } from "@/lib/deployment";

// ============================================================================
// POST - Deploy Project to GitHub + Vercel
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
  const body = await request.json();
  const { deploymentType = "preview", branchName } = body;

  // Get project with latest generated code
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get the latest generation log with code
  const generationLog = await prisma.generationLog.findFirst({
    where: {
      projectId,
      step: "code_generation",
      status: "completed",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!generationLog || !generationLog.metadata) {
    return NextResponse.json(
      { error: "No generated code found. Please generate first." },
      { status: 400 }
    );
  }

  const metadata = generationLog.metadata as any;

  // Update project status
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "deploying" },
  });

  try {
    const result = await deployProject({
      projectId,
      userId: session.user.id,
      componentCode: metadata.code,
      componentName: metadata.componentName,
      projectName: project.name,
      framework: project.framework,
      styling: project.styling,
      deploymentType,
      branchName: branchName || (deploymentType === "preview" ? `figgo-sync-${Date.now()}` : undefined),
    });

    if (result.success) {
      // Create notification
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: "deploy_ready",
          title: deploymentType === "preview" ? "Preview Ready" : "Deployed",
          message: `"${project.name}" is ${deploymentType === "preview" ? "ready for preview" : "live"}`,
          projectId,
          actionUrl: result.deploymentUrl,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Rollback Deployment
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get("deploymentId");

  if (!deploymentId) {
    return NextResponse.json(
      { error: "Deployment ID required" },
      { status: 400 }
    );
  }

  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const result = await rollbackDeployment(deploymentId, session.user.id);

  if (result.success) {
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "design_change",
        title: "Deployment Rolled Back",
        message: `Rolled back deployment for "${project.name}"`,
        projectId,
      },
    });
  }

  return NextResponse.json(result);
}

// ============================================================================
// GET - Get Deployment Status
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    select: {
      id: true,
      name: true,
      status: true,
      githubRepoUrl: true,
      deploymentUrl: true,
      vercelProjectId: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const deployments = await prisma.deployment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    project,
    deployments,
  });
}
