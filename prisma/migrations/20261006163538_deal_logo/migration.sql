-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "logoMime" TEXT;
