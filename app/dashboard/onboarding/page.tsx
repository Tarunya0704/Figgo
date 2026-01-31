"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

interface IntegrationStatus {
  connected: boolean;
  displayName?: string;
  avatar?: string;
}

interface Integrations {
  figma: IntegrationStatus;
  github: IntegrationStatus;
  vercel: IntegrationStatus;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integrations>({
    figma: { connected: false },
    github: { connected: false },
    vercel: { connected: false },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      setIntegrations(data.integrations);
    } catch (error) {
      console.error("Failed to fetch integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const allConnected = integrations.figma.connected &&
                       integrations.github.connected &&
                       integrations.vercel.connected;

  const connectionsCount = [
    integrations.figma.connected,
    integrations.github.connected,
    integrations.vercel.connected,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Connect Your Accounts
          </h1>
          <p className="text-gray-400">
            Figgo Pro needs access to these services to sync designs and deploy code
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`h-1 w-16 rounded-full ${connectionsCount >= 1 ? "bg-figma-purple" : "bg-gray-700"}`} />
          <div className={`h-1 w-16 rounded-full ${connectionsCount >= 2 ? "bg-figma-purple" : "bg-gray-700"}`} />
          <div className={`h-1 w-16 rounded-full ${connectionsCount >= 3 ? "bg-figma-purple" : "bg-gray-700"}`} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-figma-purple"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Figma */}
            <Card className={integrations.figma.connected ? "border-figma-green/50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7" viewBox="0 0 38 57" fill="none">
                        <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE" />
                        <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83" />
                        <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262" />
                        <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E" />
                        <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-white">Figma</div>
                      <div className="text-sm text-gray-500">
                        {integrations.figma.connected
                          ? `Connected as ${integrations.figma.displayName}`
                          : "Import designs and sync changes"}
                      </div>
                    </div>
                  </div>
                  {integrations.figma.connected ? (
                    <div className="flex items-center gap-2 text-figma-green">
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => window.location.href = "/api/auth/figma"}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* GitHub */}
            <Card className={integrations.github.connected ? "border-figma-green/50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-white">GitHub</div>
                      <div className="text-sm text-gray-500">
                        {integrations.github.connected
                          ? `Connected as @${integrations.github.displayName}`
                          : "Push code and create repositories"}
                      </div>
                    </div>
                  </div>
                  {integrations.github.connected ? (
                    <div className="flex items-center gap-2 text-figma-green">
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => window.location.href = "/api/integrations/github"}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Vercel */}
            <Card className={integrations.vercel.connected ? "border-figma-green/50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" viewBox="0 0 116 100" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M57.5 0L115 100H0L57.5 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-white">Vercel</div>
                      <div className="text-sm text-gray-500">
                        {integrations.vercel.connected
                          ? `Connected as ${integrations.vercel.displayName}`
                          : "Deploy and host your projects"}
                      </div>
                    </div>
                  </div>
                  {integrations.vercel.connected ? (
                    <div className="flex items-center gap-2 text-figma-green">
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => window.location.href = "/api/integrations/vercel"}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 space-y-3">
          {allConnected ? (
            <Button className="w-full" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Skip for now
            </Button>
          )}
        </div>

        {allConnected && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-figma-green/10 border border-figma-green/30 rounded-full">
              <CheckIcon className="w-4 h-4 text-figma-green" />
              <span className="text-sm text-figma-green font-medium">All services connected!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
