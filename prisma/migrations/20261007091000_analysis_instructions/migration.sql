-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "refreshResearch" BOOLEAN NOT NULL DEFAULT false;
