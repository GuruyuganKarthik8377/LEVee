import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The levee folder, so the website can import the backend's published playbook from ../backend.
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
