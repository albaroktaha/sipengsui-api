-- Rekomtek workflow state machine and auditable process records.
-- The compatibility status remains on Rekomtek; workflowStage is the source of truth for new records.

CREATE TYPE "RekomtekWorkflowStage" AS ENUM (
  'PEMOHON_DRAFT',
  'MENUNGGU_PENUNJUKAN_POKJA',
  'EVALUASI_DOKUMEN_AWAL',
  'PERBAIKAN_AWAL_PEMOHON',
  'EVALUASI_DOKUMEN_ULANG',
  'PENYUSUNAN_SURAT_PENOLAKAN',
  'DITOLAK',
  'MENUNGGU_JADWAL_EKSPOSE',
  'EKSPOSE_TERJADWAL',
  'MENUNGGU_BA_EKSPOSE',
  'VERIFIKASI_HASIL_EKSPOSE',
  'PERBAIKAN_PASCA_EKSPOSE',
  'VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE',
  'MENUNGGU_SPT_LAPANGAN',
  'KUNJUNGAN_LAPANGAN_DITUGASKAN',
  'MENUNGGU_BA_LAPANGAN',
  'PERSIAPAN_SIDANG_REKOMTEK',
  'MENUNGGU_BA_SIDANG_REKOMTEK',
  'PENYUSUNAN_HASIL_REKOMTEK',
  'PEMERIKSAAN_PEJABAT',
  'MENUNGGU_PERSETUJUAN_ATASAN',
  'DISETUJUI_ATASAN',
  'DOKUMEN_REKOMTEK_TERBIT'
);

CREATE TYPE "RekomtekAssignmentMemberRole" AS ENUM ('KOORDINATOR', 'ANGGOTA');
CREATE TYPE "RekomtekReviewType" AS ENUM ('EVALUASI_AWAL', 'EVALUASI_ULANG', 'PASCA_EKSPOSE', 'VERIFIKASI_PASCA_EKSPOSE');
CREATE TYPE "RekomtekReviewDecision" AS ENUM ('MEMENUHI', 'DIKEMBALIKAN', 'TIDAK_MEMENUHI');
CREATE TYPE "RekomtekFindingStatus" AS ENUM ('TERBUKA', 'TERJAWAB', 'DITUTUP');
CREATE TYPE "RekomtekExposeMethod" AS ENUM ('LURING', 'DARING', 'HIBRID');
CREATE TYPE "RekomtekExposeStatus" AS ENUM ('DRAFT', 'TERJADWAL', 'SELESAI', 'DIBATALKAN');
CREATE TYPE "RekomtekFieldVisitStatus" AS ENUM ('DITUGASKAN', 'SELESAI');
CREATE TYPE "RekomtekArtifactType" AS ENUM (
  'UNDANGAN_EKSPOSE',
  'BERITA_ACARA_EKSPOSE',
  'SURAT_PENOLAKAN',
  'SPT_LAPANGAN',
  'BERITA_ACARA_LAPANGAN',
  'BERITA_ACARA_SIDANG_REKOMTEK',
  'SURAT_PERSETUJUAN',
  'DRAFT_REKOMTEK',
  'DOKUMEN_REKOMTEK'
);
CREATE TYPE "RekomtekArtifactStatus" AS ENUM ('DRAFT', 'FINAL');

ALTER TABLE "Rekomtek"
  ADD COLUMN "workflowStage" "RekomtekWorkflowStage",
  ADD COLUMN "initialCorrectionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workflowMigrationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workflowMigrationNote" TEXT,
  ADD COLUMN "approvedDraftArtifactId" TEXT,
  ADD COLUMN "publishedArtifactId" TEXT;

-- Deterministic mappings for legacy states. APPROVED is intentionally left
-- unresolved because the old workflow did not distinguish official review
-- from superior approval; an admin must resolve those records explicitly.
UPDATE "Rekomtek"
SET "workflowStage" = CASE "status"
  WHEN 'DRAFT' THEN 'PEMOHON_DRAFT'::"RekomtekWorkflowStage"
  WHEN 'REVIEW' THEN 'EVALUASI_DOKUMEN_AWAL'::"RekomtekWorkflowStage"
  WHEN 'REJECTED' THEN 'DITOLAK'::"RekomtekWorkflowStage"
  WHEN 'PUBLISHED' THEN 'DOKUMEN_REKOMTEK_TERBIT'::"RekomtekWorkflowStage"
  ELSE NULL
