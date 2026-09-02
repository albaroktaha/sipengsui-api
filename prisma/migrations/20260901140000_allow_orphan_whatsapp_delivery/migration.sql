-- Preserve fast WAHA ACKs that arrive before send response persistence.

ALTER TABLE "WhatsAppDeliveryEvent"
  ALTER COLUMN "outboxId" DROP NOT NULL;
