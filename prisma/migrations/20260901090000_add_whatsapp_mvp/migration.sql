-- WhatsApp Bot MVP: provider-independent identity, inbox, outbox,
-- consent, pairing, conversation, and delivery audit.

CREATE TYPE "WhatsAppIdentityStatus" AS ENUM ('ACTIVE', 'UNLINKED', 'BLOCKED');
CREATE TYPE "WhatsAppConsentPurpose" AS ENUM ('REKOMTEK_TRANSACTIONAL', 'SERVICE_CONVERSATION');
CREATE TYPE "WhatsAppConsentSource" AS ENUM ('WEB', 'WHATSAPP', 'ADMIN');
CREATE TYPE "WhatsAppPairingStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED');
CREATE TYPE "WhatsAppConversationState" AS ENUM ('MENU', 'AWAITING_PAIRING', 'AWAITING_TRANSACTIONAL_CONSENT', 'AWAITING_SERVICE_CONSENT');
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'STICKER', 'LOCATION', 'CONTACTS', 'UNKNOWN');
CREATE TYPE "WhatsAppInboundStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "WhatsAppOutboxKind" AS ENUM ('TEMPLATE', 'FREEFORM');
CREATE TYPE "WhatsAppOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'RETRY', 'FAILED', 'DEAD', 'CANCELLED', 'STALE');
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

