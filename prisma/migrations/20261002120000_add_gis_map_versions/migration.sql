CREATE TYPE "GisMapVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

ALTER TABLE "GisMap"
  ADD COLUMN "versionCounter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceOrganization" TEXT,
  ADD COLUMN "surveyDate" TIMESTAMP(3),
  ADD COLUMN "accuracyMeters" DECIMAL(12,3),
  ADD COLUMN "sourceCrs" TEXT,
  ADD COLUMN "outputCrs" TEXT NOT NULL DEFAULT 'EPSG:4326',
  ADD COLUMN "license" TEXT,
  ADD COLUMN "coverage" TEXT,
  ADD COLUMN "qualityNotes" TEXT;

CREATE TABLE "GisMapVersion" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "checksum" TEXT,
  "geometry" JSONB NOT NULL,
  "validationReport" JSONB NOT NULL,
  "metadata" JSONB,
  "status" "GisMapVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),

  CONSTRAINT "GisMapVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GisMapVersion_mapId_fkey"
    FOREIGN KEY ("mapId") REFERENCES "GisMap"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GisMapVersion_mapId_version_key" ON "GisMapVersion"("mapId", "version");
CREATE INDEX "GisMapVersion_mapId_status_version_idx" ON "GisMapVersion"("mapId", "status", "version");
CREATE INDEX "GisMapVersion_checksum_idx" ON "GisMapVersion"("checksum");

-- Preserve the currently published snapshot. Legacy geometry cannot be fully
-- validated in SQL, so record that fact rather than inventing a passing report.
-- New uploads always create validated DRAFT versions and must be explicitly published.
INSERT INTO "GisMapVersion" (
  "id", "mapId", "version", "fileUrl", "fileName", "fileSize", "geometry",
  "validationReport", "metadata", "status", "createdAt", "publishedAt"
)
SELECT
  gen_random_uuid()::text,
  map."id",
  1,
  map."fileUrl",
  map."fileName",
  map."fileSize",
  map."geometry",
  jsonb_build_object(
    'valid', NULL,
    'legacy', true,
    'validationStatus', 'UNVERIFIED',
    'message', 'Geometri legacy dipertahankan; unggah ulang diperlukan untuk validasi sebelum publikasi versi baru.'
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'sourceOrganization', map."sourceOrganization",
    'surveyDate', map."surveyDate",
    'accuracyMeters', map."accuracyMeters"::text,
    'sourceCrs', map."sourceCrs",
    'outputCrs', map."outputCrs",
    'license', map."license",
    'coverage', map."coverage",
    'qualityNotes', map."qualityNotes"
  )),
  CASE
    WHEN map."status" = true AND map."publishedAt" IS NOT NULL THEN 'PUBLISHED'::"GisMapVersionStatus"
    ELSE 'DRAFT'::"GisMapVersionStatus"
  END,
  map."createdAt",
  CASE WHEN map."status" = true THEN map."publishedAt" ELSE NULL END
FROM "GisMap" AS map
WHERE map."hasGeometry" = true
  AND map."geometry" IS NOT NULL
  AND map."fileUrl" <> '';

UPDATE "GisMap" AS map
SET "versionCounter" = 1
WHERE EXISTS (
  SELECT 1 FROM "GisMapVersion" AS version
  WHERE version."mapId" = map."id"
);
