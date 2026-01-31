import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  exchangeGitHubCode,
  getGitHubUser,
  saveGitHubIntegration,
} from "@/lib/integrations/github";

// ============================================================================
// GET - Handle GitHub OAuth Callback
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("GitHub OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(error)}&provider=github`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=missing_params&provider=github", request.url)
    );
  }

  // Verify state matches (CSRF protection)
  const storedState = request.cookies.get("github_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state&provider=github", request.url)
    );
  }

  // Get current user session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeGitHubCode(code);

    // Get GitHub user info
    const githubUser = await getGitHubUser(tokens.access_token);

    // Save integration
    await saveGitHubIntegration(session.user.id, tokens, githubUser);

    // Clear OAuth state cookie
    const response = NextResponse.redirect(
      new URL("/dashboard/settings?success=github_connected", request.url)
    );
    response.cookies.delete("github_oauth_state");

    return response;
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=oauth_failed&provider=github", request.url)
    );
  }
}
