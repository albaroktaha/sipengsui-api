-- Checklist Berkas Persyaratan now accepts Google Drive links only.
-- Existing private-upload rows are preserved for audit/data retention but are
-- marked invalid and cannot be used as a new source.

ALTER TABLE "RekomtekBerkasTemplate"
  ALTER COLUMN "allowedSourceTypes" SET DEFAULT '["GOOGLE_DRIVE"]'::jsonb,
  ALTER COLUMN "accessPolicy" SET DEFAULT 'DRIVE_PUBLIC_ONLY';

ALTER TABLE "RekomtekBerkas"
  ALTER COLUMN "allowedSourceTypes" SET DEFAULT '["GOOGLE_DRIVE"]'::jsonb,
  ALTER COLUMN "accessPolicy" SET DEFAULT 'DRIVE_PUBLIC_ONLY';

UPDATE "RekomtekBerkasTemplate"
SET "allowedSourceTypes" = '["GOOGLE_DRIVE"]'::jsonb,
    "accessPolicy" = 'DRIVE_PUBLIC_ONLY';

UPDATE "RekomtekBerkas"
SET "allowedSourceTypes" = '["GOOGLE_DRIVE"]'::jsonb,
    "accessPolicy" = 'DRIVE_PUBLIC_ONLY',
    "isComplete" = false,
    "reviewStatus" = 'PENDING',
    "technicalStatus" = 'INVALID',
    "technicalCode" = 'PRIVATE_UPLOAD_DISABLED',
    "technicalMessage" = 'Upload privat untuk Berkas Persyaratan sudah dinonaktifkan; gunakan link Google Drive.'
WHERE "sourceType" = 'UPLOAD';
