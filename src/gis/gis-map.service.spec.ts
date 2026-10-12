import { GisMapService } from './gis-map.service';
import { GisMapFileService } from './gis-map-file.service';
import { PrismaService } from '../prisma/prisma.service';

const publishedGeometry = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [106, -6] },
      properties: { release: 'published' },
    },
  ],
};
const draftGeometry = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [107, -5] },
      properties: { release: 'draft' },
    },
  ],
};

describe('GisMapService public versions', () => {
  it('returns a protected download route and resolves originals from stored file metadata', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'map-1',
      fileUrl: '/uploads/gis-maps/source.kml',
      fileName: 'source.kml',
    });
    const resolveStoredFilePath = jest
      .fn()
      .mockReturnValue('C:/private/uploads/gis-maps/source.kml');
    const fileService = {
      resolveStoredFilePath,
    } as unknown as GisMapFileService;
    const prisma = { gisMap: { findUnique } } as unknown as PrismaService;
    const service = new GisMapService(prisma, fileService);

    const map = await service.findOne('map-1');
    const original = await service.getOriginalFile('map-1');

    expect(map.fileUrl).toBe('/gis/maps/map-1/file');
    expect(original).toEqual({
      filePath: 'C:/private/uploads/gis-maps/source.kml',
      fileName: 'source.kml',
    });
    expect(resolveStoredFilePath).toHaveBeenCalledWith(
      '/uploads/gis-maps/source.kml',
    );
  });

  it('serves the last published geometry while a newer replacement is draft', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      geometry: draftGeometry,
      versions: [{ geometry: publishedGeometry }],
    });
    const prisma = {
      gisMap: {
        findFirst,
      },
    } as unknown as PrismaService;
    const service = new GisMapService(prisma, {} as GisMapFileService);

    const result = await service.findPublishedGeometry('map-1');

    expect(result.geometry).toEqual(publishedGeometry);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('never falls back to the current draft geometry when version history exists', async () => {
    const draftGeometry = {
      type: 'FeatureCollection',
      features: [{ id: 'draft' }],
    };
    const prisma = {
      gisMap: {
        findFirst: jest.fn().mockResolvedValue({
          geometry: draftGeometry,
          versionCounter: 2,
          versions: [],
        }),
      },
    } as unknown as PrismaService;
    const service = new GisMapService(prisma, {} as GisMapFileService);

    const result = await service.findPublishedGeometry('map-1');

    expect(result.geometry).toBeNull();
  });

  it('refuses to publish an invalid draft version', async () => {
    const mapUpdate = jest.fn();
    const prisma = {
      gisMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-1',
          fileUrl: '/uploads/gis-maps/draft.kml',
          hasGeometry: true,
          versions: [
            {
              status: 'DRAFT',
              validationReport: {
                valid: false,
                errors: [{ code: 'empty_feature_collection' }],
              },
            },
          ],
        }),
        update: mapUpdate,
      },
    } as unknown as PrismaService;
    const service = new GisMapService(prisma, {} as GisMapFileService);

    await expect(service.publish('map-1')).rejects.toThrow();
    expect(mapUpdate).not.toHaveBeenCalled();
  });
});
