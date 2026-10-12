CREATE TYPE "RejectionLetterJobStatus" AS ENUM (
  'WAITING_APPROVAL',
  'APPROVED_PREPARING',
  'BLOCKED_TTE',
  'ISSUED',
  'CANCELLED',
  'FAILED'
);
CREATE TYPE "RejectionLetterNumberResetRule" AS ENUM ('TAHUNAN', 'TIDAK_PERNAH');

CREATE TABLE "RejectionLetterSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "institutionName" TEXT,
  "institutionAddress" TEXT,
  "issueCity" TEXT,
  "logoDataUrl" TEXT,
  "verificationDomain" TEXT,
  "outgoingNumberFormat" TEXT,
  "classificationCode" TEXT,
  "agendaSource" TEXT,
  "agendaScope" TEXT,
  "initialLastNumber" INTEGER,
  "numberResetRule" "RejectionLetterNumberResetRule",
  "activeHeadUserId" TEXT,
  "activeHeadName" TEXT,
  "activeHeadPosition" TEXT,
  "activeHeadNip" TEXT,
  "authorityStartsAt" TIMESTAMP(3),
  "authorityEndsAt" TIMESTAMP(3),
  "certificateIdentity" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RejectionLetterSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RejectionLetterSettings_activeHeadUserId_fkey"
    FOREIGN KEY ("activeHeadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "RejectionLetterTemplate" (
  "id" TEXT NOT NULL,
  "rekomtekType" TEXT NOT NULL,
  "jenisPermohonan" "JenisPermohonan" NOT NULL,
  "version" INTEGER NOT NULL,
  "subjectTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "closingTemplate" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RejectionLetterTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RejectionLetterTemplate_rekomtekType_jenisPermohonan_version_key"
  ON "RejectionLetterTemplate"("rekomtekType", "jenisPermohonan", "version");
CREATE INDEX "RejectionLetterTemplate_rekomtekType_jenisPermohonan_isActive_version_idx"
  ON "RejectionLetterTemplate"("rekomtekType", "jenisPermohonan", "isActive", "version");

CREATE TABLE "RejectionLetterNumberSequence" (
  "id" TEXT NOT NULL,
  "agendaScope" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RejectionLetterNumberSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RejectionLetterNumberSequence_agendaScope_periodKey_key"
  ON "RejectionLetterNumberSequence"("agendaScope", "periodKey");

CREATE TABLE "RejectionLetterJob" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "evaluationRoundId" TEXT NOT NULL,
  "status" "RejectionLetterJobStatus" NOT NULL DEFAULT 'WAITING_APPROVAL',
  "applicantSnapshot" JSONB,
  "evaluationSnapshot" JSONB,
  "settingsSnapshot" JSONB,
  "templateSnapshot" JSONB,
  "signerSnapshot" JSONB,
  "outgoingNumber" TEXT,
  "outgoingDate" TIMESTAMP(3),
  "verificationTokenHash" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "preparedPdfStorageKey" TEXT,
  "preparedPdfChecksum" TEXT,
  "finalPdfChecksum" TEXT,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "processingLeaseUntil" TIMESTAMP(3),
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "retryAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RejectionLetterJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RejectionLetterJob_rekomtekId_fkey"
    FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RejectionLetterJob_evaluationRoundId_fkey"
    FOREIGN KEY ("evaluationRoundId") REFERENCES "RekomtekReviewRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RejectionLetterJob_outgoingNumber_key" ON "RejectionLetterJob"("outgoingNumber");
CREATE UNIQUE INDEX "RejectionLetterJob_verificationTokenHash_key" ON "RejectionLetterJob"("verificationTokenHash");
CREATE UNIQUE INDEX "RejectionLetterJob_rekomtekId_evaluationRoundId_key"
  ON "RejectionLetterJob"("rekomtekId", "evaluationRoundId");
CREATE INDEX "RejectionLetterJob_status_retryAt_createdAt_idx"
  ON "RejectionLetterJob"("status", "retryAt", "createdAt");
CREATE INDEX "RejectionLetterJob_rekomtekId_createdAt_idx"
  ON "RejectionLetterJob"("rekomtekId", "createdAt");

CREATE TABLE "RejectionLetterJobEvent" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" "RejectionLetterJobStatus",
  "toStatus" "RejectionLetterJobStatus" NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RejectionLetterJobEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RejectionLetterJobEvent_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "RejectionLetterJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RejectionLetterJobEvent_jobId_createdAt_idx"
  ON "RejectionLetterJobEvent"("jobId", "createdAt");

INSERT INTO "Permission" ("id", "slug", "name", "group", "createdAt", "updatedAt")
VALUES (
  md5('rekomtek.rejection-letter.manage')::uuid,
  'rekomtek.rejection-letter.manage',
  'Kelola Pengaturan Surat Penolakan',
  'rekomtek',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "group" = EXCLUDED."group",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.rejection-letter.manage:' || u."id")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE p."slug" = 'rekomtek.rejection-letter.manage'
  AND (
    u."roleId" IN (
      SELECT r."id" FROM "Role" r WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
    )
    OR EXISTS (
      SELECT 1 FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id" AND r."name" IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
