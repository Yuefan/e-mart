import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/lib/db-url";

// Prisma 7 no longer auto-loads .env — do it explicitly.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // no .env file — fall back to real environment variables
}

// `prisma generate` does not connect to anything, and it runs as a postinstall
// hook inside the image build where no DATABASE_URL exists. Declaring the
// datasource unconditionally made that build fail on a value it never used.
//
// The migrate commands do connect; they report a missing datasource clearly on
// their own, and resolveDatabaseUrl still rejects a malformed one.
const databaseUrl = process.env.DATABASE_URL ? resolveDatabaseUrl() : null;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
