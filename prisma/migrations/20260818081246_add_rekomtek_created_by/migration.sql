-- AlterTable
ALTER TABLE "Rekomtek" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Rekomtek_createdById_idx" ON "Rekomtek"("createdById");

-- AddForeignKey
ALTER TABLE "Rekomtek" ADD CONSTRAINT "Rekomtek_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
