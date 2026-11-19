-- Analyses wait for their projected cost to be confirmed before running.
ALTER TYPE "AnalysisStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRMATION' BEFORE 'QUEUED';
ALTER TABLE "Analysis" ADD COLUMN "estimateUsd" DOUBLE PRECISION;
ALTER TABLE "Analysis" ADD COLUMN "estimate" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Analysis" ADD COLUMN "confirmedById" TEXT;
