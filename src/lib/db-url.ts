import path from "node:path";

/**
 * SQLite `file:` URLs are resolved relative to *different* base directories by
 * the Prisma CLI (schema dir) and by our runtime code (process cwd). Normalise
 * both to an absolute path so `DATABASE_URL` always means "relative to the
 * project root", whichever entry point reads it.
 *
 * No-op for non-file URLs, so switching to `postgresql://` later just works.
 */
export function resolveDatabaseUrl(url = process.env.DATABASE_URL): string {
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  }
  if (!url.startsWith("file:")) return url;

  const raw = url.slice("file:".length);
  if (raw === ":memory:" || path.isAbsolute(raw)) return url;

  // Forward slashes even on Windows — the driver treats backslashes literally.
  return `file:${path.resolve(process.cwd(), raw).replace(/\\/g, "/")}`;
}
