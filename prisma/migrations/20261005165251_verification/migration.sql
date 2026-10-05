-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "revisions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signOffNote" TEXT,
ADD COLUMN     "signedOffAt" TIMESTAMP(3),
ADD COLUMN     "signedOffById" TEXT,
ADD COLUMN     "verification" JSONB,
ADD COLUMN     "verificationStatus" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "plainText" TEXT;
