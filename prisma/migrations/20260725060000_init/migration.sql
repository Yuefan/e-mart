-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('GOOGLE', 'CLOUDFLARE', 'GITHUB', 'SHOPIFY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "brandVoice" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "encAccessToken" BYTEA NOT NULL,
    "encRefreshToken" BYTEA,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "meta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Binding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscDaily" (
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimValue" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GscDaily_pkey" PRIMARY KEY ("siteId","date","dimension","dimValue")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "siteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "logs" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAudit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER,
    "summary" TEXT,
    "rawInput" JSONB,
    "aiMeta" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyMd" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDesc" TEXT,
    "targetKeyword" TEXT,
    "searchIntent" TEXT,
    "coverImageUrl" TEXT,
    "images" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "outline" JSONB,
    "checks" JSONB,
    "aiMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishTarget" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "evidence" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "autoFixable" BOOLEAN NOT NULL DEFAULT false,
    "fixPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Site_userId_domain_key" ON "Site"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_userId_provider_accountLabel_key" ON "Connection"("userId", "provider", "accountLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Binding_siteId_connectionId_resourceId_key" ON "Binding"("siteId", "connectionId", "resourceId");

-- CreateIndex
CREATE INDEX "GscDaily_siteId_dimension_date_idx" ON "GscDaily"("siteId", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_dedupeKey_key" ON "JobRun"("dedupeKey");

-- CreateIndex
CREATE INDEX "JobRun_siteId_startedAt_idx" ON "JobRun"("siteId", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_status_runAfter_idx" ON "JobRun"("status", "runAfter");

-- CreateIndex
CREATE INDEX "SeoAudit_siteId_createdAt_idx" ON "SeoAudit"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "Article_siteId_status_createdAt_idx" ON "Article"("siteId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_siteId_slug_key" ON "Article"("siteId", "slug");

-- CreateIndex
CREATE INDEX "PublishTarget_articleId_idx" ON "PublishTarget"("articleId");

-- CreateIndex
CREATE INDEX "Finding_auditId_severity_idx" ON "Finding"("auditId", "severity");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GscDaily" ADD CONSTRAINT "GscDaily_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAudit" ADD CONSTRAINT "SeoAudit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTarget" ADD CONSTRAINT "PublishTarget_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

