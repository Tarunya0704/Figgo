"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    figmaUrl: "",
    framework: "nextjs",
    styling: "tailwind",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      // Redirect to project page
      router.push(`/dashboard/projects/${data.project.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Create New Project</h1>
        <p className="text-gray-400 mt-1">Convert a Figma design to production-ready code</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Figma URL */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-figma-purple flex items-center justify-center text-white text-sm font-medium">
                1
              </div>
              <div>
                <h2 className="font-medium text-white">Figma Design</h2>
                <p className="text-sm text-gray-500">Paste your Figma file or frame URL</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Input
              type="url"
              placeholder="https://www.figma.com/file/..."
              value={formData.figmaUrl}
              onChange={(e) => setFormData({ ...formData, figmaUrl: e.target.value })}
              required
            />
            <p className="text-xs text-gray-500 mt-2">
              You can use a file URL or a specific frame URL (with node-id parameter)
            </p>
          </CardContent>
        </Card>

        {/* Step 2: Project Name */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-medium">
                2
              </div>
              <div>
                <h2 className="font-medium text-white">Project Details</h2>
                <p className="text-sm text-gray-500">Name your project</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Input
              type="text"
              label="Project Name"
              placeholder="My Landing Page"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </CardContent>
        </Card>

        {/* Step 3: Tech Stack */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-medium">
                3
              </div>
              <div>
                <h2 className="font-medium text-white">Tech Stack</h2>
                <p className="text-sm text-gray-500">Choose your framework and styling</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* Framework */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Framework
                </label>
                <div className="space-y-2">
                  {[
                    { value: "nextjs", label: "Next.js", icon: "▲" },
                    { value: "react", label: "React", icon: "⚛" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                        formData.framework === option.value
                          ? "border-figma-purple bg-figma-purple/10"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="framework"
                        value={option.value}
                        checked={formData.framework === option.value}
                        onChange={(e) => setFormData({ ...formData, framework: e.target.value })}
                        className="sr-only"
                      />
                      <span className="text-lg">{option.icon}</span>
                      <span className="text-white">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Styling */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Styling
                </label>
                <div className="space-y-2">
                  {[
                    { value: "tailwind", label: "Tailwind CSS", icon: "🎨" },
                    { value: "css", label: "Plain CSS", icon: "📝" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                        formData.styling === option.value
                          ? "border-figma-purple bg-figma-purple/10"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="styling"
                        value={option.value}
                        checked={formData.styling === option.value}
                        onChange={(e) => setFormData({ ...formData, styling: e.target.value })}
                        className="sr-only"
                      />
                      <span className="text-lg">{option.icon}</span>
                      <span className="text-white">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={loading} className="flex-1">
            Create Project
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
