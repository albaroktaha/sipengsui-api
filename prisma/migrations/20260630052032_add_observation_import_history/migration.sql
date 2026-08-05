/*
  Warnings:

  - A unique constraint covering the columns `[stationId,observationDate]` on the table `Observation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Observation" DROP CONSTRAINT "Observation_stationId_fkey";

-- AlterTable
ALTER TABLE "Observation" ADD COLUMN     "importHistoryId" TEXT,
ADD COLUMN     "isValid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Observation_stationId_idx" ON "Observation"("stationId");

-- CreateIndex
CREATE INDEX "Observation_observationDate_idx" ON "Observation"("observationDate");

-- CreateIndex
CREATE INDEX "Observation_stationId_observationDate_idx" ON "Observation"("stationId", "observationDate");

-- CreateIndex
CREATE INDEX "Observation_source_idx" ON "Observation"("source");

-- CreateIndex
CREATE INDEX "Observation_importHistoryId_idx" ON "Observation"("importHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Observation_stationId_observationDate_key" ON "Observation"("stationId", "observationDate");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_importHistoryId_fkey" FOREIGN KEY ("importHistoryId") REFERENCES "ImportHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
