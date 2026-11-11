import path from "node:path";
import type { NextConfig } from "next";

// The repository's top folder. The website imports the backend from ../backend, so builds and deployments start from there.
const root = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root },
  // On Vercel each route is packaged on its own: include the backend's files and packages it uses from outside frontend/,
  outputFileTracingRoot: root,
  // and the recorded storms and sample proof the backend reads from disk while it runs.
  outputFileTracingIncludes: { "/**": ["../backend/agents/fixtures/**/*"] },
};

export default nextConfig;
