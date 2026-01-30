export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-20">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-6">
            Figgo <span className="text-figma-purple">Pro</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Design-approved changes become production-safe deployments with one click.
            Real-time sync between Figma, Code, and Production.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/auth/signin"
              className="px-8 py-3 bg-figma-purple hover:bg-figma-purple/80 rounded-lg font-semibold transition"
            >
              Get Started
            </a>
            <a
              href="/docs"
              className="px-8 py-3 border border-gray-600 hover:border-gray-400 rounded-lg font-semibold transition"
            >
              Documentation
            </a>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="w-12 h-12 bg-figma-green/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-figma-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Real-Time Sync</h3>
            <p className="text-gray-400 text-sm">
              Figma webhooks detect changes instantly. Know exactly what changed and where.
            </p>
          </div>

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="w-12 h-12 bg-figma-blue/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-figma-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Component Registry</h3>
            <p className="text-gray-400 text-sm">
              Track Figma nodes to code components. Full traceability from design to deployment.
            </p>
          </div>

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="w-12 h-12 bg-figma-orange/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-figma-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Safe Deployments</h3>
            <p className="text-gray-400 text-sm">
              Preview deployments with visual diff. Approve before going live. Instant rollback.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
