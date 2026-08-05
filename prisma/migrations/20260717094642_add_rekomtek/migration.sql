-- CreateEnum
CREATE TYPE "RekomtekStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Rekomtek" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "deskripsi" TEXT,
    "status" "RekomtekStatus" NOT NULL DEFAULT 'DRAFT',
    "stationId" TEXT,
    "watershedId" TEXT,
    "riverRegionId" TEXT,
    "analysisData" JSONB,
    "parameters" JSONB,
    "fileUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rekomtek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rekomtek_nomor_key" ON "Rekomtek"("nomor");

-- CreateIndex
CREATE INDEX "Rekomtek_status_idx" ON "Rekomtek"("status");

-- CreateIndex
CREATE INDEX "Rekomtek_stationId_idx" ON "Rekomtek"("stationId");

-- CreateIndex
CREATE INDEX "Rekomtek_watershedId_idx" ON "Rekomtek"("watershedId");

-- CreateIndex
CREATE INDEX "Rekomtek_riverRegionId_idx" ON "Rekomtek"("riverRegionId");

-- CreateIndex
CREATE INDEX "Rekomtek_createdAt_idx" ON "Rekomtek"("createdAt");

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_watershedId_fkey" FOREIGN KEY ("watershedId") REFERENCES "Watershed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_riverRegionId_fkey" FOREIGN KEY ("riverRegionId") REFERENCES "RiverRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
