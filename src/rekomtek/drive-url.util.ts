const ALLOWED_GOOGLE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
]);

export function isAllowedGoogleDriveUrl(
  value: string | null | undefined,
): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ALLOWED_GOOGLE_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
