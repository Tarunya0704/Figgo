import { Octokit } from "@octokit/rest";
import prisma from "@/lib/prisma";

// ============================================================================
// GITHUB DEPLOYMENT SERVICE
// ============================================================================

export class GitHubService {
  private octokit: Octokit;
  private owner: string;

  constructor(accessToken: string, owner: string) {
    this.octokit = new Octokit({ auth: accessToken });
    this.owner = owner;
  }

  // ==========================================================================
  // REPOSITORY MANAGEMENT
  // ==========================================================================

  async createRepository(
    name: string,
    description: string,
    isPrivate: boolean = false
  ): Promise<{
    repoUrl: string;
    cloneUrl: string;
    fullName: string;
  }> {
    const response = await this.octokit.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: false,
    });

    return {
      repoUrl: response.data.html_url,
      cloneUrl: response.data.clone_url,
      fullName: response.data.full_name,
    };
  }

  async repositoryExists(name: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: this.owner,
        repo: name,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  async createOrUpdateFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = "main",
    sha?: string
  ): Promise<{ sha: string; url: string }> {
    const response = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      sha,
    });

    return {
      sha: response.data.content?.sha || "",
      url: response.data.content?.html_url || "",
    };
  }

  async getFileSha(
    repo: string,
    path: string,
    branch: string = "main"
  ): Promise<string | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo,
        path,
        ref: branch,
      });

      if (!Array.isArray(response.data) && response.data.sha) {
        return response.data.sha;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // BRANCH MANAGEMENT
  // ==========================================================================

  async createBranch(
    repo: string,
    branchName: string,
    fromBranch: string = "main"
  ): Promise<string> {
    // Get the SHA of the base branch
    const baseRef = await this.octokit.git.getRef({
      owner: this.owner,
      repo,
      ref: `heads/${fromBranch}`,
    });

    // Create new branch
    const response = await this.octokit.git.createRef({
      owner: this.owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.data.object.sha,
    });

    return response.data.ref;
  }

  async branchExists(repo: string, branchName: string): Promise<boolean> {
    try {
      await this.octokit.git.getRef({
        owner: this.owner,
        repo,
        ref: `heads/${branchName}`,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // PULL REQUEST MANAGEMENT
  // ==========================================================================

  async createPullRequest(
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = "main"
  ): Promise<{
    prNumber: number;
    prUrl: string;
  }> {
    const response = await this.octokit.pulls.create({
      owner: this.owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      prNumber: response.data.number,
      prUrl: response.data.html_url,
    };
  }

  async mergePullRequest(
    repo: string,
    prNumber: number,
    commitTitle?: string
  ): Promise<boolean> {
    try {
      await this.octokit.pulls.merge({
        owner: this.owner,
        repo,
        pull_number: prNumber,
        commit_title: commitTitle,
        merge_method: "squash",
      });
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // COMMIT OPERATIONS
  // ==========================================================================

  async commitMultipleFiles(
    repo: string,
    files: Array<{ path: string; content: string }>,
    message: string,
    branch: string = "main"
  ): Promise<string> {
    // Get the current commit SHA
    const refResponse = await this.octokit.git.getRef({
      owner: this.owner,
      repo,
      ref: `heads/${branch}`,
    });
    const currentCommitSha = refResponse.data.object.sha;

    // Get the tree SHA
    const commitResponse = await this.octokit.git.getCommit({
      owner: this.owner,
      repo,
      commit_sha: currentCommitSha,
    });
    const treeSha = commitResponse.data.tree.sha;

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const blobResponse = await this.octokit.git.createBlob({
          owner: this.owner,
          repo,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blobResponse.data.sha,
        };
      })
    );

    // Create a new tree
    const treeResponse = await this.octokit.git.createTree({
      owner: this.owner,
      repo,
      base_tree: treeSha,
      tree: blobs,
    });

    // Create a new commit
    const newCommitResponse = await this.octokit.git.createCommit({
      owner: this.owner,
      repo,
      message,
      tree: treeResponse.data.sha,
      parents: [currentCommitSha],
    });

    // Update the branch reference
    await this.octokit.git.updateRef({
      owner: this.owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommitResponse.data.sha,
    });

    return newCommitResponse.data.sha;
  }
}

// ============================================================================
// PROJECT FILE GENERATORS
// ============================================================================

export function generateProjectFiles(
  projectName: string,
  componentCode: string,
  componentName: string,
  options: {
    framework: string;
    styling: string;
  }
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  // package.json
  files.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: projectName.toLowerCase().replace(/\s+/g, "-"),
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          lint: "next lint",
        },
        dependencies: {
          next: "^15.1.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
        },
        devDependencies: {
          "@types/node": "^22",
          "@types/react": "^19",
          "@types/react-dom": "^19",
          typescript: "^5",
          tailwindcss: "^3.4.1",
          postcss: "^8",
          autoprefixer: "^10",
        },
      },
      null,
      2
    ),
  });

  // tsconfig.json
  files.push({
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2
    ),
  });

  // tailwind.config.ts
  files.push({
    path: "tailwind.config.ts",
    content: `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
`,
  });

  // postcss.config.mjs
  files.push({
    path: "postcss.config.mjs",
    content: `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
`,
  });

  // next.config.ts
  files.push({
    path: "next.config.ts",
    content: `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`,
  });

  // app/globals.css
  files.push({
    path: "app/globals.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
  });

  // app/layout.tsx
  files.push({
    path: "app/layout.tsx",
    content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${projectName}",
  description: "Generated by Figgo Pro",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
  });

  // app/page.tsx - uses the generated component
  files.push({
    path: "app/page.tsx",
    content: `import ${componentName} from "@/components/${componentName}";

export default function Home() {
  return (
    <main>
      <${componentName} />
    </main>
  );
}
`,
  });

  // components/[ComponentName].tsx
  files.push({
    path: `components/${componentName}.tsx`,
    content: componentCode,
  });

  // .gitignore
  files.push({
    path: ".gitignore",
    content: `node_modules/
.next/
.env
.env.local
`,
  });

  // README.md
  files.push({
    path: "README.md",
    content: `# ${projectName}

Generated by [Figgo Pro](https://figgo.pro) - Design to Production Pipeline

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)
`,
  });

  return files;
}
