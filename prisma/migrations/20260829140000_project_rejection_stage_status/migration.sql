-- Keep the compatibility status aligned with the workflow decision.
-- PENYUSUNAN_SURAT_PENOLAKAN means the second evaluation already rejected
-- the application; the remaining stage is only the official letter preparation.
UPDATE "Rekomtek"
SET "status" = 'REJECTED'
WHERE "workflowStage" = 'PENYUSUNAN_SURAT_PENOLAKAN'
  AND "status" <> 'REJECTED';
