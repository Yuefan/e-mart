-- CreateTable
CREATE TABLE "SeoAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER,
    "summary" TEXT,
    "rawInput" TEXT,
    "aiMeta" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "SeoAudit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "evidence" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "autoFixable" BOOLEAN NOT NULL DEFAULT false,
    "fixPayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    CONSTRAINT "Finding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "siteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT,
    "logs" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "JobRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobRun" ("finishedAt", "id", "logs", "progress", "siteId", "startedAt", "status", "type") SELECT "finishedAt", "id", "logs", "progress", "siteId", "startedAt", "status", "type" FROM "JobRun";
DROP TABLE "JobRun";
ALTER TABLE "new_JobRun" RENAME TO "JobRun";
CREATE UNIQUE INDEX "JobRun_dedupeKey_key" ON "JobRun"("dedupeKey");
CREATE INDEX "JobRun_siteId_startedAt_idx" ON "JobRun"("siteId", "startedAt");
CREATE INDEX "JobRun_status_runAfter_idx" ON "JobRun"("status", "runAfter");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SeoAudit_siteId_createdAt_idx" ON "SeoAudit"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_auditId_severity_idx" ON "Finding"("auditId", "severity");
