-- Replace Rekomtek checklist uploads with Google Drive links.
ALTER TABLE "RekomtekBerkas" ADD COLUMN "driveUrl" TEXT;
ALTER TABLE "RekomtekBerkas" DROP COLUMN "fileUrl";
ALTER TABLE "RekomtekBerkas" DROP COLUMN "fileName";
ALTER TABLE "RekomtekBerkas" DROP COLUMN "fileSize";

-- Append-only audit trail for checklist link changes.
CREATE TABLE "RekomtekBerkasLinkHistory" (
    "id" TEXT NOT NULL,
    "rekomtekBerkasId" TEXT NOT NULL,
    "oldDriveUrl" TEXT,
    "newDriveUrl" TEXT,
    "changedById" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RekomtekBerkasLinkHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RekomtekBerkasLinkHistory_rekomtekBerkasId_createdAt_idx"
  ON "RekomtekBerkasLinkHistory"("rekomtekBerkasId", "createdAt");
CREATE INDEX "RekomtekBerkasLinkHistory_createdAt_idx"
  ON "RekomtekBerkasLinkHistory"("createdAt");

ALTER TABLE "RekomtekBerkasLinkHistory"
  ADD CONSTRAINT "RekomtekBerkasLinkHistory_rekomtekBerkasId_fkey"
  FOREIGN KEY ("rekomtekBerkasId") REFERENCES "RekomtekBerkas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RekomtekBerkasLinkHistory"
  ADD CONSTRAINT "RekomtekBerkasLinkHistory_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep checklist queries ordered and index-covered by application and item order.
DROP INDEX "RekomtekBerkas_rekomtekId_idx";
CREATE INDEX "RekomtekBerkas_rekomtekId_nomorUrut_kode_idx"
  ON "RekomtekBerkas"("rekomtekId", "nomorUrut", "kode");
