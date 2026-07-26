-- Reporting address, kept apart from the Google sign-in address.
ALTER TABLE "User" ADD COLUMN "notifyEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "notifyEmailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "notifyOnAudit" BOOLEAN NOT NULL DEFAULT true;

-- Mirrors the locale cookie so background jobs can choose a language.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

-- Pending "is this address yours?" challenges.
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");
CREATE INDEX "EmailVerification_userId_createdAt_idx" ON "EmailVerification"("userId", "createdAt");

ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
