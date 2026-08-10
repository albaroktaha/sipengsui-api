import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaKnowledgeService } from '../knowledge/prisma-knowledge.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaKnowledgeService', () => {
  let service: PrismaKnowledgeService;
  let prisma: {
    flowchart: { findMany: jest.Mock };
    riverRegion: { findMany: jest.Mock; count: jest.Mock };
    watershed: { findMany: jest.Mock; count: jest.Mock };
    river: { findMany: jest.Mock; count: jest.Mock };
    station: { findMany: jest.Mock; count: jest.Mock };
    rekomtekBerkasTemplate: { findMany: jest.Mock };
    rekomtek: { findMany: jest.Mock };
    gisMap: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      flowchart: { findMany: jest.fn() },
      riverRegion: { findMany: jest.fn(), count: jest.fn() },
      watershed: { findMany: jest.fn(), count: jest.fn() },
      river: { findMany: jest.fn(), count: jest.fn() },
      station: { findMany: jest.fn(), count: jest.fn() },
      rekomtekBerkasTemplate: { findMany: jest.fn() },
      rekomtek: { findMany: jest.fn() },
      gisMap: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaKnowledgeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PrismaKnowledgeService>(PrismaKnowledgeService);
  });

  it('harus mengembalikan chunk flowchart publik', async () => {
    prisma.flowchart.findMany.mockResolvedValue([
      {
        id: 'fc1',
        slug: 'rekomtek',
        title: 'Alur Pengajuan Rekomendasi Teknis (Rekomtek)',
        description: 'Visualisasi interaktif alur rekomtek.',
        isPublished: true,
        nodes: [
          { id: 'PEMOHON', label: 'Pemohon Rekomendasi' },
          { id: 'DINAS', label: 'Kepala Dinas SDA' },
        ],
        edges: [
          {
            id: 'e1',
            source: 'PEMOHON',
            target: 'DINAS',
            label: '1 Hari Kerja',
          },
        ],
        updatedAt: new Date('2026-01-01'),
      },
    ]);
    prisma.riverRegion.findMany.mockResolvedValue([]);
    prisma.watershed.findMany.mockResolvedValue([]);
    prisma.river.findMany.mockResolvedValue([]);
    prisma.station.findMany.mockResolvedValue([]);
    prisma.rekomtekBerkasTemplate.findMany.mockResolvedValue([]);
    prisma.rekomtek.findMany.mockResolvedValue([]);
    prisma.gisMap.findMany.mockResolvedValue([]);

    const result = await service.search('bagaimana alur rekomtek', {
      limit: 5,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toContain('flowchart');
    expect(result[0].accessLevel).toBe('public');
    expect(result[0].content).toContain('Pemohon Rekomendasi');
  });

  it('harus memfilter stasiun berdasarkan status publik', async () => {
    prisma.flowchart.findMany.mockResolvedValue([]);
    prisma.riverRegion.findMany.mockResolvedValue([]);
    prisma.watershed.findMany.mockResolvedValue([]);
    prisma.river.findMany.mockResolvedValue([]);
    prisma.station.findMany.mockResolvedValue([
      {
        id: 'st1',
        name: 'Stasiun Bah Bolon',
        type: 'AWLR',
        operatorName: 'BBWS',
        village: 'Desa A',
        district: 'Kecamatan B',
        regency: 'Kabupaten C',
        description: 'Stasiun pemantau TMA',
      },
    ]);
    prisma.rekomtekBerkasTemplate.findMany.mockResolvedValue([]);
    prisma.rekomtek.findMany.mockResolvedValue([]);
    prisma.gisMap.findMany.mockResolvedValue([]);

    const result = await service.search('stasiun awlr', { limit: 5 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].content).toContain('AWLR');
  });

  it('harus menghormati batas limit', async () => {
    prisma.flowchart.findMany.mockResolvedValue([]);
    prisma.riverRegion.findMany.mockResolvedValue([
      { id: 'r1', name: 'WS A', description: null, code: 'A' },
      { id: 'r2', name: 'WS B', description: null, code: 'B' },
      { id: 'r3', name: 'WS C', description: null, code: 'C' },
    ]);
    prisma.watershed.findMany.mockResolvedValue([]);
    prisma.river.findMany.mockResolvedValue([]);
    prisma.station.findMany.mockResolvedValue([]);
    prisma.rekomtekBerkasTemplate.findMany.mockResolvedValue([]);
    prisma.rekomtek.findMany.mockResolvedValue([]);
    prisma.gisMap.findMany.mockResolvedValue([]);

    const result = await service.search('wilayah sungai', { limit: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('getSummaryChunk menghitung jumlah data dari database', async () => {
    prisma.riverRegion.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4);
    prisma.watershed.count.mockResolvedValue(5);
    prisma.river.count.mockResolvedValue(123);
    prisma.station.count.mockResolvedValue(0);

    const chunk = await service.getSummaryChunk();
    expect(chunk).not.toBeNull();
    expect(chunk!.content).toContain('Wilayah Sungai: 5');
    expect(chunk!.content).toContain('Sungai: 123');
    expect(chunk!.content).toContain('Wilayah Sungai terpublikasi: 4');
  });
});
