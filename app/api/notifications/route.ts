import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";

// ============================================================================
// GET - List User's Notifications
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

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = parseInt(searchParams.get("limit") || "20");

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: user.id,
      read: false,
    },
  });

  return NextResponse.json({
    notifications,
    unreadCount,
  });
}

// ============================================================================
// PATCH - Mark Notifications as Read
// ============================================================================

export async function PATCH(request: NextRequest) {
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

  const body = await request.json();
  const { notificationIds, markAllRead } = body;

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
  } else if (notificationIds && Array.isArray(notificationIds)) {
    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: user.id,
      },
      data: { read: true },
    });
  }

  return NextResponse.json({ success: true });
}

// ============================================================================
// DELETE - Delete Notifications
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
  const notificationId = searchParams.get("id");

  if (notificationId) {
    await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: user.id,
      },
    });
  }

  return NextResponse.json({ success: true });
}
