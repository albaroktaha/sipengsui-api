-- Backfill checklist items for existing applications that have a matching
-- template set but no checklist rows at all. This is intentionally idempotent:
-- records with any existing checklist row are left unchanged.
INSERT INTO "RekomtekBerkas" (
  "id",
  "rekomtekId",
  "templateId",
  "kode",
  "nomorUrut",
  "uraian",
  "isRequired",
  "allowedSourceTypes",
  "sensitivity",
  "accessPolicy",
  "allowedMimeTypes",
  "maxFileSize",
  "allowedExportFormats",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  r."id",
  t."id",
  t."kode",
  t."nomorUrut",
  t."uraian",
  t."isRequired",
  t."allowedSourceTypes",
  t."sensitivity",
  t."accessPolicy",
  t."allowedMimeTypes",
  t."maxFileSize",
  t."allowedExportFormats",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Rekomtek" r
JOIN "RekomtekBerkasTemplate" t
  ON t."jenis" = r."jenis"
 AND t."jenisPermohonan" = r."jenisPermohonan"
WHERE NOT EXISTS (
  SELECT 1
  FROM "RekomtekBerkas" existing
  WHERE existing."rekomtekId" = r."id"
);
