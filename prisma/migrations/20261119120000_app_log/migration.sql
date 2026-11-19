CREATE TABLE "AppLog" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "analysisId" TEXT,
    CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppLog_createdAt_idx" ON "AppLog"("createdAt");
CREATE INDEX "AppLog_level_id_idx" ON "AppLog"("level", "id");
