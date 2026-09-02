-- AlterTable
ALTER TABLE "Rekomtek" ADD COLUMN     "parentRekomtekId" TEXT,
ADD COLUMN     "revisionNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Rekomtek_parentRekomtekId_idx" ON "Rekomtek"("parentRekomtekId");

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_parentRekomtekId_fkey" FOREIGN KEY ("parentRekomtekId") REFERENCES "Rekomtek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
