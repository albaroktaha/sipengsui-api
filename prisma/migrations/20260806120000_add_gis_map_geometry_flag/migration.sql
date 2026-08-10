-- AlterTable
ALTER TABLE "GisMap" ADD COLUMN "hasGeometry" BOOLEAN NOT NULL DEFAULT false;

UPDATE "GisMap"
SET "hasGeometry" = true
WHERE "geometry" IS NOT NULL;
