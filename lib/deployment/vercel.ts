import axios, { AxiosInstance } from "axios";

// ============================================================================
// VERCEL DEPLOYMENT SERVICE
// ============================================================================

export class VercelService {
  private client: AxiosInstance;
  private teamId?: string;

  constructor(token: string, teamId?: string) {
    this.client = axios.create({
      baseURL: "https://api.vercel.com",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    this.teamId = teamId;
  }

  private getTeamQuery(): string {
    return this.teamId ? `?teamId=${this.teamId}` : "";
  }

  // ==========================================================================
  // PROJECT MANAGEMENT
  // ==========================================================================

  async createProject(
    name: string,
    gitRepository: {
      type: "github";
      repo: string; // format: "owner/repo"
    },
    framework: string = "nextjs"
  ): Promise<{
    projectId: string;
    name: string;
    accountId: string;
  }> {
    const response = await this.client.post(`/v10/projects${this.getTeamQuery()}`, {
      name,
      gitRepository,
      framework,
      buildCommand: "npm run build",
      outputDirectory: ".next",
      installCommand: "npm install",
    });

    return {
      projectId: response.data.id,
      name: response.data.name,
      accountId: response.data.accountId,
    };
  }

  async getProject(projectId: string): Promise<any> {
    const response = await this.client.get(
      `/v9/projects/${projectId}${this.getTeamQuery()}`
    );
    return response.data;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.client.delete(`/v9/projects/${projectId}${this.getTeamQuery()}`);
  }

  // ==========================================================================
  // DEPLOYMENT MANAGEMENT
  // ==========================================================================

  async createDeployment(
    projectId: string,
    target: "production" | "preview" = "preview",
    gitSource?: {
      type: "github";
      ref: string; // branch name or commit SHA
      repoId: string;
    }
  ): Promise<{
    deploymentId: string;
    url: string;
    state: string;
  }> {
    const response = await this.client.post(
      `/v13/deployments${this.getTeamQuery()}`,
      {
        name: projectId,
        target,
        gitSource,
        project: projectId,
      }
    );

    return {
      deploymentId: response.data.id,
      url: response.data.url,
      state: response.data.readyState,
    };
  }

  async getDeployment(deploymentId: string): Promise<{
    id: string;
    url: string;
    state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
    readyState: string;
    createdAt: number;
    buildingAt?: number;
    ready?: number;
  }> {
    const response = await this.client.get(
      `/v13/deployments/${deploymentId}${this.getTeamQuery()}`
    );

    return {
      id: response.data.id,
      url: response.data.url,
      state: response.data.readyState,
      readyState: response.data.readyState,
      createdAt: response.data.createdAt,
      buildingAt: response.data.buildingAt,
      ready: response.data.ready,
    };
  }

  async cancelDeployment(deploymentId: string): Promise<void> {
    await this.client.patch(
      `/v12/deployments/${deploymentId}/cancel${this.getTeamQuery()}`
    );
  }

  async listDeployments(
    projectId: string,
    limit: number = 10
  ): Promise<
    Array<{
      id: string;
      url: string;
      state: string;
      createdAt: number;
      target: string;
    }>
  > {
    const response = await this.client.get(
      `/v6/deployments${this.getTeamQuery()}&projectId=${projectId}&limit=${limit}`
    );

    return response.data.deployments.map((d: any) => ({
      id: d.uid,
      url: d.url,
      state: d.readyState,
      createdAt: d.createdAt,
      target: d.target,
    }));
  }

  // ==========================================================================
  // DEPLOYMENT LOGS
  // ==========================================================================

  async getDeploymentLogs(
    deploymentId: string
  ): Promise<
    Array<{
      type: string;
      text: string;
      timestamp: number;
    }>
  > {
    const response = await this.client.get(
      `/v2/deployments/${deploymentId}/events${this.getTeamQuery()}`
    );

    return response.data.map((event: any) => ({
      type: event.type,
      text: event.text || event.payload?.text || "",
      timestamp: event.created,
    }));
  }

  // ==========================================================================
  // DOMAIN MANAGEMENT
  // ==========================================================================

  async addDomain(
    projectId: string,
    domain: string
  ): Promise<{
    name: string;
    verified: boolean;
  }> {
    const response = await this.client.post(
      `/v10/projects/${projectId}/domains${this.getTeamQuery()}`,
      { name: domain }
    );

    return {
      name: response.data.name,
      verified: response.data.verified,
    };
  }

  async getProjectDomains(
    projectId: string
  ): Promise<Array<{ name: string; verified: boolean }>> {
    const response = await this.client.get(
      `/v9/projects/${projectId}/domains${this.getTeamQuery()}`
    );

    return response.data.domains.map((d: any) => ({
      name: d.name,
      verified: d.verified,
    }));
  }

  // ==========================================================================
  // ENVIRONMENT VARIABLES
  // ==========================================================================

  async setEnvironmentVariable(
    projectId: string,
    key: string,
    value: string,
    target: ("production" | "preview" | "development")[] = ["production", "preview"]
  ): Promise<void> {
    await this.client.post(
      `/v10/projects/${projectId}/env${this.getTeamQuery()}`,
      {
        key,
        value,
        target,
        type: "encrypted",
      }
    );
  }

  // ==========================================================================
  // ROLLBACK
  // ==========================================================================

  async promoteDeployment(
    deploymentId: string,
    projectId: string
  ): Promise<void> {
    // Promote a preview deployment to production
    await this.client.post(
      `/v10/projects/${projectId}/promote/${deploymentId}${this.getTeamQuery()}`
    );
  }
}

// ============================================================================
// DEPLOYMENT STATUS POLLING
// ============================================================================

export async function waitForDeployment(
  vercel: VercelService,
  deploymentId: string,
  maxWaitMs: number = 300000, // 5 minutes
  pollIntervalMs: number = 5000
): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const deployment = await vercel.getDeployment(deploymentId);

    switch (deployment.state) {
      case "READY":
        return { success: true, url: `https://${deployment.url}` };
      case "ERROR":
      case "CANCELED":
        return { success: false, error: `Deployment ${deployment.state.toLowerCase()}` };
      case "BUILDING":
      case "INITIALIZING":
      case "QUEUED":
        // Still in progress, wait and poll again
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        break;
    }
  }

  return { success: false, error: "Deployment timed out" };
}
