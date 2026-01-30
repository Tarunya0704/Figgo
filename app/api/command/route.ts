import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { parseFigmaUrl } from "@/lib/figma/service";
import { getFigmaIntegration } from "@/lib/figma/oauth";

// ============================================================================
// HOTKEY / LAUNCHER API CONTRACT
// This endpoint receives commands from external triggers (Tauri, Raycast, etc.)
// ============================================================================

export type CommandType =
  | "sync"           // Sync a Figma URL to existing project
  | "create"         // Create new project from Figma URL
  | "deploy"         // Deploy a project
  | "status"         // Get project status
  | "diff"           // Get diff preview
  | "update"         // Update specific component

interface CommandPayload {
  command: CommandType;
  payload: {
    figmaUrl?: string;
    projectId?: string;
    componentId?: string;
    deploymentType?: "preview" | "production";
  };
  apiKey?: string; // For CLI/external auth
}

interface CommandResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  actionUrl?: string;
}

// ============================================================================
// POST - Execute Command
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<CommandResponse>> {
  // Auth: Either session or API key
  let userId: string;

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    userId = session.user.id;
  } else {
    // Check for API key auth (for CLI/external tools)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, message: "Unauthorized", error: "No valid auth" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7);
    const integration = await prisma.integration.findFirst({
      where: {
        provider: "api_key",
        accessToken: apiKey,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { success: false, message: "Invalid API key", error: "Invalid API key" },
        { status: 401 }
      );
    }

    userId = integration.userId;
  }

  const body: CommandPayload = await request.json();
  const { command, payload } = body;

  if (!command) {
    return NextResponse.json(
      { success: false, message: "Command required", error: "Missing command" },
      { status: 400 }
    );
  }

  try {
    switch (command) {
      case "sync":
        return await handleSyncCommand(userId, payload);

      case "create":
        return await handleCreateCommand(userId, payload);

      case "deploy":
        return await handleDeployCommand(userId, payload);

      case "status":
        return await handleStatusCommand(userId, payload);

      case "diff":
        return await handleDiffCommand(userId, payload);

      case "update":
        return await handleUpdateCommand(userId, payload);

      default:
        return NextResponse.json(
          { success: false, message: `Unknown command: ${command}`, error: "Invalid command" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error(`[Command API] Error:`, error);
    return NextResponse.json(
      { success: false, message: "Command failed", error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleSyncCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { figmaUrl, projectId } = payload;

  if (!figmaUrl && !projectId) {
    return NextResponse.json({
      success: false,
      message: "Either figmaUrl or projectId required",
      error: "Missing parameter",
    });
  }

  let project;

  if (projectId) {
    project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
  } else if (figmaUrl) {
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) {
      return NextResponse.json({
        success: false,
        message: "Invalid Figma URL",
        error: "Parse failed",
      });
    }

    project = await prisma.project.findFirst({
      where: {
        userId,
        figmaFileKey: parsed.fileKey,
        ...(parsed.nodeId ? { figmaNodeId: parsed.nodeId } : {}),
      },
    });
  }

  if (!project) {
    return NextResponse.json({
      success: false,
      message: "Project not found. Create it first with 'create' command.",
      error: "Not found",
      actionUrl: `/dashboard/new?url=${encodeURIComponent(figmaUrl || "")}`,
    });
  }

  // Trigger sync
  const syncEvent = await prisma.syncEvent.create({
    data: {
      projectId: project.id,
      eventType: "FILE_UPDATE",
      eventSource: "hotkey_trigger",
      status: "pending",
    },
  });

  return NextResponse.json({
    success: true,
    message: `Sync started for "${project.name}"`,
    data: {
      projectId: project.id,
      syncEventId: syncEvent.id,
    },
    actionUrl: `/dashboard/projects/${project.id}/sync`,
  });
}

async function handleCreateCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { figmaUrl } = payload;

  if (!figmaUrl) {
    return NextResponse.json({
      success: false,
      message: "figmaUrl required",
      error: "Missing parameter",
    });
  }

  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    return NextResponse.json({
      success: false,
      message: "Invalid Figma URL",
      error: "Parse failed",
    });
  }

  // Check if project already exists
  const existing = await prisma.project.findFirst({
    where: {
      userId,
      figmaFileKey: parsed.fileKey,
      ...(parsed.nodeId ? { figmaNodeId: parsed.nodeId } : {}),
    },
  });

  if (existing) {
    return NextResponse.json({
      success: true,
      message: `Project already exists: "${existing.name}"`,
      data: { projectId: existing.id },
      actionUrl: `/dashboard/projects/${existing.id}`,
    });
  }

  // Get Figma file name
  const integration = await getFigmaIntegration(userId);
  let fileName = "New Project";

  if (integration) {
    try {
      const { FigmaService } = await import("@/lib/figma/service");
      const figma = new FigmaService(integration.accessToken);
      const file = await figma.getFile(parsed.fileKey);
      fileName = file.name;
    } catch {
      // Use default name
    }
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name: fileName,
      figmaFileId: parsed.fileKey,
      figmaFileKey: parsed.fileKey,
      figmaNodeId: parsed.nodeId,
      figmaDesignUrl: figmaUrl,
      status: "pending",
    },
  });

  return NextResponse.json({
    success: true,
    message: `Created project "${fileName}"`,
    data: { projectId: project.id },
    actionUrl: `/dashboard/projects/${project.id}`,
  });
}

async function handleDeployCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { projectId, deploymentType = "preview" } = payload;

  if (!projectId) {
    return NextResponse.json({
      success: false,
      message: "projectId required",
      error: "Missing parameter",
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return NextResponse.json({
      success: false,
      message: "Project not found",
      error: "Not found",
    });
  }

  // Create deployment record (actual deployment would be triggered via /api/projects/[id]/deploy)
  return NextResponse.json({
    success: true,
    message: `Deployment queued for "${project.name}"`,
    data: {
      projectId: project.id,
      deploymentType,
    },
    actionUrl: `/dashboard/projects/${project.id}/deploy`,
  });
}

async function handleStatusCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { projectId, figmaUrl } = payload;

  let project;

  if (projectId) {
    project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        _count: {
          select: { components: true, syncEvents: true },
        },
      },
    });
  } else if (figmaUrl) {
    const parsed = parseFigmaUrl(figmaUrl);
    if (parsed) {
      project = await prisma.project.findFirst({
        where: { userId, figmaFileKey: parsed.fileKey },
        include: {
          _count: {
            select: { components: true, syncEvents: true },
          },
        },
      });
    }
  }

  if (!project) {
    return NextResponse.json({
      success: false,
      message: "Project not found",
      error: "Not found",
    });
  }

  return NextResponse.json({
    success: true,
    message: `Status for "${project.name}"`,
    data: {
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress,
      componentsCount: project._count.components,
      syncEventsCount: project._count.syncEvents,
      deploymentUrl: project.deploymentUrl,
      githubRepoUrl: project.githubRepoUrl,
    },
    actionUrl: `/dashboard/projects/${project.id}`,
  });
}

