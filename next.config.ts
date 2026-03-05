import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    'preview-chat-e7f8ae98-a89e-41d8-9b98-3a54aa164d1e.space.z.ai',
    '.space.z.ai',
  ],
};

export default nextConfig;
