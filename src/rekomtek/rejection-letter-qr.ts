import QRCode from 'qrcode';

export interface RejectionLetterQrOptions {
  allowInsecureLoopbackForTest?: boolean;
}

function isLoopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname.toLowerCase());
}

function isAllowedProtocol(
  url: URL,
  options: RejectionLetterQrOptions,
): boolean {
  return (
    url.protocol === 'https:' ||
    (options.allowInsecureLoopbackForTest === true &&
      url.protocol === 'http:' &&
      isLoopbackHost(url.hostname))
  );
}

export function buildRejectionLetterVerificationUrl(
  configuredDomain: string,
  token: string,
  options: RejectionLetterQrOptions = {},
): string {
  let domain: URL;
  try {
    domain = new URL(configuredDomain.trim());
  } catch {
    throw new Error('Domain verifikasi harus HTTPS resmi tanpa kredensial');
  }
  if (
    !isAllowedProtocol(domain, options) ||
    domain.username ||
    domain.password ||
    domain.search ||
    domain.hash ||
    domain.pathname !== '/'
  ) {
    throw new Error('Domain verifikasi harus HTTPS resmi tanpa kredensial');
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    throw new Error(
      'Token verifikasi harus berupa token acak tanpa data pribadi',
    );
  }
  return new URL(
    `/verifikasi-surat-penolakan/${token}`,
    domain.origin,
  ).toString();
}

export async function createRejectionLetterQrPng(
  verificationUrl: string,
  options: RejectionLetterQrOptions = {},
): Promise<Buffer> {
  const url = new URL(verificationUrl);
  if (!isAllowedProtocol(url, options)) {
    throw new Error('QR verifikasi harus menggunakan HTTPS');
  }
  return QRCode.toBuffer(url.toString(), {
    type: 'png',
    errorCorrectionLevel: 'Q',
    margin: 4,
    width: 440,
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}
