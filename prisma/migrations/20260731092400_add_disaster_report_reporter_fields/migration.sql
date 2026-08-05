/*
  Warnings:

  - Added the required column `reporterName` to the `DisasterReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reporterPhone` to the `DisasterReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DisasterReport" ADD COLUMN     "reporterName" TEXT NOT NULL,
ADD COLUMN     "reporterPhone" TEXT NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "tanggalKejadian" SET DEFAULT CURRENT_TIMESTAMP;
