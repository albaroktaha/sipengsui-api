-- Persist inbound retry state and per-identity STATUS throttling windows.

ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "statusRequestCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "statusRequestWindowStartedAt" TIMESTAMP(3);

ALTER TABLE "WhatsAppInboundEvent"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "WhatsAppInboundEvent_status_nextAttemptAt_receivedAt_idx"
  ON "WhatsAppInboundEvent" ("status", "nextAttemptAt", "receivedAt");
