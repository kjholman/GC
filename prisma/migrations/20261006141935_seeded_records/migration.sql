-- AlterTable
ALTER TABLE "HistoricalDeal" ADD COLUMN     "seeded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PortfolioCompany" ADD COLUMN     "seeded" BOOLEAN NOT NULL DEFAULT false;