END,
"workflowMigrationRequired" = CASE WHEN "status" = 'APPROVED' THEN true ELSE false END,
"workflowMigrationNote" = CASE
  WHEN "status" = 'APPROVED' THEN 'Tahap legacy APPROVED ambigu: perlu dipetakan admin ke pemeriksaan pejabat atau persetujuan atasan.'
  ELSE NULL
END;

ALTER TABLE "Rekomtek"
  ADD CONSTRAINT "Rekomtek_initialCorrectionCount_check"
  CHECK ("initialCorrectionCount" >= 0 AND "initialCorrectionCount" <= 1);
CREATE INDEX "Rekomtek_workflowStage_idx" ON "Rekomtek"("workflowStage");
CREATE INDEX "Rekomtek_status_workflowStage_idx" ON "Rekomtek"("status", "workflowStage");

CREATE TABLE "RekomtekTeamAssignment" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "coordinatorId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RekomtekTeamAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekTeamAssignment_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RekomtekTeamAssignment_rekomtekId_isActive_idx" ON "RekomtekTeamAssignment"("rekomtekId", "isActive");
CREATE INDEX "RekomtekTeamAssignment_coordinatorId_isActive_idx" ON "RekomtekTeamAssignment"("coordinatorId", "isActive");

CREATE TABLE "RekomtekTeamMember" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "RekomtekAssignmentMemberRole" NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activeUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RekomtekTeamMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekTeamMember_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "RekomtekTeamAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RekomtekTeamMember_assignmentId_userId_key" ON "RekomtekTeamMember"("assignmentId", "userId");
CREATE INDEX "RekomtekTeamMember_userId_activeUntil_idx" ON "RekomtekTeamMember"("userId", "activeUntil");

CREATE TABLE "RekomtekReviewRound" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "type" "RekomtekReviewType" NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "decision" "RekomtekReviewDecision",
  "summary" TEXT,
  "createdById" TEXT NOT NULL,
  "closedById" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "RekomtekReviewRound_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekReviewRound_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RekomtekReviewRound_rekomtekId_type_roundNumber_key" ON "RekomtekReviewRound"("rekomtekId", "type", "roundNumber");
CREATE INDEX "RekomtekReviewRound_rekomtekId_type_openedAt_idx" ON "RekomtekReviewRound"("rekomtekId", "type", "openedAt");

