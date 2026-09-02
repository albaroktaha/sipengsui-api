-- Durable audit for notifications skipped because identity or consent is ineligible.

CREATE TABLE "WhatsAppOutboxSkipEvent" (
  "id" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "recipientIdentityId" TEXT,
  "purpose" "WhatsAppConsentPurpose" NOT NULL,
  "messageKey" TEXT NOT NULL,
  "messageVersion" TEXT NOT NULL,
  "domainEventId" TEXT,
  "reason" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppOutboxSkipEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppOutboxSkipEvent_dedupeKey_key"
  ON "WhatsAppOutboxSkipEvent" ("dedupeKey");
CREATE INDEX "WhatsAppOutboxSkipEvent_reason_createdAt_idx"
  ON "WhatsAppOutboxSkipEvent" ("reason", "createdAt");
CREATE INDEX "WhatsAppOutboxSkipEvent_recipientUserId_createdAt_idx"
  ON "WhatsAppOutboxSkipEvent" ("recipientUserId", "createdAt");
CREATE INDEX "WhatsAppOutboxSkipEvent_recipientIdentityId_createdAt_idx"
  ON "WhatsAppOutboxSkipEvent" ("recipientIdentityId", "createdAt");

ALTER TABLE "WhatsAppOutboxSkipEvent"
  ADD CONSTRAINT "WhatsAppOutboxSkipEvent_recipientIdentityId_fkey"
  FOREIGN KEY ("recipientIdentityId") REFERENCES "WhatsAppIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
