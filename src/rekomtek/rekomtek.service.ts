import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BerkasSourceType,
  JenisPermohonan,
  Prisma,
  RekomtekStatus,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

import { CreateRekomtekDto } from './dto/create-rekomtek.dto';
import { UpdateRekomtekDto } from './dto/update-rekomtek.dto';
import { QueryRekomtekDto } from './dto/query-rekomtek.dto';
import { BerkasService } from './berkas.service';
import { isPetugasOnly, isRekomtekStaff } from './rekomtek-access.util';

function parseJsonInput(value?: string): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  return parsed === null ? undefined : parsed;
}

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
    parentRekomtek: {
      select: { id: true, nomor: true, revisionNumber: true, status: true },
    },
    revisions: {
      select: { id: true, nomor: true, revisionNumber: true, status: true },
      orderBy: { revisionNumber: 'asc' as const },
    },
  };

  private accessSelect = {
    id: true,
    createdById: true,
    status: true,
    sourceRevision: true,
    checklistRevision: true,
  } as const;

  /**
   * Role yang boleh melihat / mengelola SEMUA rekomtek.
   * User biasa (USER) hanya boleh melihat & mengelola rekomtek miliknya sendiri.
   */
  private isStaff(user: AuthenticatedUser): boolean {
    return isRekomtekStaff(user);
  }

  private assertCanSubmitApplication(user: AuthenticatedUser): void {
    if (isPetugasOnly(user)) {
      throw new ForbiddenException(
        'Petugas hanya dapat mereview Berkas Persyaratan pada Permohonan yang ditugaskan',
      );
    }
  }

  async canAccess(
    user: AuthenticatedUser,
    id: string,
    _opts: { forUpdate?: boolean } = {},
  ) {
    void _opts;
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

    const isPetugas = isPetugasOnly(user);
    const teamMemberDelegate = (
      this.prisma as unknown as {
        rekomtekTeamMember?: {
          findMany: (
            args: unknown,
          ) => Promise<Array<{ id: string; userId: string }>>;
        };
      }
    ).rekomtekTeamMember;
    if (isPetugas && teamMemberDelegate) {
      const members = await teamMemberDelegate.findMany({
        where: {
          activeUntil: null,
          assignment: { rekomtekId: id, isActive: true },
        },
        select: { id: true, userId: true },
      });
      const assignment = members.find(
        (member) => member.userId === user.userId,
      );
      if (!assignment) {
        throw new ForbiddenException(
          'Petugas hanya dapat mengakses Permohonan Rekomtek yang ditugaskan kepadanya',
        );
      }
    }

    return rekomtek;
  }

  async create(dto: CreateRekomtekDto, user: AuthenticatedUser) {
    this.assertCanSubmitApplication(user);
    const existing = await this.prisma.rekomtek.findUnique({
      where: { nomor: dto.nomor },
    });

    if (existing) {
      throw new ConflictException(
        `Nomor rekomtek '${dto.nomor}' sudah digunakan`,
      );
    }

    await this.validateReferences(dto);

    const analysisData = parseJsonInput(dto.analysisData);
    const parameters = parseJsonInput(dto.parameters);

    const rekomtek = await this.prisma.rekomtek.create({
      data: {
        nomor: dto.nomor,
        judul: dto.judul,
        jenis: dto.jenis,
        jenisPermohonan: dto.jenisPermohonan as JenisPermohonan,
        deskripsi: dto.deskripsi,
        status: RekomtekStatus.DRAFT,
        workflowStage: RekomtekWorkflowStage.PEMOHON_DRAFT,
        workflowMigrationRequired: false,
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

    // Auto-generate checklist berkas dari template. Jangan tinggalkan
    // parent kosong bila template tidak tersedia atau gagal dibuat.
    try {
      const checklistCount = await this.berkasService.generateFromTemplate(
        rekomtek.id,
        dto.jenis,
        dto.jenisPermohonan,
      );
      if (!checklistCount) {
        throw new BadRequestException(
          `Checklist belum dapat dibuat untuk ${dto.jenis} / ${dto.jenisPermohonan}`,
        );
      }
    } catch (error) {
      await this.prisma.rekomtek.delete({ where: { id: rekomtek.id } });
      throw error;
    }

    await this.prisma.rekomtekWorkflowEvent.create({
      data: {
        rekomtekId: rekomtek.id,
        fromStage: null,
        toStage: RekomtekWorkflowStage.PEMOHON_DRAFT,
        action: 'BUAT_PERMOHONAN',
        actorId: user.userId,
        actorRole: user.role || user.roles?.[0] || 'USER',
        actorPermissions: user.permissions,
      },
    });

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
    if (
      user.roles?.includes('PETUGAS') &&
      !user.roles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'PIMPINAN'].includes(role),
      )
    ) {
      where.teamAssignments = {
        some: {
          isActive: true,
          members: { some: { userId: user.userId, activeUntil: null } },
        },
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.jenisPermohonan) {
      where.jenisPermohonan = query.jenisPermohonan;
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
          workflowStage: true,
          initialCorrectionCount: true,
          workflowVersion: true,
          workflowMigrationRequired: true,
          workflowMigrationNote: true,
          approvedDraftArtifactId: true,
          publishedArtifactId: true,
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

    const progressByRekomtek =
      await this.berkasService.getProgressForRekomtekIds(
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

    if (!this.isStaff(user) && rekomtek.status !== RekomtekStatus.DRAFT) {
      throw new ForbiddenException(
        'Permohonan hanya dapat diubah saat DRAFT; gunakan Ajukan Ulang untuk revision baru',
      );
    }
    if (rekomtek.status === RekomtekStatus.REJECTED) {
      throw new ForbiddenException(
        'Record REJECTED immutable; gunakan Ajukan Ulang untuk revision baru',
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

    const analysisData = parseJsonInput(dto.analysisData);
    const parameters = parseJsonInput(dto.parameters);

    return this.prisma.rekomtek.update({
      where: { id },
      data: {
        ...(dto.nomor !== undefined && { nomor: dto.nomor }),
        ...(dto.judul !== undefined && { judul: dto.judul }),
        ...(dto.jenis !== undefined && { jenis: dto.jenis }),
        ...(dto.jenisPermohonan !== undefined && {
          jenisPermohonan: dto.jenisPermohonan as JenisPermohonan,
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
    const rekomtek = await this.canAccess(user, id, { forUpdate: true });
    if (!this.isStaff(user) && rekomtek.status !== RekomtekStatus.DRAFT) {
      throw new ForbiddenException(
        'Record REJECTED immutable; gunakan Ajukan Ulang untuk membuat revision baru',
      );
    }
    if (rekomtek.status === RekomtekStatus.REJECTED) {
      throw new ForbiddenException(
        'Record REJECTED immutable; gunakan Ajukan Ulang untuk revision baru',
      );
    }

    return this.prisma.rekomtek.delete({ where: { id } });
  }

  async submit(id: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id, { forUpdate: true });
    this.assertCanSubmitApplication(user);

    if (rekomtek.status !== RekomtekStatus.DRAFT) {
      throw new BadRequestException(
        'Hanya rekomtek DRAFT yang dapat diajukan. Gunakan Ajukan Ulang untuk record REJECTED.',
      );
    }

    const expectedSourceRevision = rekomtek.sourceRevision;
    const validation = await this.berkasService.revalidateRequired(id);
    if (validation.issues.length > 0) {
      throw new BadRequestException({
        message:
          'Semua berkas wajib harus lolos validasi teknis sebelum Submit',
        berkasIssues: validation.issues,
      });
    }

    const claimed = await this.prisma.rekomtek.updateMany({
      where: {
        id,
        status: RekomtekStatus.DRAFT,
        sourceRevision: expectedSourceRevision,
      },
      data: { status: RekomtekStatus.REVIEW },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Sumber atau status rekomtek berubah selama validasi; ulangi Submit',
      );
    }
    return this.prisma.rekomtek.findUnique({
      where: { id },
      include: this.includeClause,
    });
  }

  async reapply(id: string, user: AuthenticatedUser) {
    await this.canAccess(user, id, { forUpdate: true });
    this.assertCanSubmitApplication(user);
    const original = await this.prisma.rekomtek.findUnique({
      where: { id },
      include: { berkas: true },
    });

    if (!original) {
      throw new NotFoundException('Rekomtek tidak ditemukan');
    }
    if (original.status !== RekomtekStatus.REJECTED) {
      throw new BadRequestException(
        'Ajukan Ulang hanya tersedia untuk rekomtek yang berstatus REJECTED',
      );
    }

    const revisionNumber = original.revisionNumber + 1;
    const nomor = `${original.nomor}-R${revisionNumber}`;
    const duplicate = await this.prisma.rekomtek.findUnique({
      where: { nomor },
    });
    if (duplicate) {
      throw new ConflictException(`Nomor revisi '${nomor}' sudah digunakan`);
    }

    const clonedStorageKeys = new Map<string, string>();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const revision = await tx.rekomtek.create({
          data: {
            nomor,
            judul: original.judul,
            jenis: original.jenis,
            deskripsi: original.deskripsi,
            status: RekomtekStatus.DRAFT,
            jenisPermohonan: original.jenisPermohonan,
            stationId: original.stationId,
            riverId: original.riverId,
            customRiverName: original.customRiverName,
            watershedId: original.watershedId,
            riverRegionId: original.riverRegionId,
            ...(original.analysisData !== null && {
              analysisData: original.analysisData,
            }),
            ...(original.parameters !== null && {
              parameters: original.parameters,
            }),
            fileUrl: null,
            createdBy: original.createdBy,
            createdById: original.createdById ?? user.userId,
            revisionNumber,
            parentRekomtekId: original.id,
            workflowStage: RekomtekWorkflowStage.PEMOHON_DRAFT,
            initialCorrectionCount: 0,
            workflowVersion: 0,
            workflowMigrationRequired: false,
          },
        });

        for (const source of original.berkas) {
          const clonedStorageKey =
            source.sourceType === 'UPLOAD'
              ? (clonedStorageKeys.get(source.id) ?? null)
              : null;
          const carriedSourceType =
            source.sourceType === BerkasSourceType.GOOGLE_DRIVE
              ? BerkasSourceType.GOOGLE_DRIVE
              : null;
          const carriedDriveUrl =
            carriedSourceType === 'GOOGLE_DRIVE' ? source.driveUrl : null;
          const carriedDriveFileId =
            carriedSourceType === 'GOOGLE_DRIVE' ? source.driveFileId : null;
          const carriedDriveResourceKey =
            carriedSourceType === 'GOOGLE_DRIVE'
              ? source.driveResourceKey
              : null;
          const hasSource = Boolean(
            carriedSourceType && (clonedStorageKey || carriedDriveUrl),
          );
          const technicalStatus = hasSource ? 'PENDING_CHECK' : 'INVALID';
          const technicalCode = hasSource
            ? 'CARRIED_FORWARD_RECHECK'
            : 'SOURCE_REQUIRED';
          const technicalMessage = hasSource
            ? 'Sumber dibawa dari versi sebelumnya dan harus divalidasi ulang.'
            : 'Berkas wajib memiliki link Google Drive.';

          const copied = await tx.rekomtekBerkas.create({
            data: {
              rekomtekId: revision.id,
              templateId: source.templateId,
              kode: source.kode,
              nomorUrut: source.nomorUrut,
              uraian: source.uraian,
              isRequired: source.isRequired,
              isComplete: false,
              reviewStatus: 'PENDING',
              technicalStatus,
              technicalCode,
              technicalMessage,
              checkedAt: null,
              sourceVersion: source.sourceVersion + 1,
              sourceType: carriedSourceType,
              driveUrl: carriedDriveUrl,
              driveFileId: carriedDriveFileId,
              driveResourceKey: carriedDriveResourceKey,
              storageKey: clonedStorageKey,
              notes: source.notes,
              revisionNote: source.revisionNote,
              returnedAt: null,
              allowedSourceTypes:
                source.allowedSourceTypes as Prisma.InputJsonValue,
              sensitivity: source.sensitivity,
              accessPolicy: source.accessPolicy,
              ...(source.allowedMimeTypes !== null && {
                allowedMimeTypes: source.allowedMimeTypes,
              }),
              maxFileSize: source.maxFileSize,
              ...(source.allowedExportFormats !== null && {
                allowedExportFormats: source.allowedExportFormats,
              }),
            },
          });

          await tx.rekomtekBerkasLinkHistory.create({
            data: {
              rekomtekBerkasId: copied.id,
              oldDriveUrl: null,
              newDriveUrl: carriedDriveUrl,
              oldSourceType: null,
              newSourceType: carriedSourceType,
              oldStorageKey: null,
              newStorageKey: clonedStorageKey,
              changeReason: 'CARRIED_FORWARD',
              technicalStatus,
              technicalCode,
              changedById: user.userId,
              role: user.role || user.roles?.[0] || 'USER',
            },
          });
        }

        await tx.rekomtekWorkflowEvent.create({
          data: {
            rekomtekId: revision.id,
            fromStage: null,
            toStage: RekomtekWorkflowStage.PEMOHON_DRAFT,
            action: 'BUAT_REVISION_AJUKAN_ULANG',
            actorId: user.userId,
            actorRole: user.role || user.roles?.[0] || 'USER',
            actorPermissions: user.permissions,
            metadata: { parentRekomtekId: original.id, revisionNumber },
          },
        });

        return tx.rekomtek.findUnique({
          where: { id: revision.id },
          include: this.includeClause,
        });
      });
    } catch (error) {
      await Promise.all(
        [...clonedStorageKeys.values()].map((storageKey) =>
          this.berkasService
            .removeUploadForRevision(storageKey)
            .catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  async approve(id: string, reviewedBy: string, user: AuthenticatedUser) {
    const rekomtek = await this.canAccess(user, id);

    if (rekomtek.status !== RekomtekStatus.REVIEW) {
      throw new BadRequestException(
        'Hanya rekomtek dengan status REVIEW yang dapat disetujui',
      );
    }

    const expectedChecklistRevision =
      await this.berkasService.assertReadyForApproval(id);

    const claimed = await this.prisma.rekomtek.updateMany({
      where: {
        id,
        status: RekomtekStatus.REVIEW,
        checklistRevision: expectedChecklistRevision,
      },
      data: {
        status: RekomtekStatus.APPROVED,
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        checklistRevision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Checklist atau status berubah selama approval; ulangi proses',
      );
    }
    return this.prisma.rekomtek.findUnique({
      where: { id },
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

    const claimed = await this.prisma.rekomtek.updateMany({
      where: { id, status: RekomtekStatus.REVIEW },
      data: {
        status: RekomtekStatus.REJECTED,
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        checklistRevision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Status rekomtek berubah; ulangi penolakan');
    }
    return this.prisma.rekomtek.findUnique({
      where: { id },
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

    const claimed = await this.prisma.rekomtek.updateMany({
      where: { id, status: RekomtekStatus.APPROVED },
      data: {
        status: RekomtekStatus.PUBLISHED,
        approvedBy: user.userId,
        approvedAt: new Date(),
        publishedAt: new Date(),
        checklistRevision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Status rekomtek berubah; ulangi publikasi');
    }
    return this.prisma.rekomtek.findUnique({
      where: { id },
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
