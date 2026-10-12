const MAX_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function decodeRejectionLetterLogo(
  dataUrl: string | null | undefined,
): Buffer | null {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    dataUrl,
  );
  if (!match) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) return null;
  if (match[1] === 'png') {
    return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      ? buffer
      : null;
  }
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ? buffer
    : null;
}
