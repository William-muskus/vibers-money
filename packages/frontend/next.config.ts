import type { NextConfig } from 'next';

const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      // Proxy orchestrator API to avoid CORS (EventSource blocked cross-origin in some browsers)
      { source: '/api/orchestrator/:path*', destination: `${orchestratorUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
