import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GisMapFileService } from './gis-map-file.service';
import {
  CreateGisMapDto,
  UpdateGisMapDto,
  QueryGisMapsDto,
} from './dto/gis-map.dto';

type GisMapResponseSource = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  hasGeometry: boolean;
  status: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  geometry?: Prisma.JsonValue | null;
};

@Injectable()
export class GisMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileService: GisMapFileService,
  ) {}

  private toResponse(map: GisMapResponseSource) {
    return {
      id: map.id,
      name: map.name,
      category: map.category,
      description: map.description,
      fileUrl: map.fileUrl,
      fileName: map.fileName,
      fileSize: map.fileSize,
      hasGeometry:
        map.hasGeometry ??
        (map.geometry !== undefined && map.geometry !== null),
      status: map.status,
      publishedAt: map.publishedAt,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
    };
  }

  private readonly listSelect = {
    id: true,
    name: true,
    category: true,
    description: true,
    fileUrl: true,
    fileName: true,
    fileSize: true,
    hasGeometry: true,
    status: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.GisMapSelect;

  async findAll(query: QueryGisMapsDto) {
    const where: Prisma.GisMapWhereInput = {};

    if (query.category) {
      where.category = query.category;
    }
    if (query.status === 'published') {
      where.status = true;
      where.publishedAt = { not: null };
    } else if (query.status === 'draft') {
      where.OR = [{ status: false }, { publishedAt: null }];
    }

    const [total, items] = await Promise.all([
      this.prisma.gisMap.count({ where }),
      this.prisma.gisMap.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: this.listSelect,
      }),
    ]);

    return {
      data: items.map((m) => this.toResponse(m)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const map = await this.prisma.gisMap.findUnique({
      where: { id },
      select: this.listSelect,
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    return this.toResponse(map);
  }

  // Untuk viewer — geometry diambil terpisah karena bisa berukuran besar.
  async findOneWithGeometry(id: string) {
    const map = await this.prisma.gisMap.findUnique({
      where: { id },
      select: {
        ...this.listSelect,
        geometry: true,
      },
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    return { ...this.toResponse(map), geometry: map.geometry };
  }

  async findPublishedGeometry(id: string) {
    const map = await this.prisma.gisMap.findFirst({
      where: {
        id,
        status: true,
        publishedAt: { not: null },
        hasGeometry: true,
      },
      select: { geometry: true },
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    return { geometry: map.geometry };
  }

  async create(dto: CreateGisMapDto) {
    const map = await this.prisma.gisMap.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description ?? null,
        fileUrl: '',
        fileName: '',
        fileSize: 0,
      },
    });
    return this.toResponse(map);
  }

  async update(id: string, dto: UpdateGisMapDto) {
    const existing = await this.prisma.gisMap.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    const map = await this.prisma.gisMap.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
      },
      select: this.listSelect,
    });
    return this.toResponse(map);
  }

  async uploadFile(id: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File wajib diunggah');
    }
    await this.fileService.saveForMap(id, file);
    const map = await this.prisma.gisMap.findUnique({
      where: { id },
      select: this.listSelect,
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    return this.toResponse(map);
  }

  async publish(id: string) {
    const existing = await this.prisma.gisMap.findUnique({
      where: { id },
      select: { id: true, fileUrl: true, hasGeometry: true },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    if (!existing.fileUrl || !existing.hasGeometry) {
      throw new BadRequestException('Peta belum memiliki geometri yang valid');
    }
    const map = await this.prisma.gisMap.update({
      where: { id },
      data: { status: true, publishedAt: new Date() },
      select: this.listSelect,
    });
    return this.toResponse(map);
  }

  async unpublish(id: string) {
    const existing = await this.prisma.gisMap.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    const map = await this.prisma.gisMap.update({
      where: { id },
      data: { status: false, publishedAt: null },
      select: this.listSelect,
    });
    return this.toResponse(map);
  }

  async remove(id: string) {
    const existing = await this.prisma.gisMap.findUnique({
      where: { id },
      select: { id: true, fileUrl: true },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    if (existing.fileUrl) {
      await this.fileService.deleteFileByUrl(existing.fileUrl);
    }
    await this.prisma.gisMap.delete({ where: { id } });
    return { deleted: true };
  }

  async findPublished() {
    const maps = await this.prisma.gisMap.findMany({
      where: {
        status: true,
        publishedAt: { not: null },
        hasGeometry: true,
      },
      orderBy: { publishedAt: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        hasGeometry: true,
        publishedAt: true,
      },
    });
    return {
      maps: maps.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        hasGeometry: m.hasGeometry,
        publishedAt: m.publishedAt,
      })),
    };
  }
}
