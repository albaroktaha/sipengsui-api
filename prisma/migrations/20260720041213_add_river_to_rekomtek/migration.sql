-- AlterTable
ALTER TABLE "Rekomtek" ADD COLUMN     "riverId" TEXT;

-- CreateIndex
CREATE INDEX "Rekomtek_riverId_idx" ON "Rekomtek"("riverId");

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_riverId_fkey" FOREIGN KEY ("riverId") REFERENCES "River"("id") ON DELETE SET NULL ON UPDATE CASCADE;
