import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the fetch cache size limit to handle large ZIP archives
  experimental: {
    fetchCacheKeyPrefix: "kolko-kosta",
  },
  // Allow large response bodies
  serverExternalPackages: ["jszip"],
};

export default nextConfig;
