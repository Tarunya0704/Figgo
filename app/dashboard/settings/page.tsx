"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface IntegrationStatus {
  connected: boolean;
  displayName?: string;
  avatar?: string;
  email?: string;
  name?: string;
  teams?: Array<{ id: string; slug: string; name: string }>;
  connectedAt?: string;
}

interface Integrations {
  figma: IntegrationStatus;
  github: IntegrationStatus;
  vercel: IntegrationStatus;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const error = searchParams.get("error");
  const provider = searchParams.get("provider");

  const [integrations, setIntegrations] = useState<Integrations>({
    figma: { connected: false },
    github: { connected: false },
    vercel: { connected: false },
  });
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchIntegrations(), fetchWebhooks()]);
    setLoading(false);
  };

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      setIntegrations(data.integrations);
    } catch (error) {
      console.error("Failed to fetch integrations:", error);
    }
  };

  const fetchWebhooks = async () => {
    try {
      const res = await fetch("/api/webhooks/manage");
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (error) {
      console.error("Failed to fetch webhooks:", error);
    }
  };

  const disconnectIntegration = async (providerName: string) => {
    setDisconnecting(providerName);
    try {
      await fetch(`/api/integrations?provider=${providerName}`, {
        method: "DELETE",
      });
      await fetchIntegrations();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setDisconnecting(null);
    }
  };

  const registerWebhooks = async () => {
    if (!teamId) return;
    setWebhookLoading(true);
    try {
      const res = await fetch("/api/webhooks/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchWebhooks();
        setTeamId("");
      }
    } catch (error) {
      console.error("Failed to register webhooks:", error);
    } finally {
      setWebhookLoading(false);
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    try {
      await fetch(`/api/webhooks/manage?webhookId=${webhookId}`, {
        method: "DELETE",
      });
      await fetchWebhooks();
    } catch (error) {
      console.error("Failed to delete webhook:", error);
    }
  };

  const getSuccessMessage = () => {
    if (!success) return null;
    const messages: Record<string, string> = {
      figma_connected: "Figma connected successfully!",
      github_connected: "GitHub connected successfully!",
      vercel_connected: "Vercel connected successfully!",
    };
    return messages[success] || "Operation completed successfully!";
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your connected accounts and webhooks</p>
      </div>

      {/* Status Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-800 rounded-lg text-green-400 text-sm flex items-center gap-2">
          <CheckIcon className="w-5 h-5" />
          {getSuccessMessage()}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error === "oauth_failed"
            ? `Failed to connect ${provider || "service"}. Please try again.`
            : error}
        </div>
      )}

      {/* Integrations */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-medium text-white">Connected Accounts</h2>
          <p className="text-sm text-gray-500">
            Connect your accounts to enable design sync and deployment
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Figma */}
          <IntegrationRow
            name="Figma"
            description="Import designs and receive sync updates"
            icon={<FigmaIcon />}
            integration={integrations.figma}
            connectUrl="/api/auth/figma"
            onDisconnect={() => disconnectIntegration("figma")}
            disconnecting={disconnecting === "figma"}
          />

          {/* GitHub */}
          <IntegrationRow
            name="GitHub"
            description="Create repositories and push code"
            icon={<GitHubIcon />}
            integration={integrations.github}
            connectUrl="/api/integrations/github"
            onDisconnect={() => disconnectIntegration("github")}
            disconnecting={disconnecting === "github"}
          />

          {/* Vercel */}
          <IntegrationRow
            name="Vercel"
            description="Deploy and host your projects"
            icon={<VercelIcon />}
            integration={integrations.vercel}
            connectUrl="/api/integrations/vercel"
            onDisconnect={() => disconnectIntegration("vercel")}
            disconnecting={disconnecting === "vercel"}
            extra={
              integrations.vercel.connected && integrations.vercel.teams && integrations.vercel.teams.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  Teams: {integrations.vercel.teams.map(t => t.name).join(", ")}
                </div>
              )
            }
          />
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="font-medium text-white">Figma Webhooks</h2>
            <p className="text-sm text-gray-500 mt-1">
              Receive real-time notifications when designs change
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {!integrations.figma.connected ? (
            <div className="text-center py-8 text-gray-500">
              Connect your Figma account first to register webhooks.
            </div>
          ) : (
            <>
              {/* Register New Webhook */}
              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Figma Team ID"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-figma-purple"
                />
                <Button onClick={registerWebhooks} loading={webhookLoading} disabled={!teamId}>
                  Register
                </Button>
              </div>

              {/* Webhook List */}
              {webhooks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No webhooks registered. Enter your Figma Team ID to enable real-time sync.
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((webhook) => (
                    <div
                      key={webhook.id}
                      className="flex items-center justify-between p-4 bg-gray-900 rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">Team {webhook.teamId}</span>
                          <Badge variant={webhook.status === "active" ? "success" : "warning"}>
                            {webhook.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Events: {webhook.eventTypes?.join(", ") || "All"}
                        </div>
                        {webhook.lastPingAt && (
                          <div className="text-xs text-gray-600 mt-1">
                            Last ping: {new Date(webhook.lastPingAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhook(webhook.webhookId)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Integration Row Component
function IntegrationRow({
  name,
  description,
  icon,
  integration,
  connectUrl,
  onDisconnect,
  disconnecting,
  extra,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  integration: IntegrationStatus;
  connectUrl: string;
  onDisconnect: () => void;
  disconnecting: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{name}</span>
            {integration.connected && (
              <Badge variant="success">Connected</Badge>
            )}
          </div>
          <div className="text-sm text-gray-500">
            {integration.connected
              ? integration.displayName || integration.email || "Connected"
              : description}
          </div>
          {extra}
        </div>
      </div>
      {integration.connected ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          loading={disconnecting}
        >
          Disconnect
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = connectUrl}
        >
          Connect
        </Button>
      )}
    </div>
  );
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FigmaIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 38 57" fill="none">
      <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE" />
      <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83" />
      <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262" />
      <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E" />
      <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function VercelIcon() {
  return (
    <svg className="w-6 h-6 text-white" viewBox="0 0 116 100" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M57.5 0L115 100H0L57.5 0z" />
    </svg>
  );
}
