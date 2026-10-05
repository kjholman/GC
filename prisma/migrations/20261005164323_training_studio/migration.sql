-- CreateEnum
CREATE TYPE "HistoricalDecision" AS ENUM ('INVESTED', 'PASSED_AFTER_DILIGENCE', 'PASSED_AT_SCREENING');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "precedents" JSONB;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "indication" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "HistoricalDeal" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "decisionYear" INTEGER,
    "decision" "HistoricalDecision" NOT NULL,
    "decisionRationale" TEXT NOT NULL,
    "outcome" "PortfolioOutcome" NOT NULL DEFAULT 'UNKNOWN',
    "outcomeNotes" TEXT,
    "sector" TEXT,
    "modality" TEXT,
    "indication" TEXT,
    "stage" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "digest" TEXT,
    "icMemoText" TEXT,
    "deckFilename" TEXT,
    "deckMimeType" TEXT,
    "deckData" BYTEA,
    "deckExtractedText" TEXT,
    "ingestStatus" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "ingestError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exemplar" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceAnalysisId" TEXT,
    "sector" TEXT,
    "modality" TEXT,
    "indication" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendation" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "memo" JSONB NOT NULL,
    "partnerCommentary" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exemplar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipleSuggestion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrincipleSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BacktestStatus" NOT NULL DEFAULT 'QUEUED',
    "config" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "historicalDealId" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "aiRecommendation" TEXT,
    "aiScore" INTEGER,
    "agree" BOOLEAN,
    "memo" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "HistoricalDeal_decision_idx" ON "HistoricalDeal"("decision");

-- CreateIndex
CREATE INDEX "BacktestResult_runId_idx" ON "BacktestResult"("runId");

-- AddForeignKey
ALTER TABLE "BacktestResult" ADD CONSTRAINT "BacktestResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestResult" ADD CONSTRAINT "BacktestResult_historicalDealId_fkey" FOREIGN KEY ("historicalDealId") REFERENCES "HistoricalDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
