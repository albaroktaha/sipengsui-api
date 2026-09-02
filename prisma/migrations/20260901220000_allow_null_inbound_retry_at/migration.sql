-- Processed or exhausted inbound events no longer need a retry timestamp.

ALTER TABLE "WhatsAppInboundEvent"
  ALTER COLUMN "nextAttemptAt" DROP NOT NULL;
