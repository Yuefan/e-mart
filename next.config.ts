import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root: a stray lockfile in the home directory otherwise
  // makes Next guess wrong. Plain __dirname on purpose — a path.resolve() call
  // here is a filesystem operation inside the config, which makes Turbopack
  // trace the entire project into .next/standalone (34MB of src, docs and
  // spec files that the runtime never reads).
  turbopack: {
    root: __dirname,
  },
  // Self-hosted deployment: emit .next/standalone with only the traced
  // dependencies, so the runtime image doesn't carry the full node_modules.
  output: "standalone",
  // better-sqlite3 is a native module — keep it out of the bundle.
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3"],
};

export default nextConfig;
