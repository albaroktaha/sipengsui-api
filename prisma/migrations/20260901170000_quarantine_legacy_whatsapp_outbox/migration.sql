-- Quarantine every non-terminal outbox row created before the WAHA cutover.
-- This includes legacy FREEFORM rows whose old kind column was removed.

UPDATE "WhatsAppOutbox"
SET
  "status" = 'STALE'::"WhatsAppOutboxStatus",
  "leaseUntil" = NULL,
  "lockedBy" = NULL,
  "lastErrorCode" = 'LEGACY_META_OUTBOX'
WHERE "createdAt" < TIMESTAMP '2026-09-01 13:00:00'
  AND "status" IN (
    'PENDING'::"WhatsAppOutboxStatus",
    'PROCESSING'::"WhatsAppOutboxStatus",
    'RETRY'::"WhatsAppOutboxStatus"
  );
