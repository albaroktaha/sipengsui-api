import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RekomtekStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  BerkasQueryDto,
  ReturnForRevisionDto,
  UpdateBerkasDto,
} from './dto/berkas.dto';
import { isAllowedGoogleDriveUrl } from './drive-url.util';
import { getPrimaryRole, isRekomtekStaff } from './rekomtek-access.util';

export interface BerkasProgress {
  total: number;
  completed: number;
  required: number;
  completedRequired: number;
  progress: number;
  progressRequired: number;
}

const berkasSelect = {
  id: true,
  rekomtekId: true,
  templateId: true,
  kode: true,
  nomorUrut: true,
  uraian: true,
  isRequired: true,
  isComplete: true,
  driveUrl: true,
  notes: true,
  revisionNote: true,
  returnedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RekomtekBerkasSelect;

@Injectable()
export class BerkasService {
  constructor(private readonly prisma: PrismaService) {}

  async getByRekomtekId(
    rekomtekId: string,
    query: BerkasQueryDto = new BerkasQueryDto(),
  ) {
    const where: Prisma.RekomtekBerkasWhereInput = { rekomtekId };

    if (query.status === 'COMPLETE') {
      where.isComplete = true;
    } else if (query.status === 'INCOMPLETE') {
      where.isComplete = false;
    }

    if (query.search?.trim()) {
      where.OR = [
        { kode: { contains: query.search.trim(), mode: 'insensitive' } },
        { uraian: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const sortBy = query.sortBy ?? 'nomorUrut';
    const sortOrder = query.sortOrder ?? 'asc';
    const orderBy =
      sortBy === 'nomorUrut'
        ? [{ nomorUrut: sortOrder }, { kode: sortOrder }]
        : { [sortBy]: sortOrder };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rekomtekBerkas.findMany({
        where,
        select: berkasSelect,
        orderBy,
        skip,
        take: query.limit,
      }),
      this.prisma.rekomtekBerkas.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async update(
    rekomtekId: string,
    berkasId: string,
    dto: UpdateBerkasDto,
    user: AuthenticatedUser,
  ) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
      select: {
        id: true,
        driveUrl: true,
        rekomtek: { select: { status: true, createdById: true } },
      },
    });

    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    const staff = isRekomtekStaff(user);
    if (!staff) {
      if (berkas.rekomtek.createdById !== user.userId) {
        throw new ForbiddenException('Anda tidak memiliki akses mengubah berkas ini');
      }
      if (
        ![RekomtekStatus.DRAFT, RekomtekStatus.REJECTED].some(
          (status) => status === berkas.rekomtek.status,
        )
      ) {
        throw new ForbiddenException(
          'Link hanya dapat diubah saat permohonan masih DRAFT atau dikembalikan untuk revisi',
        );
      }
      if (dto.notes !== undefined || dto.isComplete !== undefined) {
        throw new ForbiddenException(
          'Catatan dan status verifikasi hanya dapat diubah Petugas Rekomtek',
        );
      }
    } else if (
      [RekomtekStatus.APPROVED, RekomtekStatus.PUBLISHED].some(
        (status) => status === berkas.rekomtek.status,
      )
    ) {
      throw new ForbiddenException(
        'Berkas tidak dapat diubah setelah rekomtek disetujui atau diterbitkan',
      );
    }

    const normalizedDriveUrl =
      dto.driveUrl === undefined
        ? undefined
        : dto.driveUrl?.trim() || null;

    if (
      normalizedDriveUrl !== undefined &&
      normalizedDriveUrl !== null &&
      !isAllowedGoogleDriveUrl(normalizedDriveUrl)
    ) {
      throw new BadRequestException(
        'Link harus menggunakan HTTPS pada domain drive.google.com atau docs.google.com',
      );
    }

    const driveUrlChanged =
      normalizedDriveUrl !== undefined && normalizedDriveUrl !== berkas.driveUrl;
    const updateData: Prisma.RekomtekBerkasUpdateInput = {};

    if (normalizedDriveUrl !== undefined) {
      updateData.driveUrl = normalizedDriveUrl;
      if (driveUrlChanged) {
        updateData.revisionNote = null;
        updateData.returnedAt = null;
      }
    }
    if (dto.isComplete !== undefined) {
      updateData.isComplete = dto.isComplete;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rekomtekBerkas.update({
        where: { id: berkasId },
        data: updateData,
        select: berkasSelect,
      });

      if (driveUrlChanged) {
        await tx.rekomtekBerkasLinkHistory.create({
          data: {
            rekomtekBerkasId: berkasId,
            oldDriveUrl: berkas.driveUrl,
            newDriveUrl: normalizedDriveUrl ?? null,
            changedById: user.userId,
            role: getPrimaryRole(user),
          },
        });
      }

      return updated;
    });
  }

  async returnForRevision(
    rekomtekId: string,
    berkasId: string,
    dto: ReturnForRevisionDto,
    user: AuthenticatedUser,
  ) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
      select: { id: true, rekomtek: { select: { status: true } } },
    });

    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }
    if (!isRekomtekStaff(user)) {
      throw new ForbiddenException(
        'Hanya Petugas Rekomtek yang dapat mengembalikan berkas untuk revisi',
      );
    }
    if (berkas.rekomtek.status !== RekomtekStatus.REVIEW) {
      throw new BadRequestException(
        'Berkas hanya dapat dikembalikan saat rekomtek sedang direview',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rekomtekBerkas.update({
        where: { id: berkasId },
        data: {
          isComplete: false,
          revisionNote: dto.revisionNote,
          returnedAt: new Date(),
        },
        select: berkasSelect,
      });

      await tx.rekomtek.update({
        where: { id: rekomtekId },
        data: {
          status: RekomtekStatus.REJECTED,
          reviewedBy: user.userId,
          reviewedAt: new Date(),
        },
      });

      return updated;
    });
  }

  async generateFromTemplate(
    rekomtekId: string,
    jenis: string,
    jenisPermohonan: string,
  ) {
    const templates = await this.prisma.rekomtekBerkasTemplate.findMany({
      where: {
        jenis,
        jenisPermohonan: jenisPermohonan as any,
      },
      orderBy: [{ nomorUrut: 'asc' }, { kode: 'asc' }],
    });

    if (templates.length === 0) {
      return;
    }

    const items = templates.map((t) => ({
      rekomtekId,
      templateId: t.id,
      kode: t.kode,
      nomorUrut: t.nomorUrut,
      uraian: t.uraian,
      isRequired: t.isRequired,
      isComplete: false,
    }));

    await this.prisma.rekomtekBerkas.createMany({
      data: items,
    });
  }

  async getProgress(rekomtekId: string): Promise<BerkasProgress> {
    const [total, completed, required, completedRequired] =
      await this.prisma.$transaction([
        this.prisma.rekomtekBerkas.count({ where: { rekomtekId } }),
        this.prisma.rekomtekBerkas.count({
          where: { rekomtekId, isComplete: true },
        }),
        this.prisma.rekomtekBerkas.count({
          where: { rekomtekId, isRequired: true },
        }),
        this.prisma.rekomtekBerkas.count({
          where: { rekomtekId, isRequired: true, isComplete: true },
        }),
      ]);

    return this.toProgress(total, completed, required, completedRequired);
  }

  async getProgressForRekomtekIds(
    rekomtekIds: string[],
  ): Promise<Record<string, BerkasProgress>> {
    if (rekomtekIds.length === 0) return {};

    const rows = await this.prisma.rekomtekBerkas.findMany({
      where: { rekomtekId: { in: rekomtekIds } },
      select: { rekomtekId: true, isComplete: true, isRequired: true },
    });
    const grouped = new Map<
      string,
      { total: number; completed: number; required: number; completedRequired: number }
    >();

    for (const row of rows) {
      const current = grouped.get(row.rekomtekId) ?? {
        total: 0,
        completed: 0,
        required: 0,
        completedRequired: 0,
      };
      current.total += 1;
      if (row.isComplete) current.completed += 1;
      if (row.isRequired) current.required += 1;
      if (row.isRequired && row.isComplete) current.completedRequired += 1;
      grouped.set(row.rekomtekId, current);
    }

    return Object.fromEntries(
      rekomtekIds.map((id) => {
        const current = grouped.get(id) ?? {
          total: 0,
          completed: 0,
          required: 0,
          completedRequired: 0,
        };
        return [
          id,
          this.toProgress(
            current.total,
            current.completed,
            current.required,
            current.completedRequired,
          ),
        ];
      }),
    );
  }

  private toProgress(
    total: number,
    completed: number,
    required: number,
    completedRequired: number,
  ): BerkasProgress {
    return {
      total,
      completed,
      required,
      completedRequired,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      progressRequired:
        required > 0 ? Math.round((completedRequired / required) * 100) : 0,
    };
  }
}
