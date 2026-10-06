-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "steps" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "autoNamed" BOOLEAN NOT NULL DEFAULT false;
