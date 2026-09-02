import { PrismaKnowledgeService } from './prisma-knowledge.service';

describe('PrismaKnowledgeService public knowledge boundary', () => {
  it('counts only published public records in the live summary', async () => {
    const prisma = {
      riverRegion: { count: jest.fn().mockResolvedValueOnce(12) },
      watershed: { count: jest.fn().mockResolvedValue(8) },
      river: { count: jest.fn().mockResolvedValue(7) },
      station: { count: jest.fn().mockResolvedValue(6) },
    };
    const service = new PrismaKnowledgeService(prisma as never);

    const chunk = await service.getSummaryChunk();

    expect(chunk?.content).toContain('Wilayah Sungai: 12');
    expect(prisma.riverRegion.count).toHaveBeenCalledWith({
      where: { status: true, publishedAt: { not: null } },
    });
    expect(prisma.watershed.count).toHaveBeenCalledWith({
      where: { status: true, publishedAt: { not: null } },
    });
    expect(prisma.river.count).toHaveBeenCalledWith({
      where: { status: true, publishedAt: { not: null } },
    });
    expect(prisma.station.count).toHaveBeenCalledWith({
      where: { status: true, publishedAt: { not: null } },
    });
  });

  it('does not expose Rekomtek records without an explicit public policy', async () => {
    const emptyFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      flowchart: { findMany: emptyFindMany },
      riverRegion: { findMany: emptyFindMany },
      watershed: { findMany: emptyFindMany },
      river: { findMany: emptyFindMany },
      station: { findMany: emptyFindMany },
      rekomtekBerkasTemplate: { findMany: emptyFindMany },
      rekomtek: {
        findMany: jest.fn().mockResolvedValue([{ id: 'private-1' }]),
      },
      gisMap: { findMany: emptyFindMany },
    };
    const service = new PrismaKnowledgeService(prisma as never);

    await service.search('rekomtek');

    expect(prisma.rekomtek.findMany).not.toHaveBeenCalled();
  });
});
