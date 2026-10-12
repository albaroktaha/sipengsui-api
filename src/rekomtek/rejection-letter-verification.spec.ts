import { verifyRejectionLetterFile } from './rejection-letter-verification';

describe('public rejection-letter verification', () => {
  it('never claims an unsigned internal preview is an issued letter', () => {
    expect(
      verifyRejectionLetterFile(
        {
          status: 'BLOCKED_TTE',
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: null,
          signatureVerified: false,
        },
        'preview-checksum',
      ),
    ).toEqual({ status: 'PREVIEW_ONLY', valid: false });
  });

  it('detects when a QR code has been copied into a different PDF', () => {
    expect(
      verifyRejectionLetterFile(
        {
          status: 'BLOCKED_TTE',
          preparedPdfChecksum: 'original-checksum',
          finalPdfChecksum: null,
          signatureVerified: false,
        },
        'copied-qr-document-checksum',
      ),
    ).toEqual({ status: 'FILE_MISMATCH', valid: false });
  });

  it('requires both the final checksum and verified signature before acceptance', () => {
    expect(
      verifyRejectionLetterFile(
        {
          status: 'ISSUED',
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: 'final-checksum',
          signatureVerified: false,
        },
        'final-checksum',
      ),
    ).toEqual({ status: 'SIGNATURE_UNVERIFIED', valid: false });
    expect(
      verifyRejectionLetterFile(
        {
          status: 'ISSUED',
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: 'final-checksum',
          signatureVerified: true,
        },
        'final-checksum',
      ),
    ).toEqual({ status: 'VALID', valid: true });
  });

  it('accepts a published QR-approval file by checksum without claiming a signature', () => {
    expect(
      verifyRejectionLetterFile(
        {
          status: 'ISSUED',
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: 'final-checksum',
          signatureVerified: false,
          issuanceMethod: 'HEAD_APPROVAL_QR',
          isTestOnly: false,
        },
        'final-checksum',
      ),
    ).toEqual({ status: 'VALID', valid: true });
  });

  it('never treats a local QR test PDF as an official document', () => {
    expect(
      verifyRejectionLetterFile(
        {
          status: 'ISSUED',
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: 'test-final-checksum',
          signatureVerified: false,
          issuanceMethod: 'HEAD_APPROVAL_QR',
          isTestOnly: true,
        },
        'test-final-checksum',
      ),
    ).toEqual({ status: 'TEST_ONLY', valid: false });
  });
});
