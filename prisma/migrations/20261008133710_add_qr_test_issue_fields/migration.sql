CREATE TYPE "RejectionLetterIssuanceMethod" AS ENUM ('HEAD_APPROVAL_QR');

ALTER TABLE "RejectionLetterJob"
  ADD COLUMN "issuanceMethod" "RejectionLetterIssuanceMethod",
  ADD COLUMN "isTestOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvalSnapshot" JSONB,
  ADD COLUMN "finalPdfStorageKey" TEXT;

CREATE INDEX "RejectionLetterJob_issuanceMethod_status_idx"
  ON "RejectionLetterJob"("issuanceMethod", "status");
