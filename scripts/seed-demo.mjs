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

  await seedBrandVoiceAndDraft(site.id);

  console.log(`Seeded ${records.length} rows for ${site.name} (${site.id})`);
  console.log("Sign-in email: demo@example.com");
}

/**
 * A brand voice and one draft, so the content editor and its SEO bar can be
 * used before an AI gateway is configured. The draft is deliberately imperfect
 * — a too-long meta title and one missing alt — so the checks have something
 * to report.
 */
async function seedBrandVoiceAndDraft(siteId) {
  await prisma.site.update({
    where: { id: siteId },
    data: {
      brandVoice: JSON.stringify({
        tone: "professional but approachable, engineer-to-engineer",
        audience: "EU/US procurement managers and hardware engineers",
        language: "en-US",
        coreTopics: ["smart hardware", "IoT sensing", "ODM manufacturing"],
        keywords: ["posture sensor", "garden robot", "RTK positioning"],
        forbidden: ["cheap", "guaranteed results"],
        wordCountRange: [1200, 1800],
        referenceUrls: [],
        imageStyle: "clean product photography, soft studio lighting, no text overlay",
      }),
    },
  });

  const bodyMd = `Choosing a posture sensor for a hardware product usually comes down to
three questions: what you are actually measuring, how much drift you can
tolerate, and who is going to calibrate it.

## What a posture sensor actually measures

Most modules marketed as posture sensors are a six-axis IMU with a fusion
filter on top. The raw signal is acceleration and angular velocity; posture is
an inference drawn from them. That distinction matters because the inference is
where vendors differ, and where results diverge once a device leaves the bench.

A seat cushion that reports "slouching" is running a classifier over a pressure
map, not reading a posture value off a pin. If a datasheet quotes accuracy
without describing the classifier, it is quoting the IMU.

{{IMAGE_1}}

## Drift, and why bench numbers mislead

Gyroscope bias drifts with temperature. A module that holds 0.5 degrees over a
ten-minute bench run can be several degrees off after an hour in a warm room,
which is exactly the condition a seat cushion lives in.

Ask for the drift figure at the operating temperature you actually expect, over
the session length you actually expect. See our
[RTK positioning explainer](https://demo.example.com/blogs/rtk-positioning-explained)
for the same problem in a different domain.

### Compensation strategies

Periodic re-zeroing when the device detects stillness is the cheapest fix and
works well for seating, where the user is stationary for long stretches. Kalman
filtering against a second reference is more robust and considerably more work.

## Calibration ownership

The question nobody asks until the second production run: who calibrates each
unit, and when. Factory calibration is faster to ship and degrades over time.
Field calibration survives longer but needs a user flow that people will
actually complete.

For a [garden robot](https://demo.example.com/products/garden-robot) the answer
is usually factory, because the user will not do it. For a wearable, field
calibration on first use is normal.

## FAQ

### How accurate does a posture sensor need to be?

For posture feedback, distinguishing five to seven seated positions is enough.
Degree-level precision is rarely the constraint; consistency between sessions
is.

### Can one IMU cover both posture and activity tracking?

Yes, though the sampling rates differ. Activity tracking wants higher rates for
short bursts; posture wants lower rates sustained over hours. Budget for the
higher of the two.
`;

  await prisma.article.upsert({
    where: { siteId_slug: { siteId, slug: "choosing-a-posture-sensor" } },
    update: {},
    create: {
      siteId,
      title: "Choosing a posture sensor: accuracy, drift and calibration",
      slug: "choosing-a-posture-sensor",
      excerpt:
        "What posture sensors actually measure, why bench accuracy figures mislead, and who ends up owning calibration.",
      bodyMd,
      // Deliberately 3 characters over the 60-char limit so the bar shows a warning.
      metaTitle: "Choosing a Posture Sensor: Accuracy, Drift and Calibration",
      metaDesc:
        "What posture sensors measure, why bench accuracy figures mislead once a device warms up, and how to decide who owns calibration.",
      targetKeyword: "posture sensor",
      searchIntent: "commercial",
      status: "draft",
      checks: JSON.stringify({ issues: [], seeded: true }),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
