import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function normalizeWhatsAppPhone(
  value: string,
  defaultCountryCode = '62',
  options: { allowBareInternational?: boolean } = {},
): string {
  const raw = value.trim();
  if (!raw) throw new Error('Nomor WhatsApp wajib diisi');

  const compact = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) {
    throw new Error('Nomor WhatsApp harus berupa nomor telepon yang valid');
  }

  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  } else if (
    !digits.startsWith(defaultCountryCode) &&
    !options.allowBareInternational
  ) {
    throw new Error(
      'Nomor tanpa kode negara tidak didukung; gunakan format +62 atau nomor lokal Indonesia',
    );
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Nomor WhatsApp harus memiliki 8 sampai 15 digit');
  }
  return `+${digits}`;
}

export function normalizeWahaChatId(
  phoneE164: string,
  defaultCountryCode = '62',
): string {
  const normalized = normalizeWhatsAppPhone(phoneE164, defaultCountryCode, {
    allowBareInternational: true,
  });
  return `${normalized.slice(1)}@c.us`;
}

export function phoneFromWahaChatId(
  chatId: string,
  defaultCountryCode = '62',
): string | null {
  const normalized = chatId.trim();
  if (!normalized.endsWith('@c.us')) return null;
  const digits = normalized.slice(0, -5);
  if (!/^\d{8,15}$/.test(digits)) return null;
  try {
    return normalizeWhatsAppPhone(`+${digits}`, defaultCountryCode, {
      allowBareInternational: true,
    });
  } catch {
    return null;
  }
}

export function redactWhatsAppPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return digits.length <= 4 ? '***' : `***${digits.slice(-4)}`;
}

export function normalizePairingCode(value: string): string {
  return value.trim().toUpperCase();
}

export function hashPairingCode(value: string): string {
  return createHash('sha256')
    .update(normalizePairingCode(value), 'utf8')
    .digest('hex');
}

export function secureStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWahaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  algorithmHeader: string | undefined,
  hmacKey: string,
): boolean {
  if (!signatureHeader || !hmacKey || algorithmHeader !== 'sha512')
    return false;
  if (!/^[a-f0-9]{128}$/i.test(signatureHeader)) return false;
  const expected = createHmac('sha512', hmacKey).update(rawBody).digest('hex');
  return secureStringEqual(
    expected.toLowerCase(),
    signatureHeader.toLowerCase(),
  );
}

export function parseWahaTimestamp(value: unknown): Date | null {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  const milliseconds =
    numberValue > 1_000_000_000_000 ? numberValue : numberValue * 1_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseWahaWebhookTimestamp(
  value: string | undefined,
): Date | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWithinClockSkew(
  timestamp: Date,
  now = new Date(),
  maxClockSkewSeconds = 300,
): boolean {
  return (
    Math.abs(now.getTime() - timestamp.getTime()) <= maxClockSkewSeconds * 1_000
  );
}
