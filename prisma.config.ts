import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/lib/db-url";

// Prisma 7 no longer auto-loads .env — do it explicitly.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // no .env file — fall back to real environment variables
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
