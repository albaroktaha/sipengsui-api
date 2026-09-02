-- Persist the dispatch consent gate and the point at which an outbound send starts.

ALTER TABLE "WhatsAppOutbox"
  ADD COLUMN "consentRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sendStartedAt" TIMESTAMP(3);
