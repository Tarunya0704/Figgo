import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "figma-alpha-api.s3.us-west-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "s3-alpha.figma.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
