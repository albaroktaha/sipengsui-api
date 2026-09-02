-- Mark the WAHA cutover explicitly. Rows created by legacy writers keep the
-- legacy default and are never claimed by the WAHA dispatcher.

ALTER TABLE "WhatsAppOutbox"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'legacy';

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

CREATE INDEX "WhatsAppOutbox_provider_status_nextAttemptAt_idx"
  ON "WhatsAppOutbox" ("provider", "status", "nextAttemptAt");
