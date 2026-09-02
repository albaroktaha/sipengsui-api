-- Append-only audit for WhatsApp identity and consent lifecycle changes.

CREATE TABLE "WhatsAppConsentAuditEvent" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "purpose" "WhatsAppConsentPurpose" NOT NULL,
  "active" BOOLEAN NOT NULL,
  "source" "WhatsAppConsentSource" NOT NULL,
  "textVersion" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConsentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppIdentityAuditEvent" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppIdentityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppConsentAuditEvent_identityId_purpose_createdAt_idx"
  ON "WhatsAppConsentAuditEvent" ("identityId", "purpose", "createdAt");
CREATE INDEX "WhatsAppConsentAuditEvent_actorUserId_createdAt_idx"
  ON "WhatsAppConsentAuditEvent" ("actorUserId", "createdAt");
CREATE INDEX "WhatsAppIdentityAuditEvent_identityId_createdAt_idx"
  ON "WhatsAppIdentityAuditEvent" ("identityId", "createdAt");
CREATE INDEX "WhatsAppIdentityAuditEvent_actorUserId_createdAt_idx"
  ON "WhatsAppIdentityAuditEvent" ("actorUserId", "createdAt");

ALTER TABLE "WhatsAppConsentAuditEvent"
  ADD CONSTRAINT "WhatsAppConsentAuditEvent_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WhatsAppIdentity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppIdentityAuditEvent"
  ADD CONSTRAINT "WhatsAppIdentityAuditEvent_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WhatsAppIdentity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
