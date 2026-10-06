-- CreateTable
CREATE TABLE "KnowledgeFile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL,
    "portfolioCompanyId" TEXT,
    "historicalDealId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READING',
    "extractedText" TEXT,
    "summary" TEXT,
    "uploadedById" TEXT,

    CONSTRAINT "KnowledgeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFileChunk" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "KnowledgeFileChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeFile_scope_idx" ON "KnowledgeFile"("scope");
CREATE INDEX "KnowledgeFile_portfolioCompanyId_idx" ON "KnowledgeFile"("portfolioCompanyId");
CREATE INDEX "KnowledgeFile_historicalDealId_idx" ON "KnowledgeFile"("historicalDealId");
CREATE UNIQUE INDEX "KnowledgeFileChunk_fileId_index_key" ON "KnowledgeFileChunk"("fileId", "index");

-- AddForeignKey
ALTER TABLE "KnowledgeFileChunk" ADD CONSTRAINT "KnowledgeFileChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "KnowledgeFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
