const ALLOWED_GOOGLE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{3,}$/;

type GoogleDriveResourceKind = 'BLOB' | 'DOCUMENT' | 'SHEET' | 'SLIDES';

export interface GoogleDriveResource {
  kind: GoogleDriveResourceKind;
  fileId: string;
  resourceKey?: string;
}

function isAllowedHost(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    ALLOWED_GOOGLE_HOSTS.has(url.hostname.toLowerCase())
  );
}

function withResourceKey(
  url: URL,
  resource: Omit<GoogleDriveResource, 'resourceKey'>,
): GoogleDriveResource {
  const resourceKey = url.searchParams.get('resourcekey') ?? undefined;
  return resourceKey ? { ...resource, resourceKey } : resource;
}

function parseFileId(value: string | null | undefined): string | null {
  return value && FILE_ID_PATTERN.test(value) ? value : null;
}

/**
 * Parses only canonical, single-file Google Drive/Workspace URLs.
 * Folder, shortcut, shortener, and generic UI URLs without a file id are rejected.
 */
export function parseGoogleDriveResource(
  value: string | null | undefined,
): GoogleDriveResource | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!isAllowedHost(url)) return null;

  const rawPath = url.pathname;
  if (rawPath.includes('/d//') || rawPath.includes('/folders/')) return null;
  const path = rawPath.replace(/\/+/g, '/');
  if (path.includes('/folders/') || path === '/drive/folders') return null;
  if (path === '/uc' || path === '/open') return null;

  const patterns: Array<[RegExp, GoogleDriveResourceKind]> = [
    [/^\/file\/d\/([^/]+)(?:\/|$)/, 'BLOB'],
    [/^\/document\/d\/([^/]+)(?:\/|$)/, 'DOCUMENT'],
    [/^\/spreadsheets\/d\/([^/]+)(?:\/|$)/, 'SHEET'],
    [/^\/presentation\/d\/([^/]+)(?:\/|$)/, 'SLIDES'],
  ];

  for (const [pattern, kind] of patterns) {
    const match = path.match(pattern);
    const fileId = parseFileId(match?.[1]);
    if (fileId) return withResourceKey(url, { kind, fileId });
  }

  return null;
}

export function isAllowedGoogleDriveUrl(
  value: string | null | undefined,
): boolean {
  return parseGoogleDriveResource(value) !== null;
}

export function buildResourceKeyHeader(
  resource: GoogleDriveResource,
): string | undefined {
  return resource.resourceKey
    ? `${resource.fileId}/${resource.resourceKey}`
    : undefined;
}
