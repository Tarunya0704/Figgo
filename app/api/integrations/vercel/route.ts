import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getVercelAuthUrl } from "@/lib/integrations/vercel";
import crypto from "crypto";

// ============================================================================
// GET - Initiate Vercel OAuth Flow
// ============================================================================

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in cookie for verification
  const response = NextResponse.redirect(getVercelAuthUrl(state));
  response.cookies.set("vercel_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  return response;
}
