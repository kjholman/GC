-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "analysisCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from finished analyses
UPDATE "Deal" d SET "analysisCount" = (SELECT COUNT(*) FROM "Analysis" a WHERE a."dealId" = d."id" AND a."status" = 'COMPLETE');
