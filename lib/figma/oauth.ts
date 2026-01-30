import axios from "axios";
import prisma from "@/lib/prisma";
import type { FigmaOAuthTokens, FigmaUser } from "./types";

// ============================================================================
// FIGMA OAUTH CONFIGURATION
// ============================================================================

const FIGMA_AUTH_URL = "https://www.figma.com/oauth";
const FIGMA_API_URL = "https://api.figma.com/v1";

export const FIGMA_SCOPES = [
  "files:read",           // Read files
  "file_dev_resources:read",  // Read dev resources
  "file_dev_resources:write", // Write dev resources (for comments/annotations)
  "webhooks:write",       // Create webhooks
] as const;

// ============================================================================
// OAUTH URL GENERATION
// ============================================================================

export function getFigmaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!,
    redirect_uri: process.env.FIGMA_REDIRECT_URI!,
    scope: FIGMA_SCOPES.join(","),
    state,
    response_type: "code",
  });

  return `${FIGMA_AUTH_URL}?${params.toString()}`;
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

export async function exchangeFigmaCode(code: string): Promise<FigmaOAuthTokens> {
  try {
    const response = await axios.post<FigmaOAuthTokens>(
      `${FIGMA_AUTH_URL}/token`,
      new URLSearchParams({
        client_id: process.env.FIGMA_CLIENT_ID!,
        client_secret: process.env.FIGMA_CLIENT_SECRET!,
        redirect_uri: process.env.FIGMA_REDIRECT_URI!,
        code,
        grant_type: "authorization_code",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error("Figma OAuth exchange error:", error.response?.data || error.message);
    throw new Error("Failed to exchange Figma authorization code");
  }
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

export async function refreshFigmaToken(refreshToken: string): Promise<FigmaOAuthTokens> {
  try {
    const response = await axios.post<FigmaOAuthTokens>(
      `${FIGMA_AUTH_URL}/refresh`,
      new URLSearchParams({
        client_id: process.env.FIGMA_CLIENT_ID!,
        client_secret: process.env.FIGMA_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error("Figma token refresh error:", error.response?.data || error.message);
    throw new Error("Failed to refresh Figma token");
  }
}

// ============================================================================
// GET CURRENT USER
// ============================================================================

export async function getFigmaUser(accessToken: string): Promise<FigmaUser> {
  try {
    const response = await axios.get<FigmaUser>(`${FIGMA_API_URL}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("Figma user fetch error:", error.response?.data || error.message);
    throw new Error("Failed to fetch Figma user");
  }
}

// ============================================================================
// INTEGRATION STORAGE
// ============================================================================

export async function saveFigmaIntegration(
  userId: string,
  tokens: FigmaOAuthTokens
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.integration.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "figma",
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      metadata: {
        figmaUserId: tokens.user_id,
      },
    },
    create: {
      userId,
      provider: "figma",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: FIGMA_SCOPES.join(","),
      metadata: {
        figmaUserId: tokens.user_id,
      },
    },
  });
}

export async function getFigmaIntegration(userId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "figma",
      },
    },
  });

  if (!integration) {
    return null;
  }

  // Check if token is expired
  if (integration.expiresAt && integration.expiresAt < new Date()) {
    if (integration.refreshToken) {
      // Attempt to refresh
      try {
        const newTokens = await refreshFigmaToken(integration.refreshToken);
        await saveFigmaIntegration(userId, newTokens);
        return {
          ...integration,
          accessToken: newTokens.access_token,
        };
      } catch (error) {
        console.error("Failed to refresh token:", error);
        return null;
      }
    }
    return null;
  }

  return integration;
}

export async function deleteFigmaIntegration(userId: string): Promise<void> {
  await prisma.integration.deleteMany({
    where: {
      userId,
      provider: "figma",
    },
  });
}
