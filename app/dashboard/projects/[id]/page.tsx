"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Project {
  id: string;
  name: string;
  status: string;
  progress: number;
  figmaDesignUrl?: string;
  figmaImageUrl?: string;
  githubRepoUrl?: string;
  deploymentUrl?: string;
  visualMatchScore?: number;
  codeQualityScore?: number;
  functionalScore?: number;
  components: Array<{
    id: string;
    figmaNodeName: string;
    componentName: string;
    syncStatus: string;
    changeFrequency: number;
  }>;
  syncEvents: Array<{
    id: string;
    eventType: string;
    status: string;
    createdAt: string;
  }>;
  deployments: Array<{
    id: string;
    type: string;
    status: string;
    deploymentUrl?: string;
    createdAt: string;
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [params.id]);

  // Poll for updates when generating
  useEffect(() => {
    if (project?.status === "generating") {
      const interval = setInterval(fetchProject, 2000);
      return () => clearInterval(interval);
    }
  }, [project?.status]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${params.id}`);
      const data = await res.json();
      setProject(data.project);
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch(`/api/projects/${params.id}/generate`, { method: "POST" });
      await fetchProject();
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeploy = async (type: "preview" | "production") => {
    setDeploying(true);
    try {
      const res = await fetch(`/api/projects/${params.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentType: type }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Deployment failed:", error);
    } finally {
      setDeploying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "success" | "warning" | "error" | "info" | "default"> = {
      deployed: "success",
      synced: "success",
      review: "info",
      generating: "warning",
      deploying: "warning",
      pending: "default",
      outdated: "warning",
      failed: "error",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-figma-purple"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl text-white mb-4">Project not found</h2>
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {project.figmaDesignUrl && (
              <a
                href={project.figmaDesignUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-figma-purple"
              >
                View in Figma
              </a>
            )}
            {project.githubRepoUrl && (
              <a
                href={project.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-figma-purple"
              >
                GitHub Repo
              </a>
            )}
            {project.deploymentUrl && (
              <a
                href={project.deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-figma-purple"
              >
                Live Site
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {project.status === "pending" && (
            <Button onClick={handleGenerate} loading={generating}>
              Generate Code
            </Button>
          )}
          {project.status === "review" && (
            <>
              <Button variant="outline" onClick={() => handleDeploy("preview")} loading={deploying}>
                Preview Deploy
              </Button>
              <Button onClick={() => handleDeploy("production")} loading={deploying}>
                Deploy to Production
              </Button>
            </>
          )}
          {project.status === "deployed" && (
            <Button variant="outline" onClick={() => handleDeploy("preview")} loading={deploying}>
              Redeploy
            </Button>
          )}
        </div>
      </div>

      {/* Generation Progress */}
      {project.status === "generating" && (
        <Card className="mb-6">
          <CardContent className="py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-figma-purple mx-auto mb-4"></div>
              <h3 className="text-lg font-medium text-white mb-2">Generating Code...</h3>
              <p className="text-gray-400 mb-4">This usually takes about a minute</p>
              <div className="w-full max-w-md mx-auto bg-gray-800 rounded-full h-2">
                <div
                  className="bg-figma-purple h-2 rounded-full transition-all duration-500"
                  style={{ width: `${project.progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">{project.progress}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Scores */}
      {project.visualMatchScore !== null && project.status !== "generating" && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-figma-green mb-1">
                {project.visualMatchScore}%
              </div>
              <div className="text-sm text-gray-500">Visual Match</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-figma-blue mb-1">
                {project.codeQualityScore}%
              </div>
              <div className="text-sm text-gray-500">Code Quality</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-figma-purple mb-1">
                {project.functionalScore}%
              </div>
              <div className="text-sm text-gray-500">Functional</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Components */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-white">Components</h2>
              <span className="text-sm text-gray-500">{project.components.length} total</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {project.components.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No components yet. Generate code to extract components.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {project.components.map((comp) => (
                  <Link
                    key={comp.id}
                    href={`/dashboard/projects/${project.id}/components/${comp.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition"
                  >
                    <div>
                      <div className="font-medium text-white">{comp.figmaNodeName}</div>
                      <div className="text-sm text-gray-500">{comp.componentName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {comp.changeFrequency > 0 && (
                        <span className="text-xs text-gray-500">{comp.changeFrequency} changes</span>
                      )}
                      {getStatusBadge(comp.syncStatus)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-white">Recent Activity</h2>
          </CardHeader>
          <CardContent className="p-0">
            {project.syncEvents.length === 0 && project.deployments.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No recent activity</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {[...project.syncEvents, ...project.deployments]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10)
                  .map((event) => (
                    <div key={event.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-white">
                            {"eventType" in event ? event.eventType : `${event.type} deployment`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(event.createdAt).toLocaleString()}
                          </div>
                        </div>
                        {getStatusBadge(event.status)}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
