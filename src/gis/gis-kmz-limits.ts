const MAX_KMZ_ENTRIES = 2_000;
const MAX_KMZ_EXPANDED_SIZE = 100 * 1024 * 1024;

type KmzEntryMetadata = {
  header: { size: number };
};

export function validateKmzArchiveLimits(
  entries: readonly KmzEntryMetadata[],
): void {
  if (entries.length > MAX_KMZ_ENTRIES) {
    throw new Error(`Arsip KMZ melebihi batas ${MAX_KMZ_ENTRIES} entry`);
  }

  let expandedSize = 0;
  for (const entry of entries) {
    const size = entry.header.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Ukuran entry KMZ tidak valid');
    }
    expandedSize += size;
    if (expandedSize > MAX_KMZ_EXPANDED_SIZE) {
      throw new Error('Ukuran hasil ekstraksi KMZ melebihi batas 100 MB');
    }
  }
}
