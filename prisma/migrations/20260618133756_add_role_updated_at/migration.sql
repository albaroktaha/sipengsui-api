/*
  Warnings:

  - You are about to drop the `District` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Regency` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `watershedId` to the `River` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `riverRegionId` to the `Watershed` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StationType" AS ENUM ('ARR', 'AWLR');

-- DropForeignKey
ALTER TABLE "District" DROP CONSTRAINT "District_regencyId_fkey";

-- AlterTable
ALTER TABLE "River" ADD COLUMN     "orderNumber" INTEGER,
ADD COLUMN     "parentRiverId" TEXT,
ADD COLUMN     "watershedId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Watershed" ADD COLUMN     "riverRegionId" TEXT NOT NULL;

-- DropTable
DROP TABLE "District";

-- DropTable
DROP TABLE "Regency";

-- CreateTable
CREATE TABLE "RiverRegion" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "geometry" JSONB,
    "description" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiverRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "watershedId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "StationType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "officerName" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "riverId" TEXT,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "rainfall" DOUBLE PRECISION,
    "waterLevel" DOUBLE PRECISION,
    "discharge" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiverRegion_code_key" ON "RiverRegion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RiverRegion_slug_key" ON "RiverRegion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- AddForeignKey
ALTER TABLE "Watershed" ADD CONSTRAINT "Watershed_riverRegionId_fkey" FOREIGN KEY ("riverRegionId") REFERENCES "RiverRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "River" ADD CONSTRAINT "River_watershedId_fkey" FOREIGN KEY ("watershedId") REFERENCES "Watershed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "River" ADD CONSTRAINT "River_parentRiverId_fkey" FOREIGN KEY ("parentRiverId") REFERENCES "River"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_watershedId_fkey" FOREIGN KEY ("watershedId") REFERENCES "Watershed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_riverId_fkey" FOREIGN KEY ("riverId") REFERENCES "River"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
