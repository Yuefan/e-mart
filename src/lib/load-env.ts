import path from "node:path";

/**
 * Loads .env for standalone Node entrypoints (the worker, CLI scripts).
 * Next.js does this for the web process; a bare `tsx` run gets nothing.
 *
 * Import this **first** — imports are hoisted, so a `loadEnvFile()` call sitting
 * above them in source order still runs after `@/lib/prisma` has already read
 * DATABASE_URL and thrown.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // No .env file — fall back to real environment variables.
}
