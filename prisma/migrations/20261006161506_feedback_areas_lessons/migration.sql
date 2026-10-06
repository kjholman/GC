-- AlterTable
ALTER TABLE "AnalysisFeedback" ADD COLUMN     "appliesTo" TEXT,
ADD COLUMN     "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "interpretedAt" TIMESTAMP(3),
ADD COLUMN     "lesson" TEXT;
