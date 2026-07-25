import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./db-url";

// Prisma 7 talks to the database through a driver adapter.
function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Dev reuses the client across HMR reloads so editing a file doesn't open a
// new pool each time; production keeps it in module scope.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let cached: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    return (globalForPrisma.prisma ??= createClient());
  }
  return (cached ??= createClient());
}

/**
 * Constructed on first use, not on import.
 *
 * `next build` evaluates every route module while collecting page data, and
 * the image build has no DATABASE_URL — building the client at module scope
 * made the whole build fail on a connection string it never used. Deferring it
 * also means a bad URL surfaces at the first query rather than as an opaque
 * import-time crash.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property);
    // Prisma's methods rely on `this`, so hand back a bound copy — that keeps
    // `const { site } = prisma` and `prisma.$transaction(...)` working.
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
});
