import type { NextConfig } from "next";

// The portfolio site rewrites /where-to/* to this deployment, so every route lives under that prefix.
const nextConfig: NextConfig = {
  basePath: "/where-to",
};

export default nextConfig;
