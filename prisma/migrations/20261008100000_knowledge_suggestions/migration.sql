-- CreateTable
CREATE TABLE "KnowledgeSuggestion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sourceFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    CONSTRAINT "KnowledgeSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeSuggestion_status_idx" ON "KnowledgeSuggestion"("status");
