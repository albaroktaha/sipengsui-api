import { GisMasterDataImportService } from './gis-master-data-import.service';
import { PrismaService } from '../prisma/prisma.service';

const mapGeometry = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [106, -6],
            [107, -6],
            [107, -5],
            [106, -5],
            [106, -6],
          ],
        ],
      },
      properties: { name: 'WS Citarum', code: 'WS-1', slug: 'ws-citarum' },
    },
  ],
};

describe('GisMasterDataImportService', () => {
  it('does not overwrite a published master feature during GIS import', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'region-1',
      name: 'WS Citarum',
    });
    const create = jest.fn();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'region-1',
        name: 'WS Citarum Lama',
        code: 'WS-1',
        slug: 'ws-citarum-lama',
        sourceGisMapId: null,
        status: true,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const transaction = {
      riverRegion: { findMany, update, create },
    };
    const prisma = {
      gisMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-1',
          name: 'Sumber WS',
          category: 'PETA_WILAYAH_SUNGAI',
          geometry: mapGeometry,
          hasGeometry: true,
        }),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new GisMasterDataImportService(prisma);

    const result = await service.import('map-1', { updateExisting: true });

    expect(result.skipped).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'region-1',
      action: 'skipped',
      reason: 'published_requires_unpublish',
    });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
