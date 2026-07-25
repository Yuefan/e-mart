import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next guess the wrong workspace
  // root; pin it to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // better-sqlite3 is a native module — keep it out of the bundle.
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3"],
};

export default nextConfig;
