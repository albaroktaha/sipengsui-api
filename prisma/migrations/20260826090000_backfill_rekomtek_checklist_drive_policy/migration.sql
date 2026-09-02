-- Backfill every existing applicant checklist snapshot, including rows
-- created from the previous sensitive upload-only template policy.
UPDATE "RekomtekBerkas"
SET "allowedSourceTypes" = '["GOOGLE_DRIVE"]'::jsonb,
    "accessPolicy" = 'DRIVE_PUBLIC_ONLY';

-- Preserve historical private-upload values for audit, but make them
-- explicitly invalid until the applicant supplies a Google Drive link.
UPDATE "RekomtekBerkas"
SET "isComplete" = false,
    "reviewStatus" = 'PENDING',
    "technicalStatus" = 'INVALID',
    "technicalCode" = 'PRIVATE_UPLOAD_DISABLED',
    "technicalMessage" = 'Upload privat untuk Berkas Persyaratan sudah dinonaktifkan; gunakan link Google Drive.'
WHERE "sourceType" = 'UPLOAD';
