-- Make the checklist policy snapshot explicit for existing rows.
-- Sensitive items remain upload-only; ordinary items receive the bounded phase-1 policy.
UPDATE "RekomtekBerkasTemplate"
SET "allowedMimeTypes" = CASE
      WHEN "sensitivity" = 'SENSITIVE'
        THEN '["application/pdf","image/jpeg","image/png"]'::jsonb
      ELSE '["application/pdf","image/jpeg","image/png","image/webp","text/csv","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"]'::jsonb
    END,
    "maxFileSize" = COALESCE("maxFileSize", 10485760),
    "allowedExportFormats" = CASE
      WHEN "uraian" ILIKE '%excel%'
        OR "uraian" ILIKE '%spreadsheet%'
        OR "uraian" ILIKE '%calculation sheet%'
        THEN '["xlsx","pdf"]'::jsonb
      WHEN "uraian" ILIKE '%powerpoint%'
        OR "uraian" ILIKE '%presentasi%'
        OR "uraian" ILIKE '%slide%'
        THEN '["pptx","pdf"]'::jsonb
      ELSE '["pdf"]'::jsonb
    END
WHERE "allowedMimeTypes" IS NULL
   OR "maxFileSize" IS NULL
   OR "allowedExportFormats" IS NULL;

UPDATE "RekomtekBerkas"
SET "allowedMimeTypes" = CASE
      WHEN "sensitivity" = 'SENSITIVE'
        THEN '["application/pdf","image/jpeg","image/png"]'::jsonb
      ELSE '["application/pdf","image/jpeg","image/png","image/webp","text/csv","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"]'::jsonb
    END,
    "maxFileSize" = COALESCE("maxFileSize", 10485760),
    "allowedExportFormats" = CASE
      WHEN "uraian" ILIKE '%excel%'
        OR "uraian" ILIKE '%spreadsheet%'
        OR "uraian" ILIKE '%calculation sheet%'
        THEN '["xlsx","pdf"]'::jsonb
      WHEN "uraian" ILIKE '%powerpoint%'
        OR "uraian" ILIKE '%presentasi%'
        OR "uraian" ILIKE '%slide%'
        THEN '["pptx","pdf"]'::jsonb
      ELSE '["pdf"]'::jsonb
    END
WHERE "allowedMimeTypes" IS NULL
   OR "maxFileSize" IS NULL
   OR "allowedExportFormats" IS NULL;
