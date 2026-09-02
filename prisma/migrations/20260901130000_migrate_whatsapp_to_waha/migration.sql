-- Migrate the WhatsApp channel contract from Meta Cloud API to WAHA.
-- Legacy Meta outbox rows are preserved as audit records but never sent again.

ALTER TYPE "WhatsAppDeliveryStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TABLE "WhatsAppInboundEvent"
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "eventName" TEXT,
  ADD COLUMN "sessionName" TEXT,
  ADD COLUMN "providerEngine" TEXT;

UPDATE "WhatsAppInboundEvent"
SET
  "providerRequestId" = 'legacy:' || "id",
  "eventName" = 'legacy',
  "sessionName" = 'legacy'
WHERE "providerRequestId" IS NULL
   OR "eventName" IS NULL
   OR "sessionName" IS NULL;

ALTER TABLE "WhatsAppInboundEvent"
  ALTER COLUMN "providerRequestId" SET NOT NULL,
  ALTER COLUMN "eventName" SET NOT NULL,
  ALTER COLUMN "sessionName" SET NOT NULL;

CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerRequestId_key"
  ON "WhatsAppInboundEvent" ("providerRequestId");
CREATE INDEX "WhatsAppInboundEvent_eventName_createdAt_idx"
  ON "WhatsAppInboundEvent" ("eventName", "createdAt");

ALTER TABLE "WhatsAppInboundEvent"
  DROP COLUMN "phoneNumberId";

ALTER TABLE "WhatsAppOutbox"
  ADD COLUMN "messageKey" TEXT,
  ADD COLUMN "messageVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "textSnapshotHash" TEXT;

UPDATE "WhatsAppOutbox"
SET
  "messageKey" = CASE
    WHEN "kind"::text = 'TEMPLATE' THEN COALESCE(NULLIF("templateKey", ''), 'LEGACY_TEMPLATE')
    ELSE 'CONVERSATION_REPLY'
  END,
  "status" = CASE
    WHEN "kind"::text = 'TEMPLATE' OR "textBody" IS NULL THEN 'STALE'::"WhatsAppOutboxStatus"
    ELSE "status"
  END,
  "lastErrorCode" = CASE
    WHEN "kind"::text = 'TEMPLATE' OR "textBody" IS NULL THEN 'LEGACY_META_OUTBOX'
    ELSE "lastErrorCode"
  END
WHERE "messageKey" IS NULL;

ALTER TABLE "WhatsAppOutbox"
  ALTER COLUMN "messageKey" SET NOT NULL;

ALTER TABLE "WhatsAppOutbox"
  DROP COLUMN "kind",
  DROP COLUMN "templateKey",
  DROP COLUMN "parameters";

DROP TYPE "WhatsAppOutboxKind";

ALTER TABLE "WhatsAppDeliveryEvent"
  ADD COLUMN "providerAck" INTEGER;
