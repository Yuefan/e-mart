import { type JobType, enqueue } from "./queue";
import { prisma } from "@/lib/prisma";

/**
 * Repeatable jobs (spec §8), expressed as "which period are we in, and has that
 * period already been scheduled?" rather than as cron expressions.
 *
 * The scheduler ticks every minute and asks each entry for the dedupe key of
 * the current period. The unique index on JobRun.dedupeKey does the rest: the
 * first tick after the due time enqueues, every later tick is a no-op. This
 * also gives catch-up for free — a worker started at 09:00 still runs the
 * 04:00 job, because 09:00 is inside the same period.
 */

type Schedule = {
  type: JobType;
  /** Key for the period containing `now`, or null when it isn't due yet. */
  periodKey: (now: Date) => string | null;
  /** Fan out to one job per site instead of a single global job. */
  perSite: boolean;
  payload?: unknown;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** ISO-8601 week, so a Monday-scheduled job has a stable weekly identity. */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current week determines the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const SCHEDULES: Schedule[] = [
  {
    // Daily 04:00 UTC. Re-pulls the last 7 days so data that arrived late —
    // Search Console runs 2–3 days behind — gets corrected.
    type: "gsc_sync",
    perSite: true,
    payload: { days: 7 },
    periodKey: (now) => (now.getUTCHours() >= 4 ? `daily:${day(now)}` : null),
  },
  {
    type: "token_refresh",
    perSite: false,
    periodKey: (now) =>
      `30min:${day(now)}T${String(now.getUTCHours()).padStart(2, "0")}:${
        now.getUTCMinutes() < 30 ? "00" : "30"
      }`,
  },
  {
    type: "health_check",
    perSite: false,
    periodKey: (now) => `6h:${day(now)}:${Math.floor(now.getUTCHours() / 6)}`,
  },
  {
    // Monday 06:00 UTC. Any tick later in the week still catches a missed run.
    type: "seo_audit",
    perSite: true,
    payload: { triggeredBy: "cron" },
    periodKey: (now) => {
      const weekday = now.getUTCDay() || 7; // Mon = 1 … Sun = 7
      const dueYet = weekday > 1 || now.getUTCHours() >= 6;
      return dueYet ? `weekly:${isoWeek(now)}` : null;
    },
  },
];

export type TickResult = { enqueued: string[] };

/** One scheduler pass. Safe to call as often as you like. */
export async function tick(now = new Date()): Promise<TickResult> {
  const enqueued: string[] = [];

  const sites = await prisma.site.findMany({
    // A site with no Google binding has nothing to sync or audit.
    where: { bindings: { some: { connection: { provider: "GOOGLE" } } } },
    select: { id: true, domain: true },
  });

  for (const schedule of SCHEDULES) {
    const period = schedule.periodKey(now);
    if (!period) continue;

    if (!schedule.perSite) {
      const job = await enqueue({
        type: schedule.type,
        payload: schedule.payload,
        dedupeKey: `${schedule.type}:${period}`,
      });
      if (job) enqueued.push(`${schedule.type}:${period}`);
      continue;
    }

    for (const site of sites) {
      const job = await enqueue({
        type: schedule.type,
        siteId: site.id,
        payload: schedule.payload,
        dedupeKey: `${schedule.type}:${site.id}:${period}`,
      });
      if (job) enqueued.push(`${schedule.type}:${site.domain}:${period}`);
    }
  }

  return { enqueued };
}