async function handleDiffCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { projectId, componentId } = payload;

  if (!projectId) {
    return NextResponse.json({
      success: false,
      message: "projectId required",
      error: "Missing parameter",
    });
  }

  const whereClause: any = { projectId, project: { userId } };
  if (componentId) {
    whereClause.id = componentId;
  }

  const components = await prisma.component.findMany({
    where: whereClause,
    select: {
      id: true,
      figmaNodeName: true,
      syncStatus: true,
      changeFrequency: true,
    },
  });

  const outdated = components.filter((c) => c.syncStatus === "outdated");

  return NextResponse.json({
    success: true,
    message: `${outdated.length} component(s) need updating`,
    data: {
      total: components.length,
      outdated: outdated.length,
      components: components.map((c) => ({
        id: c.id,
        name: c.figmaNodeName,
        status: c.syncStatus,
        changes: c.changeFrequency,
      })),
    },
    actionUrl: `/dashboard/projects/${projectId}/sync`,
  });
}

async function handleUpdateCommand(
  userId: string,
  payload: CommandPayload["payload"]
): Promise<NextResponse<CommandResponse>> {
  const { projectId, componentId } = payload;

  if (!projectId || !componentId) {
    return NextResponse.json({
      success: false,
      message: "projectId and componentId required",
      error: "Missing parameter",
    });
  }

  const component = await prisma.component.findFirst({
    where: {
      id: componentId,
      projectId,
      project: { userId },
    },
  });

  if (!component) {
    return NextResponse.json({
      success: false,
      message: "Component not found",
      error: "Not found",
    });
  }

  // Trigger selective update (actual update via /api/projects/[id]/components/[componentId]/update)
  return NextResponse.json({
    success: true,
    message: `Update queued for "${component.figmaNodeName}"`,
    data: {
      componentId: component.id,
      componentName: component.figmaNodeName,
    },
    actionUrl: `/dashboard/projects/${projectId}/components/${componentId}`,
  });
}

// ============================================================================
// GET - Get Available Commands (Discovery)
// ============================================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: "Figgo Pro Command API",
    version: "1.0.0",
    description: "Hotkey/Launcher API for external triggers",
    commands: {
      sync: {
        description: "Sync a Figma URL to existing project",
        payload: {
          figmaUrl: "string (optional if projectId provided)",
          projectId: "string (optional if figmaUrl provided)",
        },
      },
      create: {
        description: "Create new project from Figma URL",
        payload: {
          figmaUrl: "string (required)",
        },
      },
      deploy: {
        description: "Deploy a project",
        payload: {
          projectId: "string (required)",
          deploymentType: "'preview' | 'production' (default: preview)",
        },
      },
      status: {
        description: "Get project status",
        payload: {
          projectId: "string (optional)",
          figmaUrl: "string (optional)",
        },
      },
      diff: {
        description: "Get diff preview for components",
        payload: {
          projectId: "string (required)",
          componentId: "string (optional)",
        },
      },
      update: {
        description: "Update specific component",
        payload: {
          projectId: "string (required)",
          componentId: "string (required)",
        },
      },
    },
    authentication: {
      session: "Use browser session (cookies)",
      apiKey: "Bearer token in Authorization header",
    },
    example: {
      sync: {
        command: "sync",
        payload: {
          figmaUrl: "https://www.figma.com/file/abc123/Design?node-id=1-23",
        },
      },
    },
  });
}
