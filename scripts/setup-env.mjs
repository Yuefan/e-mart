#!/usr/bin/env node
// Creates .env from .env.example and fills in the two random secrets.
// Safe to re-run: existing values are never overwritten.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (!existsSync(examplePath)) {
  console.error("No .env.example found — run this from the project root.");
  process.exit(1);
}

let contents = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : readFileSync(examplePath, "utf8");

const generated = [];
for (const key of ["ENCRYPTION_KEY", "SESSION_SECRET", "POSTGRES_PASSWORD"]) {
  const empty = new RegExp(`^${key}=("")?\\s*$`, "m");
  if (empty.test(contents)) {
    contents = contents.replace(empty, `${key}="${randomBytes(32).toString("hex")}"`);
    generated.push(key);
  }
}

writeFileSync(envPath, contents);

console.log(existsSync(envPath) ? "Updated .env" : "Created .env");
if (generated.length) console.log(`Generated: ${generated.join(", ")}`);

const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter((key) =>
  new RegExp(`^${key}=("")?\\s*$`, "m").test(contents),
);
if (missing.length) {
  console.log(`\nStill needed: ${missing.join(", ")}`);
  console.log("See docs/google-oauth-setup.md for how to get them.");
}
