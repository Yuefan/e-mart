/**
 * Reads and validates DATABASE_URL.
 *
 * Kept as a single choke point so the Prisma CLI (via prisma.config.ts) and the
 * runtime client can never disagree about which database they are talking to.
 */
export function resolveDatabaseUrl(url = process.env.DATABASE_URL): string {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — copy .env.example to .env (see docs/deployment.md).",
    );
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      `DATABASE_URL must be a postgresql:// connection string, got "${url.split(":")[0]}:". ` +
        "This project moved off SQLite; see docs/deployment.md.",
    );
  }

  return url;
}
