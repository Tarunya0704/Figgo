import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getFigmaAuthUrl } from "@/lib/figma/oauth";
import crypto from "crypto";

// ============================================================================
// GET - Initiate Figma OAuth Flow
// ============================================================================

export async function GET(request: NextRequest) {
  // Check if user is authenticated
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in cookie for verification
  const response = NextResponse.redirect(getFigmaAuthUrl(state));
  response.cookies.set("figma_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  return response;
}
