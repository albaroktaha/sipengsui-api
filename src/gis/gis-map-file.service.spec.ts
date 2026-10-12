import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { GisMapFileService } from './gis-map-file.service';
import { PrismaService } from '../prisma/prisma.service';

const KML = Buffer.from(
  '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Sungai</name><LineString><coordinates>106,-6,0 107,-5,0</coordinates></LineString></Placemark></Document></kml>',
);

describe('GisMapFileService', () => {
  let originalCwd: string;
  let workspace: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workspace = await mkdtemp(join(tmpdir(), 'sipengsui-gis-'));
    process.chdir(workspace);
    await mkdir(join(workspace, 'uploads', 'gis-maps'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  it('resolves only existing files inside the private GIS map directory', async () => {
    const storedPath = join(workspace, 'uploads', 'gis-maps', 'legacy.kml');
    await writeFile(storedPath, 'private GIS asset');
    const service = new GisMapFileService({} as PrismaService);

    expect(service.resolveStoredFilePath('/uploads/gis-maps/legacy.kml')).toBe(
      storedPath,
    );
    expect(() =>
      service.resolveStoredFilePath('/uploads/gis-maps/%2e%2e/secret.txt'),
    ).toThrow();
    expect(() =>
      service.resolveStoredFilePath('/uploads/other/legacy.kml'),
    ).toThrow();
  });

  it('keeps the existing file when the database rejects a replacement', async () => {
    const legacyPath = join(workspace, 'uploads', 'gis-maps', 'legacy.kml');
    await writeFile(legacyPath, 'published file');
    const databaseError = new Error('database unavailable');
    const tx = {
      gisMap: {
        update: jest.fn().mockRejectedValue(databaseError),
      },
      gisMapVersion: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      gisMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-1',
          category: 'PETA_SUNGAI',
          fileUrl: '/uploads/gis-maps/legacy.kml',
        }),
        update: tx.gisMap.update,
      },
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const service = new GisMapFileService(prisma);
    await expect(
      service.saveForMap('map-1', {
        originalname: 'sungai.kml',
        size: KML.length,
        buffer: KML,
      } as Express.Multer.File),
    ).rejects.toThrow('database unavailable');

    await expect(readFile(legacyPath, 'utf8')).resolves.toBe('published file');
    const storedFiles = await readdir(join(workspace, 'uploads', 'gis-maps'));
    expect(storedFiles).toEqual(['legacy.kml']);
  });

  it('keeps the existing file and skips the database when writing a replacement fails', async () => {
    const legacyPath = join(workspace, 'uploads', 'gis-maps', 'legacy.kml');
    await writeFile(legacyPath, 'published file');
    const transaction = jest.fn();
    const prisma = {
      gisMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-1',
          category: 'PETA_SUNGAI',
          fileUrl: '/uploads/gis-maps/legacy.kml',
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new GisMapFileService(prisma);
    (service as unknown as { uploadDir: string }).uploadDir = join(
      workspace,
      'missing',
      'gis-maps',
    );

    await expect(
      service.saveForMap('map-1', {
        originalname: 'replacement.kml',
        size: KML.length,
        buffer: KML,
      } as Express.Multer.File),
    ).rejects.toThrow('Gagal menyimpan berkas baru');

    await expect(readFile(legacyPath, 'utf8')).resolves.toBe('published file');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects empty or invalid geometry before changing the existing file', async () => {
    const legacyPath = join(workspace, 'uploads', 'gis-maps', 'legacy.kml');
    await writeFile(legacyPath, 'published file');
    const findUnique = jest.fn().mockResolvedValue({
      id: 'map-1',
      category: 'PETA_SUNGAI',
      fileUrl: '/uploads/gis-maps/legacy.kml',
    });
    const prisma = {
      gisMap: {
        findUnique,
      },
    } as unknown as PrismaService;

    const service = new GisMapFileService(prisma);
    await expect(
      service.saveForMap('map-1', {
        originalname: 'empty.kml',
        size: Buffer.byteLength('<kml/>'),
        buffer: Buffer.from('<kml/>'),
      } as Express.Multer.File),
    ).rejects.toThrow();

    await expect(readFile(legacyPath, 'utf8')).resolves.toBe('published file');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('stores a valid replacement as a draft and keeps the published file intact', async () => {
    const legacyPath = join(workspace, 'uploads', 'gis-maps', 'legacy.kml');
    await writeFile(legacyPath, 'published file');
    const mapUpdateArgs: Array<{ data: Record<string, unknown> }> = [];
    const versionCreateArgs: Array<Record<string, unknown>> = [];
    const mapUpdate = jest.fn((args: { data: Record<string, unknown> }) => {
      mapUpdateArgs.push(args);
      return Promise.resolve({ versionCounter: 2 });
    });
    const versionCreate = jest.fn((args: { data: Record<string, unknown> }) => {
      versionCreateArgs.push(args.data);
      return Promise.resolve({});
    });
    const tx = {
      gisMap: { update: mapUpdate },
      gisMapVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: versionCreate,
      },
    };
    const prisma = {
      gisMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-1',
          category: 'PETA_SUNGAI',
          fileUrl: '/uploads/gis-maps/legacy.kml',
          sourceOrganization: 'Dinas',
          surveyDate: null,
          accuracyMeters: null,
          sourceCrs: 'EPSG:4326',
          outputCrs: 'EPSG:4326',
          license: null,
          coverage: null,
          qualityNotes: null,
          versionCounter: 1,
        }),
      },
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const service = new GisMapFileService(prisma);
    await service.saveForMap('map-1', {
      originalname: 'sungai.kml',
      size: KML.length,
      buffer: KML,
    } as Express.Multer.File);

    expect(mapUpdateArgs).toHaveLength(1);
    expect(mapUpdateArgs[0].data).not.toHaveProperty('status');
    expect(mapUpdateArgs[0].data).not.toHaveProperty('publishedAt');
    expect(versionCreateArgs).toHaveLength(1);
    expect(versionCreateArgs[0]).toMatchObject({
      mapId: 'map-1',
      version: 2,
      status: 'DRAFT',
    });
    await expect(readFile(legacyPath, 'utf8')).resolves.toBe('published file');
  });
});
