import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FlowchartsService } from './flowcharts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FlowchartsService', () => {
  let service: FlowchartsService;
  let prisma: {
    flowchart: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      flowchart: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowchartsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FlowchartsService>(FlowchartsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicBySlug', () => {
    it('hanya mengembalikan flowchart yang dipublikasikan', async () => {
      const mock = { id: '1', slug: 'rekomtek', isPublished: true };
      prisma.flowchart.findFirst.mockResolvedValue(mock);

      const result = await service.getPublicBySlug('rekomtek');
      expect(prisma.flowchart.findFirst).toHaveBeenCalledWith({
        where: { slug: 'rekomtek', isPublished: true },
      });
      expect(result).toEqual(mock);
    });
  });

  describe('findOne', () => {
    it('melempar NotFoundException bila tidak ditemukan', async () => {
      prisma.flowchart.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('mengembalikan flowchart bila ditemukan', async () => {
      const mock = { id: '1', slug: 'rekomtek' };
      prisma.flowchart.findUnique.mockResolvedValue(mock);

      await expect(service.findOne('1')).resolves.toEqual(mock);
    });
  });

  describe('create', () => {
    it('melempar ConflictException bila slug sudah dipakai', async () => {
      prisma.flowchart.findUnique.mockResolvedValue({
        id: '1',
        slug: 'rekomtek',
      });

      await expect(
        service.create({
          slug: 'rekomtek',
          title: 'Alur Rekomtek',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('menyimpan nodes dan edges sebagai JSON', async () => {
      prisma.flowchart.findUnique.mockResolvedValue(null);
      prisma.flowchart.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: '1', ...data }),
      );

      const dto = {
        slug: 'alur-baru',
        title: 'Alur Baru',
        nodes: [{ id: 'A', label: 'Mulai', type: 'process' }],
        edges: [],
      };

      const result = await service.create(dto as any);
      expect(prisma.flowchart.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nodes: dto.nodes,
          edges: [],
          isPublished: true,
        }),
      });
      expect(result).toEqual(expect.objectContaining({ id: '1' }));
    });
  });

  describe('update', () => {
    it('melempar ConflictException bila slug dipakai flowchart lain', async () => {
      prisma.flowchart.findUnique
        .mockResolvedValueOnce({ id: '1', slug: 'rekomtek' }) // findOne
        .mockResolvedValueOnce({ id: '2', slug: 'rekomtek' }); // slug check

      await expect(
        service.update('1', { slug: 'rekomtek' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });
});
