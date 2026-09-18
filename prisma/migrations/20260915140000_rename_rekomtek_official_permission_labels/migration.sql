-- Rename workflow permission labels without changing internal permission slugs.
UPDATE "Permission"
SET "name" = 'Periksa hasil sebagai Kepala Seksi',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'rekomtek.inspect';

UPDATE "Permission"
SET "name" = 'Setujui hasil sebagai Kepala Bidang',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'rekomtek.approve.final';
