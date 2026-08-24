import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, RekomtekStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

import { CreateRekomtekDto } from './dto/create-rekomtek.dto';
import { UpdateRekomtekDto } from './dto/update-rekomtek.dto';
import { QueryRekomtekDto } from './dto/query-rekomtek.dto';
import { BerkasService } from './berkas.service';
import { isAllowedGoogleDriveUrl } from './drive-url.util';
import { isRekomtekStaff } from './rekomtek-access.util';

@Injectable()
export class RekomtekService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly berkasService: BerkasService,
  ) {}

  private includeClause = {
    station: true,
    watershed: true,
    riverRegion: true,
    river: true,
  };

  private accessSelect = {
    id: true,
    createdById: true,
    status: true,
  } as const;

  /**
   * Role yang boleh melihat / mengelola SEMUA rekomtek.
   * User biasa (USER) hanya boleh melihat & mengelola rekomtek miliknya sendiri.
   */
  private isStaff(user: AuthenticatedUser): boolean {
    return isRekomtekStaff(user);
  }

  async canAccess(
    user: AuthenticatedUser,
    id: string,
    _opts: { forUpdate?: boolean } = {},
  ) {
    const rekomtek = await this.prisma.rekomtek.findUnique({
      where: { id },
      select: this.accessSelect,
    });

    if (!rekomtek) {
      throw new NotFoundException('Rekomtek tidak ditemukan');
    }

    // Staff boleh akses semua; user biasa hanya miliknya sendiri.
    if (!this.isStaff(user) && rekomtek.createdById !== user.userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke rekomtek ini');
    }

    return rekomtek;
  }

  async create(dto: CreateRekomtekDto, user: AuthenticatedUser) {
    const existing = await this.prisma.rekomtek.findUnique({
      where: { nomor: dto.nomor },
    });

    if (existing) {
      throw new ConflictException(
        `Nomor rekomtek '${dto.nomor}' sudah digunakan`,
      );
    }

    await this.validateReferences(dto);

    const analysisData = dto.analysisData
      ? JSON.parse(dto.analysisData)
      : undefined;
    const parameters = dto.parameters ? JSON.parse(dto.parameters) : undefined;

    const rekomtek = await this.prisma.rekomtek.create({
      data: {
        nomor: dto.nomor,
        judul: dto.judul,
        jenis: dto.jenis,
        jenisPermohonan: dto.jenisPermohonan as any,
        deskripsi: dto.deskripsi,
        status: RekomtekStatus.DRAFT,
        stationId: dto.stationId,
        riverId: dto.riverId,
        customRiverName: dto.customRiverName,
        watershedId: dto.watershedId,
        riverRegionId: dto.riverRegionId,
        analysisData,
        parameters,
        fileUrl: dto.fileUrl,
        createdBy: dto.createdBy,
        createdById: user.userId,
      },
      include: this.includeClause,
    });

    // Auto-generate checklist berkas dari template
    await this.berkasService.generateFromTemplate(
      rekomtek.id,
      dto.jenis,
      dto.jenisPermohonan,
    );

    // Return rekomtek dengan berkas
    return this.prisma.rekomtek.findUnique({
      where: { id: rekomtek.id },
      include: this.includeClause,
    });
  }

  async findAll(query: QueryRekomtekDto, user: AuthenticatedUser) {
    const where: Prisma.RekomtekWhereInput = {};

    // Filter kepemilikan: user biasa hanya melihat miliknya sendiri.
    if (!this.isStaff(user)) {
      where.createdById = user.userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.jenisPermohonan) {
      where.jenisPermohonan = query.jenisPermohonan as any;
    }

    if (query.stationId) {
      where.stationId = query.stationId;
    }

    if (query.watershedId) {
      where.watershedId = query.watershedId;
    }

    if (query.riverRegionId) {
      where.riverRegionId = query.riverRegionId;
    }

    if (query.keyword) {
      where.OR = [
        {
          judul: {
            contains: query.keyword,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          nomor: {
            contains: query.keyword,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          deskripsi: {
            contains: query.keyword,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ];
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate && { gte: new Date(query.startDate) }),
        ...(query.endDate && { lte: new Date(query.endDate) }),
      };
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.rekomtek.findMany({
        where,
        select: {
          id: true,
          nomor: true,
          judul: true,
          jenis: true,
          jenisPermohonan: true,
          deskripsi: true,
          status: true,
          stationId: true,
          riverId: true,
          customRiverName: true,
          watershedId: true,
          riverRegionId: true,
          fileUrl: true,
          createdBy: true,
          createdById: true,
          reviewedBy: true,
          approvedBy: true,
          reviewedAt: true,
          approvedAt: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          station: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.rekomtek.count({ where }),
    ]);

    const progressByRekomtek = await this.berkasService.getProgressForRekomtekIds(
      items.map((item) => item.id),
    );

    return {
      data: items.map((item) => ({
        ...item,
        berkasProgress: progressByRekomtek[item.id],
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    await this.canAccess(user, id);
    return this.prisma.rekomtek.findUnique({
      where: { id },
      include: this.includeClause,
    });
  }

  async update(id: string, dto: UpdateRekomtekDto, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id, { forUpdate: true });

    if (
      !this.isStaff(user) &&
      ![RekomtekStatus.DRAFT, RekomtekStatus.REJECTED].some(
        (status) => status === rekomtek.status,
      )
    ) {
      throw new ForbiddenException(
        'Permohonan hanya dapat diubah saat DRAFT atau dikembalikan untuk revisi',
      );
    }

    if (dto.nomor) {
      const existing = await this.prisma.rekomtek.findUnique({
        where: { nomor: dto.nomor },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Nomor rekomtek '${dto.nomor}' sudah digunakan`,
        );
      }
    }

    await this.validateReferences(dto);

    const analysisData = dto.analysisData
      ? JSON.parse(dto.analysisData)
      : undefined;
    const parameters = dto.parameters ? JSON.parse(dto.parameters) : undefined;

    return this.prisma.rekomtek.update({
      where: { id },
      data: {
        ...(dto.nomor !== undefined && { nomor: dto.nomor }),
        ...(dto.judul !== undefined && { judul: dto.judul }),
        ...(dto.jenis !== undefined && { jenis: dto.jenis }),
        ...(dto.jenisPermohonan !== undefined && {
          jenisPermohonan: dto.jenisPermohonan as any,
        }),
        ...(dto.deskripsi !== undefined && { deskripsi: dto.deskripsi }),
        ...(dto.stationId !== undefined && { stationId: dto.stationId }),
        ...(dto.riverId !== undefined && { riverId: dto.riverId }),
        ...(dto.customRiverName !== undefined && {
          customRiverName: dto.customRiverName,
        }),
        ...(dto.watershedId !== undefined && { watershedId: dto.watershedId }),
        ...(dto.riverRegionId !== undefined && {
          riverRegionId: dto.riverRegionId,
        }),
        ...(analysisData !== undefined && { analysisData }),
        ...(parameters !== undefined && { parameters }),
        ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
      },
      include: this.includeClause,
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.canAccess(user, id, { forUpdate: true });

    return this.prisma.rekomtek.delete({ where: { id } });
  }

  async submit(id: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id, { forUpdate: true });

    if (
      ![RekomtekStatus.DRAFT, RekomtekStatus.REJECTED].some(
        (status) => status === rekomtek.status,
      )
    ) {
      throw new BadRequestException(
        'Hanya rekomtek DRAFT atau yang dikembalikan untuk revisi yang dapat diajukan ulang',
      );
    }

    const requiredBerkas = await this.prisma.rekomtekBerkas.findMany({
      where: { rekomtekId: id, isRequired: true },
      select: { id: true, kode: true, uraian: true, driveUrl: true },
    });

    const missingBerkas = requiredBerkas
      .filter(
        (berkas) => !isAllowedGoogleDriveUrl(berkas.driveUrl),
      )
      .map((berkas) => ({
        id: berkas.id,
        kode: berkas.kode,
        uraian: berkas.uraian,
      }));

    if (missingBerkas.length > 0) {
      throw new BadRequestException({
        message: 'Semua berkas wajib harus memiliki link Google Drive yang valid',
        missingBerkas,
      });
    }

    return this.prisma.rekomtek.update({
      where: { id },
      data: { status: RekomtekStatus.REVIEW },
      include: this.includeClause,
    });
  }

  async approve(id: string, reviewedBy: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id);

    if (rekomtek.status !== RekomtekStatus.REVIEW) {
      throw new BadRequestException(
        'Hanya rekomtek dengan status REVIEW yang dapat disetujui',
      );
    }

    return this.prisma.rekomtek.update({
      where: { id },
      data: {
        status: RekomtekStatus.APPROVED,
        reviewedBy,
        reviewedAt: new Date(),
      },
      include: this.includeClause,
    });
  }

  async reject(id: string, reviewedBy: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id);

    if (rekomtek.status !== RekomtekStatus.REVIEW) {
      throw new BadRequestException(
        'Hanya rekomtek dengan status REVIEW yang dapat ditolak',
      );
    }

    return this.prisma.rekomtek.update({
      where: { id },
      data: {
        status: RekomtekStatus.REJECTED,
        reviewedBy,
        reviewedAt: new Date(),
      },
      include: this.includeClause,
    });
  }

  async publish(id: string, approvedBy: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id);

    if (rekomtek.status !== RekomtekStatus.APPROVED) {
      throw new BadRequestException(
        'Hanya rekomtek dengan status APPROVED yang dapat dipublikasikan',
      );
    }

    return this.prisma.rekomtek.update({
      where: { id },
      data: {
        status: RekomtekStatus.PUBLISHED,
        approvedBy,
        approvedAt: new Date(),
        publishedAt: new Date(),
      },
      include: this.includeClause,
    });
  }

  private async validateReferences(dto: {
    stationId?: string;
    riverId?: string;
    watershedId?: string;
    riverRegionId?: string;
  }) {
    if (dto.stationId) {
      const station = await this.prisma.station.findUnique({
        where: { id: dto.stationId },
      });

      if (!station) {
        throw new NotFoundException('Station tidak ditemukan');
      }
    }

    if (dto.riverId) {
      const river = await this.prisma.river.findUnique({
        where: { id: dto.riverId },
      });

      if (!river) {
        throw new NotFoundException('Sungai tidak ditemukan');
      }
    }

    if (dto.watershedId) {
      const watershed = await this.prisma.watershed.findUnique({
        where: { id: dto.watershedId },
      });

      if (!watershed) {
        throw new NotFoundException('DAS tidak ditemukan');
      }
    }

    if (dto.riverRegionId) {
      const region = await this.prisma.riverRegion.findUnique({
        where: { id: dto.riverRegionId },
      });

      if (!region) {
        throw new NotFoundException('Wilayah Sungai tidak ditemukan');
      }
    }
  }
}
