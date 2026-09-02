-- Per-number AI intent rate limit for WhatsApp conversations.

ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "aiRequestCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "aiRequestWindowStartedAt" TIMESTAMP(3);
