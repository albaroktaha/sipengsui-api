-- CreateEnum
CREATE TYPE "BerkasSourceType" AS ENUM ('UPLOAD', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "BerkasTechnicalStatus" AS ENUM ('VALID', 'INVALID', 'PENDING_CHECK');

-- CreateEnum
CREATE TYPE "BerkasReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'NEEDS_CORRECTION');

-- AlterTable
ALTER TABLE "RekomtekBerkas" ADD COLUMN     "accessPolicy" TEXT NOT NULL DEFAULT 'PUBLIC_DRIVE_OR_UPLOAD',
ADD COLUMN     "allowedExportFormats" JSONB,
ADD COLUMN     "allowedMimeTypes" JSONB,
ADD COLUMN     "allowedSourceTypes" JSONB NOT NULL DEFAULT '["UPLOAD", "GOOGLE_DRIVE"]',
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "maxFileSize" INTEGER,
ADD COLUMN     "reviewStatus" "BerkasReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "sensitivity" TEXT NOT NULL DEFAULT 'ORDINARY',
ADD COLUMN     "sourceType" "BerkasSourceType",
ADD COLUMN     "sourceVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "technicalCode" TEXT,
ADD COLUMN     "technicalMessage" TEXT,
ADD COLUMN     "technicalStatus" "BerkasTechnicalStatus" NOT NULL DEFAULT 'PENDING_CHECK';

-- AlterTable
ALTER TABLE "RekomtekBerkasLinkHistory" ADD COLUMN     "changeReason" TEXT,
ADD COLUMN     "newSourceType" "BerkasSourceType",
ADD COLUMN     "newStorageKey" TEXT,
ADD COLUMN     "oldSourceType" "BerkasSourceType",
ADD COLUMN     "oldStorageKey" TEXT,
ADD COLUMN     "technicalCode" TEXT,
ADD COLUMN     "technicalStatus" "BerkasTechnicalStatus";

-- AlterTable
ALTER TABLE "RekomtekBerkasTemplate" ADD COLUMN     "accessPolicy" TEXT NOT NULL DEFAULT 'PUBLIC_DRIVE_OR_UPLOAD',
ADD COLUMN     "allowedExportFormats" JSONB,
ADD COLUMN     "allowedMimeTypes" JSONB,
ADD COLUMN     "allowedSourceTypes" JSONB NOT NULL DEFAULT '["UPLOAD", "GOOGLE_DRIVE"]',
ADD COLUMN     "maxFileSize" INTEGER,
ADD COLUMN     "sensitivity" TEXT NOT NULL DEFAULT 'ORDINARY';

-- Existing records previously stored only a Drive URL. Keep them visible but require a fresh access check.
UPDATE "RekomtekBerkas"
SET "sourceType" = 'GOOGLE_DRIVE',
    "technicalStatus" = 'PENDING_CHECK',
    "technicalCode" = 'LEGACY_LINK_RECHECK',
    "technicalMessage" = 'Link lama harus diperiksa ulang sebelum Submit atau review.'
WHERE "driveUrl" IS NOT NULL;

UPDATE "RekomtekBerkas"
SET "reviewStatus" = 'VERIFIED'
WHERE "isComplete" = true;

ALTER TABLE "RekomtekBerkas"
  ADD CONSTRAINT "RekomtekBerkas_source_consistency_check"
  CHECK (
    ("sourceType" IS NULL AND "driveUrl" IS NULL AND "storageKey" IS NULL)
    OR ("sourceType" = 'GOOGLE_DRIVE' AND "driveUrl" IS NOT NULL AND "storageKey" IS NULL)
    OR ("sourceType" = 'UPLOAD' AND "driveUrl" IS NULL AND "storageKey" IS NOT NULL)
  );

CREATE INDEX "RekomtekBerkas_rekomtekId_technicalStatus_idx"
  ON "RekomtekBerkas"("rekomtekId", "technicalStatus");
