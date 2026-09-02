-- Sensitive identity/financial documents must never inherit public Drive access.
UPDATE "RekomtekBerkasTemplate"
SET "allowedSourceTypes" = '["UPLOAD"]'::jsonb,
    "sensitivity" = 'SENSITIVE',
    "accessPolicy" = 'UPLOAD_PRIVATE_ONLY'
WHERE "uraian" ILIKE '%KTP%'
   OR "uraian" ILIKE '%rekening%';

UPDATE "RekomtekBerkas"
SET "allowedSourceTypes" = '["UPLOAD"]'::jsonb,
    "sensitivity" = 'SENSITIVE',
    "accessPolicy" = 'UPLOAD_PRIVATE_ONLY'
WHERE "uraian" ILIKE '%KTP%'
   OR "uraian" ILIKE '%rekening%';
