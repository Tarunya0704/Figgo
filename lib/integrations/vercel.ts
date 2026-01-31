import axios from "axios";
import prisma from "@/lib/prisma";

// ============================================================================
// VERCEL OAUTH CONFIGURATION
// ============================================================================

const VERCEL_AUTH_URL = "https://vercel.com/oauth";
const VERCEL_API_URL = "https://api.vercel.com";

// ============================================================================
// OAUTH URL GENERATION
// ============================================================================

export function getVercelAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.VERCEL_CLIENT_ID!,
    redirect_uri: process.env.VERCEL_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/vercel/callback`,
    state,
  });

  return `${VERCEL_AUTH_URL}/authorize?${params.toString()}`;
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

export interface VercelTokens {
  access_token: string;
  token_type: string;
  user_id: string;
  team_id?: string;
}

export async function exchangeVercelCode(code: string): Promise<VercelTokens> {
  try {
    const response = await axios.post<VercelTokens>(
      `${VERCEL_AUTH_URL}/access_token`,
      new URLSearchParams({
        client_id: process.env.VERCEL_CLIENT_ID!,
        client_secret: process.env.VERCEL_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.VERCEL_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/vercel/callback`,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error("Vercel OAuth exchange error:", error.response?.data || error.message);
    throw new Error("Failed to exchange Vercel authorization code");
  }
}

// ============================================================================
// GET USER INFO
// ============================================================================

export interface VercelUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatar?: string;
}

export async function getVercelUser(accessToken: string): Promise<VercelUser> {
  try {
    const response = await axios.get(`${VERCEL_API_URL}/v2/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data.user;
  } catch (error: any) {
    console.error("Vercel user fetch error:", error.response?.data || error.message);
    throw new Error("Failed to fetch Vercel user");
  }
}

// ============================================================================
// GET USER TEAMS
// ============================================================================

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
}

export async function getVercelTeams(accessToken: string): Promise<VercelTeam[]> {
  try {
    const response = await axios.get(`${VERCEL_API_URL}/v2/teams`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data.teams || [];
  } catch (error: any) {
    console.error("Vercel teams fetch error:", error.response?.data || error.message);
    return [];
  }
}

// ============================================================================
// INTEGRATION STORAGE
// ============================================================================

export async function saveVercelIntegration(
  userId: string,
  tokens: VercelTokens,
  user: VercelUser,
  teams: VercelTeam[]
): Promise<void> {
  await prisma.integration.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "vercel",
      },
    },
    update: {
      accessToken: tokens.access_token,
      metadata: {
        vercel_user_id: tokens.user_id,
        team_id: tokens.team_id,
        username: user.username,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
      },
    },
    create: {
      userId,
      provider: "vercel",
      accessToken: tokens.access_token,
      metadata: {
        vercel_user_id: tokens.user_id,
        team_id: tokens.team_id,
        username: user.username,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
      },
    },
  });
}

export async function getVercelIntegration(userId: string) {
  return prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "vercel",
      },
    },
  });
}

export async function deleteVercelIntegration(userId: string): Promise<void> {
  await prisma.integration.deleteMany({
    where: {
      userId,
      provider: "vercel",
    },
  });
}

// ============================================================================
// VALIDATE TOKEN
// ============================================================================

export async function validateVercelToken(accessToken: string): Promise<boolean> {
  try {
    await axios.get(`${VERCEL_API_URL}/v2/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return true;
  } catch {
    return false;
  }
}
