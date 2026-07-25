#!/usr/bin/env node
// Seeds an obviously-fake demo site so the dashboard can be developed and
// reviewed without connecting a real Google account.
//
//   npm run db:seed:demo
//
// The site is named "Demo (synthetic data)" on demo.example.com and has no
// Google binding, so it can never be confused with real Search Console data.
// Re-running replaces the previous demo rows.

import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

process.loadEnvFile(path.join(process.cwd(), ".env"));

const rawUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const url = rawUrl.startsWith("file:")
  ? `file:${path.resolve(process.cwd(), rawUrl.slice(5)).replace(/\\/g, "/")}`
  : rawUrl;

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const DAYS = 180;
const DAY_MS = 86_400_000;

const QUERIES = [
  "posture sensor cushion", "smart seat cushion", "garden robot rtk",
  "iot sensing module", "odm hardware manufacturer", "rtk positioning module",
  "ergonomic office cushion", "lawn mowing robot", "pressure sensor mat",
  "bluetooth posture tracker", "smart cushion app", "hardware odm china",
  "robot lawn mower gps", "seat pressure mapping", "posture correction device",
];
const PAGES = [
  "/", "/products/smart-cushion", "/products/garden-robot", "/blog/rtk-positioning-explained",
  "/blog/posture-sensing-101", "/about", "/contact", "/blog/odm-vs-oem",
  "/products/sensor-module", "/blog/choosing-a-lawn-robot",
];
const COUNTRIES = [
  ["usa", 0.34], ["deu", 0.16], ["gbr", 0.12], ["fra", 0.08],
  ["nld", 0.06], ["can", 0.05], ["aus", 0.04], ["jpn", 0.03],
];
const DEVICES = [["DESKTOP", 0.52], ["MOBILE", 0.42], ["TABLET", 0.06]];

// Deterministic PRNG so repeated seeds produce the same chart.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const utcDay = (offsetFromToday) => {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight + offsetFromToday * DAY_MS);
};

function row(siteId, date, dimension, dimValue, impressions, ctr, position) {
  const clicks = Math.round(impressions * ctr);
  return {
    siteId,
    date,
    dimension,
    dimValue,
    clicks,
    impressions: Math.round(impressions),
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
  };
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    create: { email: "demo@example.com", name: "Demo User" },
    update: {},
  });

  const site = await prisma.site.upsert({
    where: { userId_domain: { userId: user.id, domain: "demo.example.com" } },
    create: { userId: user.id, name: "Demo (synthetic data)", domain: "demo.example.com" },
    update: {},
  });

  await prisma.gscDaily.deleteMany({ where: { siteId: site.id } });

  const records = [];

  for (let i = DAYS; i >= 2; i--) {
    const date = utcDay(-i);
    const dayOfWeek = date.getUTCDay();
    const weekend = dayOfWeek === 0 || dayOfWeek === 6 ? 0.68 : 1;
    // Slow upward trend + weekly seasonality + noise.
    const growth = 1 + (DAYS - i) / DAYS * 0.55;
    const dailyImpressions = 950 * growth * weekend * (0.85 + rand() * 0.3);
    const dailyCtr = 0.021 + rand() * 0.012;
    const dailyPosition = 19.5 - (DAYS - i) / DAYS * 3.4 + (rand() - 0.5) * 1.6;

    records.push(row(site.id, date, "total", "", dailyImpressions, dailyCtr, dailyPosition));

    QUERIES.forEach((query, index) => {
      const share = 0.22 / (index * 0.55 + 1);
      const impressions = dailyImpressions * share * (0.7 + rand() * 0.6);
      if (impressions < 1) return;
      // A couple of queries are deliberately high-impression / low-CTR so the
      // "opportunity keywords" card has something to show.
      const ctr = index === 2 || index === 5 ? 0.004 + rand() * 0.004 : dailyCtr * (0.5 + rand());
      records.push(
        row(site.id, date, "query", query, impressions, ctr, 6 + index * 1.1 + rand() * 3),
      );
    });

    PAGES.forEach((page, index) => {
      const share = 0.3 / (index * 0.5 + 1);
      const impressions = dailyImpressions * share * (0.7 + rand() * 0.6);
      if (impressions < 1) return;
      // Later pages hover in the 11–15 "striking distance" band.
      const position = 4 + index * 1.35 + rand() * 2;
      // One page decays hard in the last three weeks to trigger the decline card.
      const decay = page === "/blog/odm-vs-oem" && i < 21 ? 0.35 : 1;
      records.push(
        row(
          site.id,
          date,
          "page",
          `https://demo.example.com${page}`,
          impressions * decay,
          dailyCtr * (0.6 + rand() * 0.9),
          position,
        ),
      );
    });

    for (const [country, share] of COUNTRIES) {
      records.push(
        row(
          site.id, date, "country", country,
          dailyImpressions * share * (0.85 + rand() * 0.3),
          dailyCtr * (0.7 + rand() * 0.6),
          dailyPosition + (rand() - 0.5) * 4,
        ),
      );
    }

    for (const [device, share] of DEVICES) {
      records.push(
        row(
          site.id, date, "device", device,
          dailyImpressions * share * (0.9 + rand() * 0.2),
          dailyCtr * (device === "MOBILE" ? 0.75 : 1.15),
          dailyPosition + (device === "MOBILE" ? 1.2 : -0.4),
        ),
      );
    }
  }

  for (let i = 0; i < records.length; i += 500) {
    await prisma.gscDaily.createMany({ data: records.slice(i, i + 500) });
  }

  await prisma.jobRun.create({
    data: {
      type: "gsc_sync",
      siteId: site.id,
      status: "done",
      progress: 100,
      finishedAt: new Date(),
      logs: JSON.stringify({ seeded: true, rows: records.length }),
    },
  });

  console.log(`Seeded ${records.length} rows for ${site.name} (${site.id})`);
  console.log("Sign-in email: demo@example.com");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
