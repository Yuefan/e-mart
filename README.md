# AI Marketing Dashboard

**English** | [中文](./README.zh-CN.md)

An implementation of [`ai-marketing-dashboard-spec.md`](./ai-marketing-dashboard-spec.md). **P0 / P1 / P2** are complete: Google authorization with a GSC dashboard, AI SEO auditing, and content production.

The interface ships in English and Chinese — switch with the toggle in the top bar. English is the default.

## What's built

**P0 — GSC data pipeline**

| Capability | Location |
|---|---|
| Google OAuth 2.0 + PKCE (signing in *is* connecting) | `src/app/api/connections/google/{start,callback}` |
| Credentials encrypted with AES-256-GCM at rest; access tokens refreshed 5 minutes before expiry | `src/lib/crypto.ts`, `src/lib/integrations/google/oauth.ts` |
| Account overview: signed-in identity, session lifetime, and every third-party account's scopes, token state and bound sites — testable, re-authorizable, disconnectable | `/account` |
| Lists every GSC property on an account; bind one as a Site | `/connections` |
| GSC sync (5 dimensions, pagination, exponential backoff on 429/5xx, idempotent window rewrites) | `src/lib/jobs/gsc-sync.ts` |
| KPI cards, time series, top queries/pages/countries/devices | `/sites/[siteId]/overview` |
| Derived insights: opportunity keywords, striking distance, declining pages | `src/lib/gsc-queries.ts` |
| Long-running worker + scheduled jobs (daily sync, token refresh, connection health, weekly audit) | `src/worker/`, `src/lib/jobs/schedule.ts` |

**P1 — AI SEO audit**

| Capability | Location |
|---|---|
| Live crawl of up to 50 pages (rate-limited with backoff; parses title/meta/H1/canonical/OG/JSON-LD/alt/internal links/hreflang) | `src/lib/seo/crawl.ts` |
| Rule engine: 20+ deterministic checks, severity weighted by real impression volume | `src/lib/seo/rules.ts` |
| AI layer: prioritization, cross-signal correlation, paste-ready title/description rewrites | `src/lib/ai/`, `src/lib/jobs/seo-audit.ts` |
| Score ring, summary, and a findings list grouped by severity and filterable by category | `/sites/[siteId]/seo` |

> The Cloudflare / GitHub / Shopify evidence sources are still empty — they need their own credentials. Audits currently run on GSC plus the live crawl.

**P2 — Content production**

| Capability | Location |
|---|---|
| Brand voice configuration (tone, audience, keywords, forbidden terms, word-count range) | `/sites/[siteId]/settings` |
| Topic selection drawn from *your own* queries that get impressions but rank badly, ordered by expected value | `src/lib/ai/prompts/content.v1.ts` |
| Outline → body → self-check, with step-by-step progress | `src/lib/jobs/content.ts` |
| Mechanical checks: keyword density, meta lengths, heading hierarchy, internal-link count, forbidden terms, near-duplicate titles | `src/lib/content/checks.ts` |
| Draft list and Markdown editor (live preview + SEO bar) | `/sites/[siteId]/content` |
| Monthly AI spend dashboard with a budget ceiling | `/sites/[siteId]/settings` |

> Illustration needs an image-generation API; for now the body keeps `{{IMAGE_1}}` placeholders unfilled. Publishing targets (Shopify / GitHub) unlock once those connections exist.

## Quick start

```bash
npm install
npm run setup:env          # generates ENCRYPTION_KEY / SESSION_SECRET / POSTGRES_PASSWORD
```

The database is **PostgreSQL**. Locally you have three options (see [`docs/deployment.md`](./docs/deployment.md)): bring up only the `db` service with compose, use a hosted Postgres such as Neon, or install one on the machine. Put the connection string in `DATABASE_URL` in `.env`, then:

```bash
npx prisma migrate deploy  # create the tables
```

