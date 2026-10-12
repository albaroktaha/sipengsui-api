import {
  Injectable,
  BadRequestException,
  Logger,
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
  versionCounter: number;
  sourceOrganization: string | null;
  surveyDate: Date | null;
  accuracyMeters: Prisma.Decimal | null;
  sourceCrs: string | null;
  outputCrs: string;
  license: string | null;
  coverage: string | null;
  qualityNotes: string | null;
  geometry?: Prisma.JsonValue | null;
};

@Injectable()
export class GisMapService {
  private readonly logger = new Logger(GisMapService.name);

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
      fileUrl: map.fileUrl ? `/gis/maps/${map.id}/file` : '',
      fileName: map.fileName,
      fileSize: map.fileSize,
      hasGeometry:
        map.hasGeometry ??
        (map.geometry !== undefined && map.geometry !== null),
      status: map.status,
      publishedAt: map.publishedAt,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
      versionCounter: map.versionCounter,
      sourceOrganization: map.sourceOrganization,
      surveyDate: map.surveyDate,
      accuracyMeters: map.accuracyMeters?.toString() ?? null,
      sourceCrs: map.sourceCrs,
      outputCrs: map.outputCrs,
      license: map.license,
      coverage: map.coverage,
      qualityNotes: map.qualityNotes,
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
    versionCounter: true,
    sourceOrganization: true,
    surveyDate: true,
    accuracyMeters: true,
    sourceCrs: true,
    outputCrs: true,
    license: true,
    coverage: true,
    qualityNotes: true,
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

  async getOriginalFile(
    id: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const map = await this.prisma.gisMap.findUnique({
      where: { id },
      select: { fileUrl: true, fileName: true },
    });
    if (!map || !map.fileUrl || !map.fileName) {
      throw new NotFoundException('Berkas GIS tidak ditemukan');
    }
    return {
      filePath: this.fileService.resolveStoredFilePath(map.fileUrl),
      fileName: map.fileName,
    };
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
      select: {
        geometry: true,
        versionCounter: true,
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { geometry: true },
        },
      },
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    const publishedVersion = map.versions[0];
    return {
      geometry: publishedVersion
        ? publishedVersion.geometry
        : map.versionCounter === 0
          ? map.geometry
          : null,
    };
  }

  async create(dto: CreateGisMapDto) {
    const map = await this.prisma.gisMap.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description ?? null,
        sourceOrganization: dto.sourceOrganization ?? null,
        surveyDate: dto.surveyDate ? new Date(dto.surveyDate) : null,
        accuracyMeters: dto.accuracyMeters ?? null,
        sourceCrs: dto.sourceCrs ?? null,
        license: dto.license ?? null,
        coverage: dto.coverage ?? null,
        qualityNotes: dto.qualityNotes ?? null,
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
        ...(dto.sourceOrganization !== undefined
          ? { sourceOrganization: dto.sourceOrganization }
          : {}),
        ...(dto.surveyDate !== undefined
          ? { surveyDate: dto.surveyDate ? new Date(dto.surveyDate) : null }
          : {}),
        ...(dto.accuracyMeters !== undefined
          ? { accuracyMeters: dto.accuracyMeters }
          : {}),
        ...(dto.sourceCrs !== undefined ? { sourceCrs: dto.sourceCrs } : {}),
        ...(dto.license !== undefined ? { license: dto.license } : {}),
        ...(dto.coverage !== undefined ? { coverage: dto.coverage } : {}),
        ...(dto.qualityNotes !== undefined
          ? { qualityNotes: dto.qualityNotes }
          : {}),
      },
      select: this.listSelect,
    });
    return this.toResponse(map);
  }

  async uploadFile(
    id: string,
    file: Express.Multer.File,
    createdById?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File wajib diunggah');
    }
    await this.fileService.saveForMap(id, file, createdById);
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
      select: {
        id: true,
        fileUrl: true,
        hasGeometry: true,
        versions: {
          where: { status: 'DRAFT' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, fileUrl: true, validationReport: true },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    const draftVersion = existing.versions[0];
    if (
      draftVersion &&
      !isValidValidationReport(draftVersion.validationReport)
    ) {
      throw new BadRequestException(
        'Versi draft belum lolos validasi geometri dan tidak dapat dipublikasikan',
      );
    }
    if (!(draftVersion?.fileUrl ?? existing.fileUrl) || !existing.hasGeometry) {
      throw new BadRequestException('Peta belum memiliki geometri yang valid');
    }
    const publishedAt = new Date();
    const map = await this.prisma.$transaction(async (tx) => {
      if (draftVersion) {
        await tx.gisMapVersion.updateMany({
          where: { mapId: id, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });
        await tx.gisMapVersion.update({
          where: { id: draftVersion.id },
          data: { status: 'PUBLISHED', publishedAt },
        });
      }
      return tx.gisMap.update({
        where: { id },
        data: { status: true, publishedAt },
        select: this.listSelect,
      });
    });
    return this.toResponse(map);
  }

  async findVersions(id: string) {
    const map = await this.prisma.gisMap.findUnique({
      where: { id },
      select: {
        id: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            fileName: true,
            fileSize: true,
            checksum: true,
            validationReport: true,
            metadata: true,
            status: true,
            createdById: true,
            createdAt: true,
            publishedAt: true,
          },
        },
      },
    });
    if (!map) throw new NotFoundException('Peta tidak ditemukan');
    return { data: map.versions };
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
      select: {
        id: true,
        fileUrl: true,
        versions: { select: { fileUrl: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Peta tidak ditemukan');
    }
    await this.prisma.gisMap.delete({ where: { id } });
    const fileUrls = [
      ...new Set(
        [
          existing.fileUrl,
          ...existing.versions.map((version) => version.fileUrl),
        ].filter(Boolean),
      ),
    ];
    const cleanupPending: string[] = [];
    for (const fileUrl of fileUrls) {
      try {
        await this.fileService.deleteFileByUrl(fileUrl);
      } catch (error) {
        cleanupPending.push(fileUrl);
        this.logger.error(
          `Gagal membersihkan berkas peta yang sudah dihapus (${fileUrl}): ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return { deleted: true, cleanupPending };
  }

  async findPublished() {
    const maps = await this.prisma.gisMap.findMany({
      where: {
        status: true,
        publishedAt: { not: null },
        hasGeometry: true,
        OR: [
          { versionCounter: 0 },
          { versions: { some: { status: 'PUBLISHED' } } },
        ],
      },
      orderBy: { publishedAt: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        versionCounter: true,
        hasGeometry: true,
        publishedAt: true,
        sourceOrganization: true,
        surveyDate: true,
        accuracyMeters: true,
        sourceCrs: true,
        outputCrs: true,
        license: true,
        coverage: true,
        qualityNotes: true,
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { metadata: true },
        },
      },
    });
    return {
      maps: maps.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        hasGeometry: m.hasGeometry,
        publishedAt: m.publishedAt,
        metadata: m.versions[0]
          ? m.versions[0].metadata
          : m.versionCounter === 0
            ? {
                sourceOrganization: m.sourceOrganization,
                surveyDate: m.surveyDate,
                accuracyMeters: m.accuracyMeters?.toString() ?? null,
                sourceCrs: m.sourceCrs,
                outputCrs: m.outputCrs,
                license: m.license,
                coverage: m.coverage,
                qualityNotes: m.qualityNotes,
              }
            : null,
      })),
    };
  }
}

function isValidValidationReport(value: Prisma.JsonValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).valid === true;
}
