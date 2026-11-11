import path from "node:path";
import type { NextConfig } from "next";

// The repository's top folder. The website imports the backend from ../backend, so builds and deployments start from there.
const root = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root },
  // On Vercel each route is packaged on its own: include the backend's files and packages it uses from outside frontend/,
  outputFileTracingRoot: root,
  // and the recorded storms and sample proof the backend reads from disk while it runs. On Vercel, Next.js leaves sharp out
  // of every route (Vercel resizes images itself), but the Verifier uses it to check partners' photos, so it goes back in.
  outputFileTracingIncludes: {
    "/**": [
      "../backend/agents/fixtures/**/*",
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/detect-libc/**/*",
      "./node_modules/semver/**/*",
    ],
  },
};

export default nextConfig;
