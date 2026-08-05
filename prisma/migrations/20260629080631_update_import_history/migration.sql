-- AlterTable
ALTER TABLE "ImportError" ADD COLUMN     "columnName" TEXT;

-- AlterTable
ALTER TABLE "ImportHistory" ADD COLUMN     "stationId" TEXT;

-- AddForeignKey
ALTER TABLE "ImportHistory" ADD CONSTRAINT "ImportHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;
