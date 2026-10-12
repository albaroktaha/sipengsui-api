export type RejectionLetterFileVerificationStatus =
  | 'VALID'
  | 'TEST_ONLY'
  | 'PREVIEW_ONLY'
  | 'FILE_MISMATCH'
  | 'NOT_ISSUED'
  | 'SIGNATURE_UNVERIFIED';

export interface RejectionLetterVerificationRecord {
  status: string;
  preparedPdfChecksum: string | null;
  finalPdfChecksum: string | null;
  signatureVerified: boolean;
  issuanceMethod?: string | null;
  isTestOnly?: boolean;
}

export interface RejectionLetterFileVerificationResult {
  status: RejectionLetterFileVerificationStatus;
  valid: boolean;
}

export function verifyRejectionLetterFile(
  record: RejectionLetterVerificationRecord,
  uploadedPdfChecksum: string,
): RejectionLetterFileVerificationResult {
  if (!uploadedPdfChecksum) return { status: 'FILE_MISMATCH', valid: false };

  if (record.status === 'ISSUED') {
    if (
      !record.finalPdfChecksum ||
      record.finalPdfChecksum !== uploadedPdfChecksum
    ) {
      return { status: 'FILE_MISMATCH', valid: false };
    }
    if (record.isTestOnly) {
      return { status: 'TEST_ONLY', valid: false };
    }
    if (record.issuanceMethod === 'HEAD_APPROVAL_QR') {
      return { status: 'VALID', valid: true };
    }
    if (!record.signatureVerified) {
      return { status: 'SIGNATURE_UNVERIFIED', valid: false };
    }
    return { status: 'VALID', valid: true };
  }

  if (
    record.preparedPdfChecksum &&
    record.preparedPdfChecksum === uploadedPdfChecksum
  ) {
    return { status: 'PREVIEW_ONLY', valid: false };
  }
  if (record.preparedPdfChecksum) {
    return { status: 'FILE_MISMATCH', valid: false };
  }
  return { status: 'NOT_ISSUED', valid: false };
}
