import axios from "axios";
import prisma from "@/lib/prisma";

// ============================================================================
// GITHUB OAUTH CONFIGURATION
// ============================================================================

const GITHUB_AUTH_URL = "https://github.com/login/oauth";
const GITHUB_API_URL = "https://api.github.com";

export const GITHUB_SCOPES = [
  "repo",           // Full control of private repositories
  "read:user",      // Read user profile data
  "user:email",     // Access user email addresses
] as const;

// ============================================================================
// OAUTH URL GENERATION
// ============================================================================

export function getGitHubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/github/callback`,
    scope: GITHUB_SCOPES.join(" "),
    state,
    allow_signup: "true",
  });

  return `${GITHUB_AUTH_URL}/authorize?${params.toString()}`;
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

export interface GitHubTokens {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function exchangeGitHubCode(code: string): Promise<GitHubTokens> {
  try {
    const response = await axios.post<GitHubTokens>(
      `${GITHUB_AUTH_URL}/access_token`,
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/github/callback`,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error("GitHub OAuth exchange error:", error.response?.data || error.message);
    throw new Error("Failed to exchange GitHub authorization code");
  }
}

// ============================================================================
// GET USER INFO
// ============================================================================

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  try {
    const response = await axios.get<GitHubUser>(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("GitHub user fetch error:", error.response?.data || error.message);
    throw new Error("Failed to fetch GitHub user");
  }
}

// ============================================================================
// INTEGRATION STORAGE
// ============================================================================

export async function saveGitHubIntegration(
  userId: string,
  tokens: GitHubTokens,
  user: GitHubUser
): Promise<void> {
  await prisma.integration.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "github",
      },
    },
    update: {
      accessToken: tokens.access_token,
      scope: tokens.scope,
      metadata: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        github_id: user.id,
      },
    },
    create: {
      userId,
      provider: "github",
      accessToken: tokens.access_token,
      scope: tokens.scope,
      metadata: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        github_id: user.id,
      },
    },
  });
}

export async function getGitHubIntegration(userId: string) {
  return prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "github",
      },
    },
  });
}

export async function deleteGitHubIntegration(userId: string): Promise<void> {
  await prisma.integration.deleteMany({
    where: {
      userId,
      provider: "github",
    },
  });
}

// ============================================================================
// VALIDATE TOKEN
// ============================================================================

export async function validateGitHubToken(accessToken: string): Promise<boolean> {
  try {
    await axios.get(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    return true;
  } catch {
    return false;
  }
}
