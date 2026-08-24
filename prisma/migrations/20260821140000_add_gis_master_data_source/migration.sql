-- AlterTable
ALTER TABLE "RiverRegion" ADD COLUMN "sourceGisMapId" TEXT;
ALTER TABLE "Watershed" ADD COLUMN "sourceGisMapId" TEXT;
ALTER TABLE "River" ADD COLUMN "sourceGisMapId" TEXT;

-- CreateIndex
CREATE INDEX "RiverRegion_sourceGisMapId_idx" ON "RiverRegion"("sourceGisMapId");
CREATE INDEX "Watershed_sourceGisMapId_idx" ON "Watershed"("sourceGisMapId");
CREATE INDEX "River_sourceGisMapId_idx" ON "River"("sourceGisMapId");

-- AddForeignKey
ALTER TABLE "RiverRegion" ADD CONSTRAINT "RiverRegion_sourceGisMapId_fkey" FOREIGN KEY ("sourceGisMapId") REFERENCES "GisMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Watershed" ADD CONSTRAINT "Watershed_sourceGisMapId_fkey" FOREIGN KEY ("sourceGisMapId") REFERENCES "GisMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "River" ADD CONSTRAINT "River_sourceGisMapId_fkey" FOREIGN KEY ("sourceGisMapId") REFERENCES "GisMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
