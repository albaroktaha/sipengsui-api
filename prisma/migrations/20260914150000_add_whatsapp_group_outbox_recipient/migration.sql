CREATE TYPE "WhatsAppRecipientType" AS ENUM ('DIRECT', 'GROUP');

ALTER TABLE "WhatsAppOutbox"
  ADD COLUMN "recipientChatId" TEXT,
  ADD COLUMN "recipientType" "WhatsAppRecipientType" NOT NULL DEFAULT 'DIRECT';

ALTER TABLE "WhatsAppOutbox"
  ALTER COLUMN "recipientIdentityId" DROP NOT NULL;

ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_recipient_target_check"
  CHECK (
    ("recipientType" = 'DIRECT' AND "recipientIdentityId" IS NOT NULL AND "recipientChatId" IS NULL)
    OR
    ("recipientType" = 'GROUP' AND "recipientIdentityId" IS NULL AND "recipientChatId" IS NOT NULL)
  );

CREATE INDEX "WhatsAppOutbox_recipientChatId_status_idx"
  ON "WhatsAppOutbox"("recipientChatId", "status");
