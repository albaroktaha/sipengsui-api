import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BerkasReviewStatus,
  BerkasSourceType,
  BerkasTechnicalStatus,
  JenisPermohonan,
  Prisma,
  RekomtekReviewType,
  RekomtekStatus,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  BerkasQueryDto,
  ReturnForRevisionDto,
  UpdateBerkasDto,
} from './dto/berkas.dto';
import { getPrimaryRole, isRekomtekStaff } from './rekomtek-access.util';
import {
  DriveAccessValidator,
  type DriveValidationPolicy,
  type DriveValidationResult,
} from './drive-access.service';
import { parseGoogleDriveResource } from './drive-resource.util';
import { BerkasFileStorageService } from './berkas-file-storage.service';

export interface BerkasProgress {
  total: number;
  completed: number;
  required: number;
  completedRequired: number;
  progress: number;
  progressRequired: number;
  validRequired: number;
  pendingRequired: number;
  invalidRequired: number;
}

export interface BerkasSubmissionValidation {
  issues: Array<{
    id: string;
    kode: string;
    uraian: string;
    status: BerkasTechnicalStatus;
    code: string;
    message: string;
  }>;
  incomplete: Array<{ id: string; kode: string; uraian: string }>;
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
  reviewStatus: true,
  technicalStatus: true,
  technicalCode: true,
  technicalMessage: true,
  checkedAt: true,
  sourceVersion: true,
  sourceType: true,
  driveUrl: true,
  driveFileId: true,
  driveResourceKey: true,
  allowedSourceTypes: true,
  sensitivity: true,
  accessPolicy: true,
  allowedMimeTypes: true,
  maxFileSize: true,
  allowedExportFormats: true,
  notes: true,
  revisionNote: true,
  returnedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RekomtekBerkasSelect;

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function drivePolicyFor(item: {
  allowedMimeTypes?: Prisma.JsonValue | null;
  maxFileSize?: number | null;
  allowedExportFormats?: Prisma.JsonValue | null;
}): DriveValidationPolicy {
  return {
    allowedMimeTypes: jsonStringArray(item.allowedMimeTypes),
    maxFileSize: item.maxFileSize,
    allowedExportFormats: jsonStringArray(item.allowedExportFormats),
  };
}

function sourceRequiredResult(): DriveValidationResult {
  return {
    status: 'INVALID',
    code: 'SOURCE_REQUIRED',
    message: 'Berkas wajib memiliki link Google Drive.',
  };
}

function missingFileResult(): DriveValidationResult {
  return {
    status: 'INVALID',
    code: 'FILE_NOT_FOUND',
    message: 'File persyaratan tidak ditemukan di storage aplikasi.',
  };
}

@Injectable()
export class BerkasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driveValidator: DriveAccessValidator = new DriveAccessValidator(),
    private readonly fileStorage: BerkasFileStorageService = new BerkasFileStorageService(),
  ) {}

  async getByRekomtekId(
    rekomtekId: string,
    query: BerkasQueryDto = new BerkasQueryDto(),
  ) {
    const where: Prisma.RekomtekBerkasWhereInput = { rekomtekId };

    if (query.status === 'COMPLETE') {
      where.AND = [
        { isComplete: true },
        { technicalStatus: BerkasTechnicalStatus.VALID },
      ];
    } else if (query.status === 'INCOMPLETE') {
      where.AND = [
        {
          OR: [
            { isComplete: false },
            { technicalStatus: { not: BerkasTechnicalStatus.VALID } },
          ],
        },
      ];
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
        sourceType: true,
        driveUrl: true,
        driveFileId: true,
        driveResourceKey: true,
        storageKey: true,
        technicalStatus: true,
        sourceVersion: true,
        allowedSourceTypes: true,
        sensitivity: true,
        accessPolicy: true,
        allowedMimeTypes: true,
        maxFileSize: true,
        allowedExportFormats: true,
        rekomtek: {
          select: {
            status: true,
            workflowStage: true,
            createdById: true,
            sourceRevision: true,
            checklistRevision: true,
          },
        },
      },
    });

    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    const staff = isRekomtekStaff(user);
    if (!staff) {
      if (berkas.rekomtek.createdById !== user.userId) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses mengubah berkas ini',
        );
      }
      if (berkas.rekomtek.status !== RekomtekStatus.DRAFT) {
        throw new ForbiddenException(
          'Link hanya dapat diubah saat permohonan masih DRAFT; gunakan Ajukan Ulang untuk revision baru',
        );
      }
      await this.assertCorrectionItemEditable(
        berkas.id,
        berkas.rekomtek.workflowStage,
        user,
      );
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
      throw new BadRequestException(
        'Berkas tidak dapat diubah setelah rekomtek disetujui atau diterbitkan',
      );
    } else if (berkas.rekomtek.status === RekomtekStatus.REJECTED) {
      throw new ForbiddenException(
        'Record REJECTED immutable; gunakan Ajukan Ulang untuk revision baru',
      );
    }

    const requestsSourceMutation =
      dto.driveUrl !== undefined || dto.sourceType !== undefined;
    if (
      requestsSourceMutation &&
      berkas.rekomtek.status !== RekomtekStatus.DRAFT
    ) {
      throw new ForbiddenException(
        'Sumber berkas hanya dapat diubah saat DRAFT; gunakan Ajukan Ulang untuk revision baru',
      );
    }

    if (dto.sourceType === BerkasSourceType.UPLOAD) {
      throw new BadRequestException(
        'Upload privat untuk Berkas Persyaratan sudah dinonaktifkan; gunakan link Google Drive',
      );
    }

    const normalizedDriveUrl =
      dto.driveUrl === undefined ? undefined : dto.driveUrl?.trim() || null;

    let nextSourceType = berkas.sourceType;
    let nextDriveUrl = berkas.driveUrl;
    let nextStorageKey = berkas.storageKey;
    let validationResult: DriveValidationResult | undefined;

    if (normalizedDriveUrl !== undefined) {
      this.assertSourceAllowed(berkas, BerkasSourceType.GOOGLE_DRIVE);
      nextDriveUrl = normalizedDriveUrl;
      nextStorageKey = null;
      nextSourceType = normalizedDriveUrl
        ? BerkasSourceType.GOOGLE_DRIVE
        : null;
      validationResult = normalizedDriveUrl
        ? await this.driveValidator.validate(
            normalizedDriveUrl,
            drivePolicyFor(berkas),
          )
        : sourceRequiredResult();
    } else if (
      dto.sourceType === BerkasSourceType.GOOGLE_DRIVE &&
      berkas.sourceType !== BerkasSourceType.GOOGLE_DRIVE
    ) {
      throw new BadRequestException(
        'Link Google Drive wajib diisi ketika sumber GOOGLE_DRIVE dipilih',
      );
    }

    const sourceChanged =
      nextSourceType !== berkas.sourceType ||
      nextDriveUrl !== berkas.driveUrl ||
      nextStorageKey !== berkas.storageKey;
    const updateData: Prisma.RekomtekBerkasUpdateInput = {};

    if (sourceChanged) {
      updateData.sourceType = nextSourceType;
      updateData.driveUrl = nextDriveUrl;
      const parsedDrive = parseGoogleDriveResource(nextDriveUrl);
      updateData.driveFileId = parsedDrive?.fileId ?? null;
      updateData.driveResourceKey = parsedDrive?.resourceKey ?? null;
      updateData.storageKey = nextStorageKey;
      if (validationResult) {
        updateData.technicalStatus = validationResult.status;
        updateData.technicalCode = validationResult.code;
        updateData.technicalMessage = validationResult.message;
        updateData.checkedAt = new Date();
      } else {
        updateData.technicalStatus = BerkasTechnicalStatus.PENDING_CHECK;
        updateData.technicalCode = 'SOURCE_CHANGED';
        updateData.technicalMessage =
          'Sumber berubah dan menunggu pemeriksaan ulang.';
        updateData.checkedAt = null;
      }
      updateData.reviewStatus = BerkasReviewStatus.PENDING;
      updateData.isComplete = false;
      updateData.sourceVersion = { increment: 1 };
      updateData.revisionNote = null;
      updateData.returnedAt = null;
    }

    if (dto.isComplete !== undefined) {
      const effectiveTechnicalStatus =
        validationResult?.status ??
        berkas.technicalStatus ??
        (berkas.driveUrl
          ? BerkasTechnicalStatus.VALID
          : BerkasTechnicalStatus.INVALID);
      if (
        dto.isComplete &&
        effectiveTechnicalStatus !== BerkasTechnicalStatus.VALID
      ) {
        throw new BadRequestException(
          'Berkas harus lolos validasi teknis sebelum diverifikasi',
        );
      }
      updateData.isComplete = dto.isComplete;
      updateData.reviewStatus = dto.isComplete
        ? BerkasReviewStatus.VERIFIED
        : BerkasReviewStatus.PENDING;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    return this.prisma.$transaction(async (tx) => {
      if (sourceChanged) {
        const parentClaim = await tx.rekomtek.updateMany({
          where: {
            id: rekomtekId,
            status: RekomtekStatus.DRAFT,
          },
          data: {
            sourceRevision: { increment: 1 },
            checklistRevision: { increment: 1 },
          },
        });
        if (parentClaim.count !== 1) {
          throw new ConflictException(
            'Sumber berkas berubah bersamaan; ulangi operasi pada data terbaru',
          );
        }
      }

      const itemClaim = await tx.rekomtekBerkas.updateMany({
        where: { id: berkasId, sourceVersion: berkas.sourceVersion },
        data: updateData,
      });
      if (itemClaim.count !== 1) {
        throw new ConflictException(
          'Berkas berubah bersamaan; ulangi operasi pada data terbaru',
        );
      }

      if (sourceChanged) {
        await tx.rekomtekBerkasLinkHistory.create({
          data: {
            rekomtekBerkasId: berkasId,
            oldDriveUrl: berkas.driveUrl,
            newDriveUrl: nextDriveUrl,
            oldSourceType: berkas.sourceType,
            newSourceType: nextSourceType,
            oldStorageKey: berkas.storageKey,
            newStorageKey: nextStorageKey,
            changeReason: 'SOURCE_UPDATED',
            technicalStatus: validationResult?.status,
            technicalCode: validationResult?.code,
            changedById: user.userId,
            role: getPrimaryRole(user),
          },
        });
      } else {
        const checklistClaim = await tx.rekomtek.updateMany({
          where: {
            id: rekomtekId,
            status: berkas.rekomtek.status,
            checklistRevision: berkas.rekomtek.checklistRevision,
          },
          data: { checklistRevision: { increment: 1 } },
        });
        if (checklistClaim.count !== 1) {
          throw new ConflictException(
            'Checklist berubah bersamaan; ulangi operasi pada data terbaru',
          );
        }
      }

      return tx.rekomtekBerkas.findUnique({
        where: { id: berkasId },
        select: berkasSelect,
      });
    });
  }

  async getFileForReviewer(
    rekomtekId: string,
    berkasId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
      select: {
        storageKey: true,
        sourceType: true,
        technicalStatus: true,
      },
    });
    if (!berkas?.storageKey || berkas.sourceType !== BerkasSourceType.UPLOAD) {
      throw new NotFoundException('File upload tidak ditemukan');
    }
    if (!berkas.storageKey.startsWith('active/')) {
      throw new ForbiddenException(
        'File upload masih berada di quarantine dan belum dapat diakses',
      );
    }
    if (berkas.technicalStatus !== BerkasTechnicalStatus.VALID) {
      throw new ForbiddenException(
        'File upload belum lolos pemeriksaan teknis dan belum dapat diunduh',
      );
    }
    return this.fileStorage.getFile(berkas.storageKey);
  }

  async cloneUploadForRevision(storageKey: string): Promise<string | null> {
    return this.fileStorage.cloneForRevision(storageKey);
  }

  async removeUploadForRevision(storageKey: string): Promise<void> {
    return this.fileStorage.remove(storageKey);
  }

  async returnForRevision(
    rekomtekId: string,
    berkasId: string,
    dto: ReturnForRevisionDto,
    user: AuthenticatedUser,
  ) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
      select: {
        id: true,
        sourceType: true,
        driveUrl: true,
        driveFileId: true,
        driveResourceKey: true,
        storageKey: true,
        rekomtek: { select: { status: true } },
      },
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
      const parentClaim = await tx.rekomtek.updateMany({
        where: { id: rekomtekId, status: RekomtekStatus.REVIEW },
        data: {
          status: RekomtekStatus.REJECTED,
          reviewedBy: user.userId,
          reviewedAt: new Date(),
          checklistRevision: { increment: 1 },
        },
      });
      if (parentClaim.count !== 1) {
        throw new ConflictException(
          'Status rekomtek berubah; ulangi pengembalian untuk revisi',
        );
      }

      const updated = await tx.rekomtekBerkas.update({
        where: { id: berkasId },
        data: {
          isComplete: false,
          reviewStatus: BerkasReviewStatus.NEEDS_CORRECTION,
          revisionNote: dto.revisionNote,
          returnedAt: new Date(),
        },
        select: berkasSelect,
      });

      await tx.rekomtekBerkasLinkHistory.create({
        data: {
          rekomtekBerkasId: berkasId,
          oldDriveUrl: berkas.driveUrl,
          newDriveUrl: berkas.driveUrl,
          oldSourceType: berkas.sourceType,
          newSourceType: berkas.sourceType,
          oldStorageKey: berkas.storageKey,
          newStorageKey: berkas.storageKey,
          changeReason: 'REVIEWER_CORRECTION_REQUIRED',
          changedById: user.userId,
          role: getPrimaryRole(user),
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
        jenisPermohonan: jenisPermohonan as JenisPermohonan,
      },
      orderBy: [{ nomorUrut: 'asc' }, { kode: 'asc' }],
    });

    if (templates.length === 0) {
      throw new BadRequestException(
        `Template checklist belum tersedia untuk ${jenis} / ${jenisPermohonan}`,
      );
    }

    const items = templates.map((template) => ({
      rekomtekId,
      templateId: template.id,
      kode: template.kode,
      nomorUrut: template.nomorUrut,
      uraian: template.uraian,
      isRequired: template.isRequired,
      isComplete: false,
      allowedSourceTypes: template.allowedSourceTypes as Prisma.InputJsonValue,
      sensitivity: template.sensitivity,
      accessPolicy: template.accessPolicy,
      allowedMimeTypes: template.allowedMimeTypes as
        Prisma.InputJsonValue | undefined,
      maxFileSize: template.maxFileSize,
      allowedExportFormats: template.allowedExportFormats as
        Prisma.InputJsonValue | undefined,
    }));

    await this.prisma.rekomtekBerkas.createMany({ data: items });
    return items.length;
  }

  async revalidateItem(rekomtekId: string, berkasId: string) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
      select: {
        id: true,
        sourceType: true,
        driveUrl: true,
        driveFileId: true,
        driveResourceKey: true,
        storageKey: true,
        sourceVersion: true,
        technicalStatus: true,
        technicalCode: true,
        technicalMessage: true,
        isComplete: true,
        allowedSourceTypes: true,
        sensitivity: true,
        accessPolicy: true,
        allowedMimeTypes: true,
        maxFileSize: true,
        allowedExportFormats: true,
        rekomtek: {
          select: {
            status: true,
            checklistRevision: true,
          },
        },
      },
    });
    if (!berkas) throw new NotFoundException('Berkas tidak ditemukan');

    const result = await this.validateSource(berkas);
    const parsedDrive = parseGoogleDriveResource(berkas.driveUrl);
    const updateData: Prisma.RekomtekBerkasUpdateInput = {
      technicalStatus: result.status,
      technicalCode: result.code,
      technicalMessage: result.message,
      driveFileId: parsedDrive?.fileId ?? null,
      driveResourceKey: parsedDrive?.resourceKey ?? null,
      ...(result.storageKey ? { storageKey: result.storageKey } : {}),
      checkedAt: new Date(),
      ...(result.status !== 'VALID'
        ? {
            isComplete: false,
            reviewStatus: BerkasReviewStatus.NEEDS_CORRECTION,
          }
        : {}),
    };
    const claimed = await this.prisma.$transaction(async (tx) => {
      const parentClaim = await tx.rekomtek.updateMany({
        where: {
          id: rekomtekId,
          status: {
            in: [RekomtekStatus.DRAFT, RekomtekStatus.REVIEW],
          },
          checklistRevision: berkas.rekomtek.checklistRevision,
        },
        data: { checklistRevision: { increment: 1 } },
      });
      if (parentClaim.count !== 1) return 0;
      const itemClaim = await tx.rekomtekBerkas.updateMany({
        where: { id: berkasId, sourceVersion: berkas.sourceVersion },
        data: updateData,
      });
      return itemClaim.count;
    });
    if (claimed !== 1) {
      if (
        result.storageKey &&
        result.storageKey !== berkas.storageKey &&
        (await this.fileStorage.exists(result.storageKey))
      ) {
        await this.fileStorage.remove(result.storageKey);
      }
      throw new ConflictException(
        'Berkas berubah bersamaan; ulangi validasi pada data terbaru',
      );
    }
    return this.prisma.rekomtekBerkas.findUnique({
      where: { id: berkasId },
      select: berkasSelect,
    });
  }

  async revalidateRequired(
    rekomtekId: string,
    includeFilledOptional = false,
  ): Promise<BerkasSubmissionValidation> {
    const parent = await this.prisma.rekomtek.findUnique({
      where: { id: rekomtekId },
      select: { status: true, checklistRevision: true },
    });
    if (!parent) throw new NotFoundException('Rekomtek tidak ditemukan');
    if (
      parent.status !== RekomtekStatus.DRAFT &&
      parent.status !== RekomtekStatus.REVIEW
    ) {
      throw new BadRequestException(
        'Checklist hanya dapat divalidasi saat DRAFT atau REVIEW',
      );
    }

    const requiredBerkas = await this.prisma.rekomtekBerkas.findMany({
      where: includeFilledOptional
        ? {
            rekomtekId,
            OR: [
              { isRequired: true },
              { isRequired: false, sourceType: { not: null } },
            ],
          }
        : { rekomtekId, isRequired: true },
      select: {
        id: true,
        kode: true,
        uraian: true,
        isComplete: true,
        reviewStatus: true,
        sourceType: true,
        driveUrl: true,
        driveFileId: true,
        driveResourceKey: true,
        storageKey: true,
        sourceVersion: true,
        technicalStatus: true,
        technicalCode: true,
        technicalMessage: true,
        allowedSourceTypes: true,
        sensitivity: true,
        accessPolicy: true,
        allowedMimeTypes: true,
        maxFileSize: true,
        allowedExportFormats: true,
      },
    });

    const validated: Array<{
      berkas: (typeof requiredBerkas)[number];
      result: DriveValidationResult;
      updateData: Prisma.RekomtekBerkasUpdateInput;
    }> = [];

    for (const berkas of requiredBerkas) {
      const result = await this.validateSource(berkas);
      const parsedDrive = parseGoogleDriveResource(berkas.driveUrl);
      validated.push({
        berkas,
        result,
        updateData: {
          technicalStatus: result.status,
          technicalCode: result.code,
          technicalMessage: result.message,
          driveFileId: parsedDrive?.fileId ?? null,
          driveResourceKey: parsedDrive?.resourceKey ?? null,
          ...(result.storageKey ? { storageKey: result.storageKey } : {}),
          checkedAt: new Date(),
          ...(result.status !== 'VALID'
            ? {
                isComplete: false,
                reviewStatus: BerkasReviewStatus.NEEDS_CORRECTION,
              }
            : {}),
        },
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const parentClaim = await tx.rekomtek.updateMany({
          where: {
            id: rekomtekId,
            status: parent.status,
            checklistRevision: parent.checklistRevision,
          },
          data: { checklistRevision: { increment: 1 } },
        });
        if (parentClaim.count !== 1) {
          throw new ConflictException(
            'Checklist berubah bersamaan; ulangi validasi pada data terbaru',
          );
        }

        for (const item of validated) {
          const itemClaim = await tx.rekomtekBerkas.updateMany({
            where: {
              id: item.berkas.id,
              sourceVersion: item.berkas.sourceVersion,
            },
            data: item.updateData,
          });
          if (itemClaim.count !== 1) {
            throw new ConflictException(
              'Sumber berkas berubah bersamaan; ulangi validasi pada data terbaru',
            );
          }
        }
      });
    } catch (error) {
      await Promise.all(
        validated.map(async ({ berkas, result }) => {
          if (
            result.storageKey &&
            result.storageKey !== berkas.storageKey &&
            (await this.fileStorage.exists(result.storageKey))
          ) {
            await this.fileStorage.remove(result.storageKey);
          }
        }),
      );
      throw error;
    }

    const issues: BerkasSubmissionValidation['issues'] = [];
    const incomplete: BerkasSubmissionValidation['incomplete'] = [];
    for (const { berkas, result } of validated) {
      if (result.status !== 'VALID') {
        issues.push({
          id: berkas.id,
          kode: berkas.kode,
          uraian: berkas.uraian,
          status: result.status,
          code: result.code,
          message: result.message,
        });
      }
      if (
        !berkas.isComplete ||
        berkas.reviewStatus !== BerkasReviewStatus.VERIFIED ||
        result.status !== 'VALID'
      ) {
        incomplete.push({
          id: berkas.id,
          kode: berkas.kode,
          uraian: berkas.uraian,
        });
      }
    }

    return { issues, incomplete };
  }

  async assertReadyForApproval(rekomtekId: string): Promise<number> {
    const validation = await this.revalidateRequired(rekomtekId);
    if (validation.issues.length > 0 || validation.incomplete.length > 0) {
      throw new BadRequestException({
        message:
          'Semua berkas wajib harus valid dan diverifikasi sebelum disetujui',
        berkasIssues: validation.issues,
        incompleteBerkas: validation.incomplete,
      });
    }
    const current = await this.prisma.rekomtek.findUnique({
      where: { id: rekomtekId },
      select: { status: true, checklistRevision: true },
    });
    if (!current || current.status !== RekomtekStatus.REVIEW) {
      throw new ConflictException(
        'Status rekomtek berubah selama pemeriksaan; ulangi proses approval',
      );
    }
    return current.checklistRevision;
  }

  async getProgress(rekomtekId: string): Promise<BerkasProgress> {
    const [
      total,
      completed,
      required,
      completedRequired,
      validRequired,
      pendingRequired,
      invalidRequired,
    ] = await this.prisma.$transaction([
      this.prisma.rekomtekBerkas.count({ where: { rekomtekId } }),
      this.prisma.rekomtekBerkas.count({
        where: {
          rekomtekId,
          isComplete: true,
          technicalStatus: BerkasTechnicalStatus.VALID,
        },
      }),
      this.prisma.rekomtekBerkas.count({
        where: { rekomtekId, isRequired: true },
      }),
      this.prisma.rekomtekBerkas.count({
        where: {
          rekomtekId,
          isRequired: true,
          isComplete: true,
          technicalStatus: BerkasTechnicalStatus.VALID,
        },
      }),
      this.prisma.rekomtekBerkas.count({
        where: {
          rekomtekId,
          isRequired: true,
          technicalStatus: BerkasTechnicalStatus.VALID,
        },
      }),
      this.prisma.rekomtekBerkas.count({
        where: {
          rekomtekId,
          isRequired: true,
          technicalStatus: BerkasTechnicalStatus.PENDING_CHECK,
        },
      }),
      this.prisma.rekomtekBerkas.count({
        where: {
          rekomtekId,
          isRequired: true,
          technicalStatus: BerkasTechnicalStatus.INVALID,
        },
      }),
    ]);

    return this.toProgress(
      total,
      completed,
      required,
      completedRequired,
      validRequired,
      pendingRequired,
      invalidRequired,
    );
  }

  async getProgressForRekomtekIds(
    rekomtekIds: string[],
  ): Promise<Record<string, BerkasProgress>> {
    if (rekomtekIds.length === 0) return {};

    const rows = await this.prisma.rekomtekBerkas.findMany({
      where: { rekomtekId: { in: rekomtekIds } },
      select: {
        rekomtekId: true,
        isComplete: true,
        isRequired: true,
        technicalStatus: true,
      },
    });
    const grouped = new Map<
      string,
      {
        total: number;
        completed: number;
        required: number;
        completedRequired: number;
        validRequired: number;
        pendingRequired: number;
        invalidRequired: number;
      }
    >();

    for (const row of rows) {
      const current = grouped.get(row.rekomtekId) ?? {
        total: 0,
        completed: 0,
        required: 0,
        completedRequired: 0,
        validRequired: 0,
        pendingRequired: 0,
        invalidRequired: 0,
      };
      current.total += 1;
      if (row.isComplete && row.technicalStatus === BerkasTechnicalStatus.VALID)
        current.completed += 1;
      if (row.isRequired) current.required += 1;
      if (
        row.isRequired &&
        row.isComplete &&
        row.technicalStatus === BerkasTechnicalStatus.VALID
      )
        current.completedRequired += 1;
      if (row.isRequired && row.technicalStatus === BerkasTechnicalStatus.VALID)
        current.validRequired += 1;
      if (
        row.isRequired &&
        row.technicalStatus === BerkasTechnicalStatus.PENDING_CHECK
      )
        current.pendingRequired += 1;
      if (
        row.isRequired &&
        row.technicalStatus === BerkasTechnicalStatus.INVALID
      )
        current.invalidRequired += 1;
      grouped.set(row.rekomtekId, current);
    }

    return Object.fromEntries(
      rekomtekIds.map((id) => {
        const current = grouped.get(id) ?? {
          total: 0,
          completed: 0,
          required: 0,
          completedRequired: 0,
          validRequired: 0,
          pendingRequired: 0,
          invalidRequired: 0,
        };
        return [
          id,
          this.toProgress(
            current.total,
            current.completed,
            current.required,
            current.completedRequired,
            current.validRequired,
            current.pendingRequired,
            current.invalidRequired,
          ),
        ];
      }),
    );
  }

  private async validateSource(berkas: {
    sourceType: BerkasSourceType | null;
    driveUrl: string | null;
    storageKey: string | null;
    technicalStatus: BerkasTechnicalStatus;
    technicalCode: string | null;
    technicalMessage: string | null;
    allowedSourceTypes: Prisma.JsonValue | null;
    sensitivity: string;
    accessPolicy: string;
    allowedMimeTypes: Prisma.JsonValue | null;
    maxFileSize: number | null;
    allowedExportFormats: Prisma.JsonValue | null;
  }): Promise<DriveValidationResult> {
    const policyIssue = this.sourcePolicyResult(berkas);
    if (policyIssue) return policyIssue;

    if (
      berkas.sourceType === BerkasSourceType.GOOGLE_DRIVE &&
      berkas.driveUrl
    ) {
      return this.driveValidator.validate(
        berkas.driveUrl,
        drivePolicyFor(berkas),
      );
    }
    if (berkas.sourceType === BerkasSourceType.UPLOAD && berkas.storageKey) {
      const stored = await this.fileStorage.revalidate(berkas.storageKey);
      if (
        stored.technicalStatus === 'INVALID' &&
        stored.technicalCode === 'FILE_NOT_FOUND'
      ) {
        return missingFileResult();
      }
      return {
        status: stored.technicalStatus,
        code: stored.technicalCode,
        message: stored.technicalMessage,
        storageKey: stored.storageKey,
      };
    }
    return sourceRequiredResult();
  }

  private sourcePolicyResult(berkas: {
    sourceType: BerkasSourceType | null;
    allowedSourceTypes: Prisma.JsonValue | null;
    sensitivity?: string | null;
    accessPolicy?: string | null;
  }): DriveValidationResult | null {
    if (!berkas.sourceType) return null;

    const allowedSources = jsonStringArray(berkas.allowedSourceTypes);
    if (allowedSources.length === 0) {
      return {
        status: 'INVALID',
        code: 'SOURCE_POLICY_MISCONFIGURED',
        message: 'Kebijakan sumber persyaratan belum dikonfigurasi.',
      };
    }
    if (berkas.sourceType === BerkasSourceType.UPLOAD) {
      return {
        status: 'INVALID',
        code: 'PRIVATE_UPLOAD_DISABLED',
        message:
          'Upload privat untuk Berkas Persyaratan sudah dinonaktifkan; gunakan link Google Drive.',
      };
    }
    if (
      allowedSources.length !== 1 ||
      allowedSources[0] !== BerkasSourceType.GOOGLE_DRIVE ||
      berkas.accessPolicy !== 'DRIVE_PUBLIC_ONLY'
    ) {
      return {
        status: 'INVALID',
        code: 'SOURCE_POLICY_MISCONFIGURED',
        message: 'Berkas Persyaratan hanya menerima link Google Drive.',
      };
    }
    if (!allowedSources.includes(berkas.sourceType)) {
      return {
        status: 'INVALID',
        code: 'SOURCE_TYPE_NOT_ALLOWED',
        message: 'Link Google Drive tidak diizinkan untuk persyaratan ini.',
      };
    }
    return null;
  }

  private assertSourceAllowed(
    berkas: {
      sourceType: BerkasSourceType | null;
      allowedSourceTypes: Prisma.JsonValue | null;
      sensitivity?: string | null;
      accessPolicy?: string | null;
    },
    sourceType: BerkasSourceType,
  ): void {
    const issue = this.sourcePolicyResult({ ...berkas, sourceType });
    if (issue) throw new BadRequestException(issue.message);
  }

  private async assertCorrectionItemEditable(
    berkasId: string,
    workflowStage: RekomtekWorkflowStage | null,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (isRekomtekStaff(user)) return;
    const reviewType =
      workflowStage === RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON
        ? RekomtekReviewType.EVALUASI_AWAL
        : workflowStage === RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE
          ? RekomtekReviewType.PASCA_EKSPOSE
          : null;
    if (!reviewType) return;

    const finding = await this.prisma.rekomtekReviewFinding.findFirst({
      where: {
        rekomtekBerkasId: berkasId,
        reviewRound: { type: reviewType },
        status: { in: ['TERBUKA', 'TERJAWAB'] },
      },
      select: { id: true },
    });
    if (!finding) {
      throw new ForbiddenException(
        'Pemohon hanya dapat mengganti Berkas Persyaratan yang dibuka untuk koreksi',
      );
    }
  }

  private assertCanEditSource(
    berkas: {
      id: string;
      sourceVersion: number;
      rekomtek: {
        status: RekomtekStatus;
        workflowStage: RekomtekWorkflowStage | null;
        createdById: string | null;
        sourceRevision: number;
      };
    } | null,
    user: AuthenticatedUser,
  ): asserts berkas is {
    id: string;
    sourceType: BerkasSourceType | null;
    driveUrl: string | null;
    storageKey: string | null;
    sourceVersion: number;
    allowedSourceTypes: Prisma.JsonValue | null;
    sensitivity: string;
    accessPolicy: string;
    allowedMimeTypes: Prisma.JsonValue | null;
    maxFileSize: number | null;
    rekomtek: {
      status: RekomtekStatus;
      workflowStage: RekomtekWorkflowStage | null;
      createdById: string | null;
      sourceRevision: number;
      checklistRevision: number;
    };
  } {
    if (!berkas) throw new NotFoundException('Berkas tidak ditemukan');
    const staff = isRekomtekStaff(user);
    if (!staff && berkas.rekomtek.createdById !== user.userId) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses mengubah berkas ini',
      );
    }
    if (!staff && berkas.rekomtek.status !== RekomtekStatus.DRAFT) {
      throw new ForbiddenException(
        'File hanya dapat diubah saat permohonan masih DRAFT; gunakan Ajukan Ulang untuk revision baru',
      );
    }
    if (berkas.rekomtek.status !== RekomtekStatus.DRAFT) {
      throw new ForbiddenException(
        'File hanya dapat diubah saat DRAFT; gunakan Ajukan Ulang untuk revision baru',
      );
    }
  }

  private toProgress(
    total: number,
    completed: number,
    required: number,
    completedRequired: number,
    validRequired = 0,
    pendingRequired = 0,
    invalidRequired = 0,
  ): BerkasProgress {
    return {
      total,
      completed,
      required,
      completedRequired,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      progressRequired:
        required > 0 ? Math.round((completedRequired / required) * 100) : 0,
      validRequired,
      pendingRequired,
      invalidRequired,
    };
  }
}
