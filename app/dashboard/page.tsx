"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Project {
  id: string;
  name: string;
  status: string;
  figmaImageUrl?: string;
  deploymentUrl?: string;
  updatedAt: string;
  components: Array<{ syncStatus: string }>;
  _count: { syncEvents: number; deployments: number };
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "success" | "warning" | "error" | "info" | "default"> = {
      deployed: "success",
      review: "info",
      generating: "warning",
      pending: "default",
      failed: "error",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 mt-1">Manage your Figma to code projects</p>
        </div>
        <Link href="/dashboard/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </Button>
        </Link>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-figma-purple"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <Card className="text-center py-16">
          <CardContent>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
            <p className="text-gray-400 mb-6">Create your first project to start converting Figma designs to code.</p>
            <Link href="/dashboard/new">
              <Button>Create Project</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Project Grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const outdatedCount = project.components.filter(
              (c) => c.syncStatus === "outdated"
            ).length;

            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <Card hover className="h-full">
                  <CardContent className="p-0">
                    {/* Preview Image */}
                    <div className="h-40 bg-gray-900 rounded-t-xl overflow-hidden">
                      {project.figmaImageUrl ? (
                        <img
                          src={project.figmaImageUrl}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-white truncate">{project.name}</h3>
                        {getStatusBadge(project.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{project.components.length} components</span>
                        {outdatedCount > 0 && (
                          <span className="text-yellow-500">{outdatedCount} outdated</span>
                        )}
                      </div>

                      {project.deploymentUrl && (
                        <a
                          href={project.deploymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 text-sm text-figma-purple hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Live
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
