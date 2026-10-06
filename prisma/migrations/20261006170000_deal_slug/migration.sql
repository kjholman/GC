-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_slug_key" ON "Deal"("slug");
