import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  exchangeVercelCode,
  getVercelUser,
  getVercelTeams,
  saveVercelIntegration,
} from "@/lib/integrations/vercel";

// ============================================================================
// GET - Handle Vercel OAuth Callback
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("Vercel OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(error)}&provider=vercel`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=missing_params&provider=vercel", request.url)
    );
  }

  // Verify state matches (CSRF protection)
  const storedState = request.cookies.get("vercel_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state&provider=vercel", request.url)
    );
  }

  // Get current user session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeVercelCode(code);

    // Get Vercel user info
    const vercelUser = await getVercelUser(tokens.access_token);

    // Get user's teams
    const teams = await getVercelTeams(tokens.access_token);

    // Save integration
    await saveVercelIntegration(session.user.id, tokens, vercelUser, teams);

    // Clear OAuth state cookie
    const response = NextResponse.redirect(
      new URL("/dashboard/settings?success=vercel_connected", request.url)
    );
    response.cookies.delete("vercel_oauth_state");

    return response;
  } catch (error) {
    console.error("Vercel OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=oauth_failed&provider=vercel", request.url)
    );
  }
}
