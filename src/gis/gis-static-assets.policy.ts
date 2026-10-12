const PRIVATE_GIS_UPLOAD_PREFIX = '/uploads/gis-maps';

export function isPrivateGisMapAssetRequest(pathname: string): boolean {
  let candidate = pathname;
  for (let decodePass = 0; decodePass < 3; decodePass += 1) {
    const normalized = candidate.replace(/\\/g, '/').toLowerCase();
    if (
      normalized === PRIVATE_GIS_UPLOAD_PREFIX ||
      normalized.startsWith(`${PRIVATE_GIS_UPLOAD_PREFIX}/`)
    ) {
      return true;
    }

    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return false;
}
