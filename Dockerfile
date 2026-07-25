# syntax=docker/dockerfile:1

# Two runtime targets are produced from one dependency tree:
#
#   runner  — the Next.js standalone bundle. Small, serves HTTP.
#   toolbox — full node_modules plus TypeScript sources. Runs the background
#             worker (tsx needs the sources) and `prisma migrate deploy`
#             (the CLI and the migrations folder are not in standalone).
#
# better-sqlite3 is a native module, so it is compiled inside the image for the
# target platform. Never copy a host-built node_modules in.

ARG NODE_VERSION=24-bookworm-slim

# ---------- dependencies ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# python3/make/g++ are needed to compile better-sqlite3 from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/lib/db-url.ts ./src/lib/db-url.ts

# postinstall runs `prisma generate`, which needs the schema and the config's
# imports to already be present — hence the copies above.
RUN npm ci

# ---------- build ----------
FROM deps AS builder
WORKDIR /app
COPY . .

# A stale .next/dev from a developer's machine makes the type check fail on
# generated route types that no longer match.
RUN rm -rf .next && npm run build

# ---------- toolbox: worker + migrations ----------
FROM builder AS toolbox
WORKDIR /app
ENV NODE_ENV=production
# Outbound calls go through the proxy when one is configured; without
# HTTPS_PROXY set this is a no-op.
ENV NODE_USE_ENV_PROXY=1
CMD ["npm", "run", "worker"]

# ---------- runner: the web server ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_USE_ENV_PROXY=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone carries only the traced dependencies, including the compiled
# better_sqlite3.node. Static assets and public/ are not traced and must be
# copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
