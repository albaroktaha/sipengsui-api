-- Repair databases that applied the first provider-marker migration before
-- legacy terminal rows were accounted for.

ALTER TABLE "WhatsAppOutbox"
  DROP CONSTRAINT IF EXISTS "WhatsAppOutbox_legacy_provider_status_check";

UPDATE "WhatsAppOutbox"
SET
  "provider" = 'legacy_historical',
  "status" = CASE
    WHEN "status" IN (
      'PENDING'::"WhatsAppOutboxStatus",
      'PROCESSING'::"WhatsAppOutboxStatus",
      'RETRY'::"WhatsAppOutboxStatus"
    ) THEN 'STALE'::"WhatsAppOutboxStatus"
    ELSE "status"
  END,
  "leaseUntil" = CASE
    WHEN "status" IN (
      'PENDING'::"WhatsAppOutboxStatus",
      'PROCESSING'::"WhatsAppOutboxStatus",
      'RETRY'::"WhatsAppOutboxStatus"
    ) THEN NULL
    ELSE "leaseUntil"
  END,
  "lockedBy" = CASE
    WHEN "status" IN (
      'PENDING'::"WhatsAppOutboxStatus",
      'PROCESSING'::"WhatsAppOutboxStatus",
      'RETRY'::"WhatsAppOutboxStatus"
    ) THEN NULL
    ELSE "lockedBy"
  END,
  "lastErrorCode" = CASE
    WHEN "status" IN (
      'PENDING'::"WhatsAppOutboxStatus",
      'PROCESSING'::"WhatsAppOutboxStatus",
      'RETRY'::"WhatsAppOutboxStatus"
    ) THEN 'LEGACY_PROVIDER_OUTBOX'
    ELSE "lastErrorCode"
  END
WHERE "provider" = 'legacy';

ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_legacy_provider_status_check"
  CHECK (
    "provider" <> 'legacy'
    OR "status" = 'STALE'::"WhatsAppOutboxStatus"
  );
