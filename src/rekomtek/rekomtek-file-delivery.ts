export function rekomtekFileContentDisposition(
  fileName: string,
  downloadMode?: string,
): string {
  const disposition =
    downloadMode?.trim().toLowerCase() === 'fetch' ? 'inline' : 'attachment';
  const safeFileName = fileName.replace(/["\r\n]/g, '');
  return `${disposition}; filename="${safeFileName}"`;
}