CREATE TABLE "RekomtekReviewFinding" (
  "id" TEXT NOT NULL,
  "reviewRoundId" TEXT NOT NULL,
  "rekomtekBerkasId" TEXT,
  "note" TEXT NOT NULL,
  "applicantResponse" TEXT,
  "status" "RekomtekFindingStatus" NOT NULL DEFAULT 'TERBUKA',
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "RekomtekReviewFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekReviewFinding_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "RekomtekReviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RekomtekReviewFinding_rekomtekBerkasId_fkey" FOREIGN KEY ("rekomtekBerkasId") REFERENCES "RekomtekBerkas"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "RekomtekReviewFinding_reviewRoundId_status_idx" ON "RekomtekReviewFinding"("reviewRoundId", "status");
CREATE INDEX "RekomtekReviewFinding_rekomtekBerkasId_status_idx" ON "RekomtekReviewFinding"("rekomtekBerkasId", "status");

CREATE TABLE "RekomtekExposeSchedule" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  "method" "RekomtekExposeMethod" NOT NULL,
  "venue" TEXT,
  "meetingUrl" TEXT,
  "agenda" TEXT NOT NULL,
  "participants" JSONB NOT NULL,
  "responsibleUserId" TEXT NOT NULL,
  "invitationNumber" TEXT,
  "invitationArtifactId" TEXT,
  "status" "RekomtekExposeStatus" NOT NULL DEFAULT 'DRAFT',
  "actualStartsAt" TIMESTAMP(3),
  "actualEndsAt" TIMESTAMP(3),
  "notes" TEXT,
  "cancellationReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RekomtekExposeSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekExposeSchedule_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RekomtekExposeSchedule_rekomtekId_status_startsAt_idx" ON "RekomtekExposeSchedule"("rekomtekId", "status", "startsAt");
CREATE INDEX "RekomtekExposeSchedule_responsibleUserId_status_startsAt_idx" ON "RekomtekExposeSchedule"("responsibleUserId", "status", "startsAt");

CREATE TABLE "RekomtekFieldVisit" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "sptNumber" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "petugasId" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "scheduledStartsAt" TIMESTAMP(3) NOT NULL,
  "scheduledEndsAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT NOT NULL,
  "artifactId" TEXT,
  "status" "RekomtekFieldVisitStatus" NOT NULL DEFAULT 'DITUGASKAN',
  "realizedAt" TIMESTAMP(3),
  "realizationNotes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RekomtekFieldVisit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekFieldVisit_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RekomtekFieldVisit_scheduled_order_check" CHECK ("scheduledEndsAt" > "scheduledStartsAt")
);
CREATE UNIQUE INDEX "RekomtekFieldVisit_sptNumber_key" ON "RekomtekFieldVisit"("sptNumber");
CREATE INDEX "RekomtekFieldVisit_rekomtekId_status_idx" ON "RekomtekFieldVisit"("rekomtekId", "status");
CREATE INDEX "RekomtekFieldVisit_petugasId_status_idx" ON "RekomtekFieldVisit"("petugasId", "status");

CREATE TABLE "RekomtekCouncilSession" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "participants" JSONB NOT NULL,
  "decision" TEXT NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RekomtekCouncilSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekCouncilSession_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RekomtekCouncilSession_rekomtekId_completedAt_idx" ON "RekomtekCouncilSession"("rekomtekId", "completedAt");

CREATE TABLE "RekomtekArtifact" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "type" "RekomtekArtifactType" NOT NULL,
  "version" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "technicalStatus" "BerkasTechnicalStatus" NOT NULL DEFAULT 'PENDING_CHECK',
  "stage" "RekomtekWorkflowStage" NOT NULL,
  "status" "RekomtekArtifactStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceArtifactId" TEXT,
  "createdById" TEXT NOT NULL,
  "finalizedById" TEXT,
  "finalizedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RekomtekArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekArtifact_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RekomtekArtifact_rekomtekId_type_version_key" ON "RekomtekArtifact"("rekomtekId", "type", "version");
CREATE INDEX "RekomtekArtifact_rekomtekId_type_status_idx" ON "RekomtekArtifact"("rekomtekId", "type", "status");
CREATE INDEX "RekomtekArtifact_storageKey_idx" ON "RekomtekArtifact"("storageKey");

CREATE TABLE "RekomtekWorkflowEvent" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "fromStage" "RekomtekWorkflowStage",
  "toStage" "RekomtekWorkflowStage" NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "actorPermissions" JSONB,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RekomtekWorkflowEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekWorkflowEvent_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RekomtekWorkflowEvent_rekomtekId_createdAt_idx" ON "RekomtekWorkflowEvent"("rekomtekId", "createdAt");
CREATE INDEX "RekomtekWorkflowEvent_actorId_createdAt_idx" ON "RekomtekWorkflowEvent"("actorId", "createdAt");

CREATE TABLE "RekomtekNotification" (
  "id" TEXT NOT NULL,
  "rekomtekId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "stage" "RekomtekWorkflowStage" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "eventId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RekomtekNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RekomtekNotification_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RekomtekNotification_recipientId_readAt_createdAt_idx" ON "RekomtekNotification"("recipientId", "readAt", "createdAt");
CREATE INDEX "RekomtekNotification_rekomtekId_createdAt_idx" ON "RekomtekNotification"("rekomtekId", "createdAt");
