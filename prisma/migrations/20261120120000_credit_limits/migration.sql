-- Per-person AI credit allowances.
ALTER TABLE "User" ADD COLUMN "creditLimitUsd" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "creditSince" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "creditCutOff" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AiUsage" ADD COLUMN "userId" TEXT;
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
-- Attribute past analysis spend to the person who started each analysis (for reports).
UPDATE "AiUsage" u SET "userId" = a."createdById" FROM "Analysis" a WHERE u."analysisId" = a."id" AND u."userId" IS NULL;

ALTER TABLE "Analysis" ADD COLUMN "pauseReason" TEXT;
UPDATE "Analysis" SET "pauseReason" = 'anthropic_credit' WHERE "status" = 'PAUSED';

CREATE TABLE "CreditChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "byId" TEXT,
    "kind" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "limitBefore" DOUBLE PRECISION,
    "limitAfter" DOUBLE PRECISION,
    "usedBefore" DOUBLE PRECISION,
    "note" TEXT,
    CONSTRAINT "CreditChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreditChange_userId_createdAt_idx" ON "CreditChange"("userId", "createdAt");
