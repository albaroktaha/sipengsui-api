/*
  Warnings:

  - You are about to drop the column `officerName` on the `Station` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Station` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Observation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ObservationSource" AS ENUM ('MANUAL', 'IMPORT_EXCEL', 'SENSOR', 'API');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('ARR', 'AWLR');

-- AlterTable
ALTER TABLE "Observation" ADD COLUMN     "observerName" TEXT,
ADD COLUMN     "source" "ObservationSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Station" DROP COLUMN "officerName",
DROP COLUMN "phone",
ADD COLUMN     "district" TEXT,
ADD COLUMN     "elevation" DOUBLE PRECISION,
ADD COLUMN     "installationYear" INTEGER,
ADD COLUMN     "operatorName" TEXT,
ADD COLUMN     "regency" TEXT,
ADD COLUMN     "village" TEXT;

-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importType" "ImportType" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL,
    "failedRows" INTEGER NOT NULL,
    "importedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "ImportHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
