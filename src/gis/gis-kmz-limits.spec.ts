import { validateKmzArchiveLimits } from './gis-kmz-limits';

describe('validateKmzArchiveLimits', () => {
  it('rejects archives with too many entries', () => {
    const entries = Array.from({ length: 2_001 }, () => ({
      header: { size: 0 },
    }));

    expect(() => validateKmzArchiveLimits(entries)).toThrow(
      'Arsip KMZ melebihi batas 2000 entry',
    );
  });

  it('rejects excessive expanded size without extracting archive entries', () => {
    expect(() =>
      validateKmzArchiveLimits([
        { header: { size: 60 * 1024 * 1024 } },
        { header: { size: 41 * 1024 * 1024 } },
      ]),
    ).toThrow('Ukuran hasil ekstraksi KMZ melebihi batas 100 MB');
  });

  it('rejects invalid declared entry sizes', () => {
    expect(() =>
      validateKmzArchiveLimits([{ header: { size: Number.NaN } }]),
    ).toThrow('Ukuran entry KMZ tidak valid');
  });
});
