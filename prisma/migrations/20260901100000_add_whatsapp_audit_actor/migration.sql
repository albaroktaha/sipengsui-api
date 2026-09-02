-- Preserve consent actor identity and audit protected outbox requeue actions.

ALTER TABLE "WhatsAppConsent"
  ADD COLUMN "actorUserId" TEXT;

CREATE TABLE "WhatsAppAdminAuditEvent" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "outboxId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppAdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppAdminAuditEvent_actorUserId_createdAt_idx"
  ON "WhatsAppAdminAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "WhatsAppAdminAuditEvent_outboxId_createdAt_idx"
  ON "WhatsAppAdminAuditEvent"("outboxId", "createdAt");