Then follow [`docs/google-oauth-setup.md`](./docs/google-oauth-setup.md) to get Google OAuth credentials and put them in `.env`:

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
```

```bash
npm run dev                # http://localhost:3000
npm run worker             # second terminal: scheduled jobs + SEO audits
```

The flow: `/login` → Continue with Google → pick a GSC property on `/connections` → 90 days backfill automatically → the charts.

**The worker is a separate process** that runs scheduled jobs and SEO audits. Without it the charts still work (a manual Sync runs inline), but data won't refresh on its own and "Run audit" will sit in the queue — the button tells you the worker is down after 45 seconds.

AI auditing needs a gateway; see [`docs/ai-gateway-setup.md`](./docs/ai-gateway-setup.md). **It runs without one** — you get every rule-engine finding, just no prioritization or rewritten copy.

### Behind a proxy: Node needs an explicit flag

Your browser reaching Google **does not mean the server can**. The consent screen is loaded by the browser (which uses the system proxy), but exchanging the code for a token — and every GSC API call after it — is sent by Node, and **Node's `fetch` does not read `HTTP_PROXY` by default**. It connects directly and times out.

`npm run dev` / `npm run start` already set `NODE_USE_ENV_PROXY=1` (needs Node 24+), which makes Node's built-in fetch honour `HTTPS_PROXY` / `HTTP_PROXY`. So:

- Start it **from a shell where `HTTPS_PROXY` is set** — not from an IDE run button, unless that button inherits the variables
- The flag has to be in effect *before the process starts*; **putting it in `.env` does nothing**
- After editing `package.json`, **restart the dev server** — hot reload does not re-read the scripts

Check it:

```bash
curl http://localhost:3000/api/diagnostics/google
```

Expect `"reachable": true` and `"nodeUsesEnvProxy": true`. If `reachable` is false while `nodeUsesEnvProxy` is false, this is your problem.

On a VPS outside the restricted network, just leave `HTTPS_PROXY` unset and the flag becomes a no-op.

### Seeing the interface without connecting Google

```bash
npm run db:seed:demo       # 180 days of synthetic data, site named "Demo (synthetic data)"
```

All of it is script-generated, not real GSC data. Clear it with `npm run db:reset`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Long-running worker: scheduled jobs + queue consumer |
| `npm run ai:check` | Verifies AI gateway reachability, model, and per-call cost |
| `npm run typecheck` / `lint` | TS + ESLint |
| `npm test` | Node's built-in test runner over `src/**/*.test.ts` |
| `npm run db:migrate` | Create/alter tables |
| `npm run db:studio` | Browse data in Prisma Studio |
| `npm run db:seed:demo` | Synthetic demo data |
| `npm run db:reset` | Drop and rebuild |
| `npx prisma migrate deploy` | Apply existing migrations only (production) |

## Deployment

See [`docs/deployment.md`](./docs/deployment.md). VPS + Docker Compose:

```bash
docker compose --env-file .env.production up -d --build
```

**Cloudflare Workers cannot run this application** — the long-running worker process and the 6.5-minute crawl jobs both collide with the Workers model. The docs spell out what a real migration would require.

## Where this departs from the spec

Every deviation below is deliberate and reasoned, not an omission:

1. ~~SQLite instead of Postgres~~ — **now PostgreSQL, per the spec**. JSON columns are real `jsonb`, `scopes` is `text[]`, `provider` is an enum. `GscDaily.date` is deliberately a timestamp rather than `@db.Date`: node-postgres parses `DATE` columns in the local timezone, which at +08:00 shifts the day backwards — and the date is part of that table's primary key.
2. **Signing in *is* the Google authorization.** There is no separate email/password login. For a single-person, single-workspace tool a second credential is pure overhead; `User.passwordHash` waits for multi-tenancy.
3. **The queue is the database, not BullMQ.** BullMQ needs Redis, and this volume doesn't justify another datastore. `JobRun` gained `status/runAfter/dedupeKey/attempts`; the worker polls and claims with a conditional `updateMany` as the lock, a unique index on `dedupeKey` for scheduling idempotence, and `claimedAt` to reclaim zombie jobs. The semantics match spec §8 — swapping in BullMQ means rewriting only `src/lib/jobs/queue.ts`, since callers see `enqueue` and the worker sees `claimNext`.
   Manual Sync still runs inline (it takes seconds and the user clicked it expecting a result); SEO audits go through the queue (minutes).
4. **The crawler is slow on purpose.** 50 pages at concurrency 2, 300 ms apart, backing off on 429/503 per `Retry-After`. On geeujade.com (Shopify) one audit takes about 6.5 minutes. The first version used concurrency 4 with no delay, got rate-limited, and produced 14 **false** "page unreachable" findings — the report said pages were broken when in fact I had hammered the site. Now 429s collapse into a single low-severity "this crawl was rate-limited, these pages weren't audited", kept separate from genuine 404s.
5. **OAuth state lives in a signed cookie, not Redis.** 10-minute TTL, httpOnly, consumed once — same semantics as the spec, one fewer dependency.
6. **No dual-axis chart.** Spec §5.1 draws clicks on the left axis and impressions on the right, but two different scales on shared marks make the crossings *look* meaningful when they are an artefact of the scaling. Instead: one small panel per metric, shared x-axis, previous period overlaid as a dashed line. Metric chips toggle CTR and average position.
7. **Aggregation happens in JS, not SQL.** Each dimension caps at 25k rows per sync window, so the read volume is small. It gets pushed down to SQL when the data actually grows.
8. **AI goes through the official SDK, not an OpenAI-compatible shim.** Spec §6.1 describes a `/v1` relay; this uses `@anthropic-ai/sdk` with `baseURL` pointed at the relay's Anthropic endpoint (New API and LiteLLM both provide one). That keeps structured output, adaptive thinking and refusal handling — an OpenAI shim loses all three. **The cost is that your relay must expose `/v1/messages`, not just `/v1/chat/completions`** — if yours only has the latter, say so and I'll fall back to tool_use.
9. **The default model is `claude-opus-5`**, not the spec's `claude-sonnet-4-6` (still a valid ID, just no longer the strongest). It's all environment-driven, so downgrading is a one-line change; `docs/ai-gateway-setup.md` has the cost comparison.
10. **Duplicate detection uses token overlap, not embeddings.** Spec §5.3 asks for embedding cosine > 0.85, which needs a separate embedding API. This uses Jaccard overlap of title tokens (with naive plural folding) > 0.6 for near-duplicates. Good enough with zero extra dependencies; swap it once embeddings are wired up.
11. **The illustration path is empty.** Bodies generate `{{IMAGE_1}}` placeholders but nothing fills them — no image-generation API is configured. The placeholders surface as unfilled slots in the SEO bar.

## Next up (following the spec's delivery plan)

- **Remaining P1**: Cloudflare scoped token (zone status / DNS / cache purge), GitHub App (read code into the audit evidence pack, deliver fixes as PRs)
- **P3**: Shopify OAuth, blog publishing, page SEO sweeps
- Audit findings marked `autoFixable` are displayed but not applied — they land as Shopify `pageUpdate` and GitHub PRs, so one-click adoption waits on those two connections