ALTER TABLE "RekomtekExposeSchedule"
  ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "WhatsAppIdentity" (
  "id" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "providerWaId" TEXT,
  "userId" TEXT,
  "status" "WhatsAppIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
  "verifiedAt" TIMESTAMP(3),
  "linkedAt" TIMESTAMP(3),
  "unlinkedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "pairingAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "pairingAttemptWindowStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppConsent" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "purpose" "WhatsAppConsentPurpose" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "source" "WhatsAppConsentSource" NOT NULL,
  "textVersion" TEXT NOT NULL,
  "optedInAt" TIMESTAMP(3),
  "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppPairingCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "status" "WhatsAppPairingStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastAttemptAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppPairingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppConversation" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "state" "WhatsAppConversationState" NOT NULL DEFAULT 'MENU',
  "stateExpiresAt" TIMESTAMP(3),
  "serviceWindowExpiresAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "identityId" TEXT NOT NULL,
  "phoneNumberId" TEXT,
  "messageType" "WhatsAppMessageType" NOT NULL,
  "textBody" TEXT,
  "payloadDigest" TEXT NOT NULL,
  "providerTimestamp" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "WhatsAppInboundStatus" NOT NULL DEFAULT 'RECEIVED',
  "errorCode" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppOutbox" (
  "id" TEXT NOT NULL,
  "recipientIdentityId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "kind" "WhatsAppOutboxKind" NOT NULL,
  "purpose" "WhatsAppConsentPurpose" NOT NULL,
  "templateKey" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "parameters" JSONB,
  "textBody" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "domainEventId" TEXT,
  "domainEventVersion" INTEGER,
  "workflowEventId" TEXT,
  "rekomtekNotificationId" TEXT,
  "scheduleId" TEXT,
  "scheduleVersion" INTEGER,
  "status" "WhatsAppOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 6,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "lockedBy" TEXT,
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppDeliveryEvent" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "status" "WhatsAppDeliveryStatus" NOT NULL,
  "providerStatus" TEXT,
  "providerTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppIdentity_phoneE164_key" ON "WhatsAppIdentity"("phoneE164");
CREATE UNIQUE INDEX "WhatsAppIdentity_providerWaId_key" ON "WhatsAppIdentity"("providerWaId");
CREATE UNIQUE INDEX "WhatsAppIdentity_userId_key" ON "WhatsAppIdentity"("userId");
CREATE INDEX "WhatsAppIdentity_status_verifiedAt_idx" ON "WhatsAppIdentity"("status", "verifiedAt");
CREATE INDEX "WhatsAppIdentity_userId_status_idx" ON "WhatsAppIdentity"("userId", "status");

CREATE UNIQUE INDEX "WhatsAppConsent_identityId_purpose_key" ON "WhatsAppConsent"("identityId", "purpose");
CREATE INDEX "WhatsAppConsent_identityId_purpose_active_idx" ON "WhatsAppConsent"("identityId", "purpose", "active");

CREATE UNIQUE INDEX "WhatsAppPairingCode_codeHash_key" ON "WhatsAppPairingCode"("codeHash");
CREATE INDEX "WhatsAppPairingCode_userId_status_expiresAt_idx" ON "WhatsAppPairingCode"("userId", "status", "expiresAt");
CREATE INDEX "WhatsAppPairingCode_codeHash_status_expiresAt_idx" ON "WhatsAppPairingCode"("codeHash", "status", "expiresAt");

CREATE UNIQUE INDEX "WhatsAppConversation_identityId_key" ON "WhatsAppConversation"("identityId");
CREATE INDEX "WhatsAppConversation_state_stateExpiresAt_idx" ON "WhatsAppConversation"("state", "stateExpiresAt");
CREATE INDEX "WhatsAppConversation_serviceWindowExpiresAt_idx" ON "WhatsAppConversation"("serviceWindowExpiresAt");

CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerEventId_key" ON "WhatsAppInboundEvent"("providerEventId");
CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerMessageId_key" ON "WhatsAppInboundEvent"("providerMessageId");
CREATE INDEX "WhatsAppInboundEvent_identityId_createdAt_idx" ON "WhatsAppInboundEvent"("identityId", "createdAt");
CREATE INDEX "WhatsAppInboundEvent_status_createdAt_idx" ON "WhatsAppInboundEvent"("status", "createdAt");
CREATE INDEX "WhatsAppInboundEvent_providerMessageId_idx" ON "WhatsAppInboundEvent"("providerMessageId");

CREATE UNIQUE INDEX "WhatsAppOutbox_dedupeKey_key" ON "WhatsAppOutbox"("dedupeKey");
CREATE UNIQUE INDEX "WhatsAppOutbox_providerMessageId_key" ON "WhatsAppOutbox"("providerMessageId");
CREATE INDEX "WhatsAppOutbox_status_nextAttemptAt_idx" ON "WhatsAppOutbox"("status", "nextAttemptAt");
CREATE INDEX "WhatsAppOutbox_recipientIdentityId_status_idx" ON "WhatsAppOutbox"("recipientIdentityId", "status");
CREATE INDEX "WhatsAppOutbox_providerMessageId_idx" ON "WhatsAppOutbox"("providerMessageId");
CREATE INDEX "WhatsAppOutbox_scheduleId_scheduleVersion_idx" ON "WhatsAppOutbox"("scheduleId", "scheduleVersion");
CREATE INDEX "WhatsAppOutbox_workflowEventId_idx" ON "WhatsAppOutbox"("workflowEventId");

CREATE UNIQUE INDEX "WhatsAppDeliveryEvent_providerEventId_key" ON "WhatsAppDeliveryEvent"("providerEventId");
CREATE INDEX "WhatsAppDeliveryEvent_outboxId_createdAt_idx" ON "WhatsAppDeliveryEvent"("outboxId", "createdAt");
CREATE INDEX "WhatsAppDeliveryEvent_providerMessageId_createdAt_idx" ON "WhatsAppDeliveryEvent"("providerMessageId", "createdAt");

ALTER TABLE "WhatsAppIdentity"
  ADD CONSTRAINT "WhatsAppIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConsent"
  ADD CONSTRAINT "WhatsAppConsent_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPairingCode"
  ADD CONSTRAINT "WhatsAppPairingCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation"
  ADD CONSTRAINT "WhatsAppConversation_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundEvent"
  ADD CONSTRAINT "WhatsAppInboundEvent_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_recipientIdentityId_fkey"
  FOREIGN KEY ("recipientIdentityId") REFERENCES "WhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_workflowEventId_fkey"
  FOREIGN KEY ("workflowEventId") REFERENCES "RekomtekWorkflowEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_rekomtekNotificationId_fkey"
  FOREIGN KEY ("rekomtekNotificationId") REFERENCES "RekomtekNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "RekomtekExposeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppDeliveryEvent"
  ADD CONSTRAINT "WhatsAppDeliveryEvent_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "WhatsAppOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
