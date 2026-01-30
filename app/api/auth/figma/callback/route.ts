import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  exchangeFigmaCode,
  saveFigmaIntegration,
  getFigmaUser,
} from "@/lib/figma/oauth";

// ============================================================================
// GET - Handle Figma OAuth Callback
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("Figma OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=missing_params", request.url)
    );
  }

  // Verify state matches (CSRF protection)
  const storedState = request.cookies.get("figma_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state", request.url)
    );
  }

  // Get current user session
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeFigmaCode(code);

    // Get Figma user info
    const figmaUser = await getFigmaUser(tokens.access_token);

    // Find user ID from email (simplified - in production use proper session)
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=user_not_found", request.url)
      );
    }

    // Save integration
    await saveFigmaIntegration(user.id, tokens);

    // Clear OAuth state cookie
    const response = NextResponse.redirect(
      new URL("/dashboard/settings?success=figma_connected", request.url)
    );
    response.cookies.delete("figma_oauth_state");

    return response;
  } catch (error) {
    console.error("Figma OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=oauth_failed", request.url)
    );
  }
}
