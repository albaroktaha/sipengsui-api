-- Keep link history as an append-only audit log.
-- It stores stable identifiers instead of cascading foreign keys so deleting a
-- checklist/application or user cannot erase the audit trail.
ALTER TABLE "RekomtekBerkasLinkHistory"
  DROP CONSTRAINT IF EXISTS "RekomtekBerkasLinkHistory_rekomtekBerkasId_fkey";

ALTER TABLE "RekomtekBerkasLinkHistory"
  DROP CONSTRAINT IF EXISTS "RekomtekBerkasLinkHistory_changedById_fkey";

UPDATE "RekomtekBerkasLinkHistory"
SET "changedById" = 'system:unknown'
WHERE "changedById" IS NULL;

ALTER TABLE "RekomtekBerkasLinkHistory"
  ALTER COLUMN "changedById" SET NOT NULL;
