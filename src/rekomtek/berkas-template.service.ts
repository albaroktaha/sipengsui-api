import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JenisPermohonan } from '@prisma/client';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBerkasTemplateDto,
  UpdateBerkasTemplateDto,
} from './dto/berkas.dto';
import { canManageRekomtekChecklistTemplates } from './rekomtek-checklist-access';

@Injectable()
export class BerkasTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManageTemplates(user: AuthenticatedUser) {
    if (!user?.userId || !canManageRekomtekChecklistTemplates(user)) {
      throw new ForbiddenException(
        'Hanya Super Admin atau Kepala Seksi yang dapat mengelola template checklist',
      );
    }
  }

  async getTemplates(jenis: string, jenisPermohonan: JenisPermohonan) {
    return this.prisma.rekomtekBerkasTemplate.findMany({
      where: {
        jenis,
        jenisPermohonan,
        isActive: true,
      },
      orderBy: [{ nomorUrut: 'asc' }, { kode: 'asc' }],
    });
  }

  async getAllTemplates() {
    return this.prisma.rekomtekBerkasTemplate.findMany({
      where: { isActive: true },
      orderBy: [
        { jenis: 'asc' },
        { jenisPermohonan: 'asc' },
        { nomorUrut: 'asc' },
        { kode: 'asc' },
      ],
    });
  }

  async getManagedTemplates(user: AuthenticatedUser) {
    this.assertCanManageTemplates(user);
    return this.getAllTemplates();
  }

  async createTemplate(dto: CreateBerkasTemplateDto, user: AuthenticatedUser) {
    this.assertCanManageTemplates(user);
    const data = {
      ...dto,
      kode: dto.kode.trim(),
      uraian: dto.uraian.trim(),
    };
    if (!data.kode || !data.uraian) {
      throw new BadRequestException('Kode dan uraian checklist wajib diisi');
    }
    const existing = await this.prisma.rekomtekBerkasTemplate.findUnique({
      where: {
        jenis_jenisPermohonan_kode: {
          jenis: dto.jenis,
          jenisPermohonan: dto.jenisPermohonan,
          kode: data.kode,
        },
      },
      select: { id: true, isActive: true },
    });

    if (existing?.isActive) {
      throw new ConflictException(
        `Kode checklist ${data.kode} sudah digunakan untuk kategori tersebut`,
      );
    }

    if (existing) {
      return this.prisma.rekomtekBerkasTemplate.update({
        where: { id: existing.id },
        data: { ...data, isActive: true },
      });
    }

    return this.prisma.rekomtekBerkasTemplate.create({ data });
  }

  async updateTemplate(
    id: string,
    dto: UpdateBerkasTemplateDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanManageTemplates(user);
    const data = {
      ...(dto.kode !== undefined ? { kode: dto.kode.trim() } : {}),
      ...(dto.nomorUrut !== undefined ? { nomorUrut: dto.nomorUrut } : {}),
      ...(dto.uraian !== undefined ? { uraian: dto.uraian.trim() } : {}),
      ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
      ...(dto.hasSubItems !== undefined
        ? { hasSubItems: dto.hasSubItems }
        : {}),
    };
    if (data.kode === '' || data.uraian === '') {
      throw new BadRequestException(
        'Kode dan uraian checklist tidak boleh kosong',
      );
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Tidak ada perubahan template checklist');
    }

    const existing = await this.prisma.rekomtekBerkasTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        jenis: true,
        jenisPermohonan: true,
        kode: true,
        isActive: true,
      },
    });
    if (!existing?.isActive) {
      throw new NotFoundException('Template checklist aktif tidak ditemukan');
    }

    const nextKode = data.kode ?? existing.kode;
    if (nextKode !== existing.kode) {
      const duplicate = await this.prisma.rekomtekBerkasTemplate.findUnique({
        where: {
          jenis_jenisPermohonan_kode: {
            jenis: existing.jenis,
            jenisPermohonan: existing.jenisPermohonan,
            kode: nextKode,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Kode checklist ${nextKode} sudah digunakan untuk kategori tersebut`,
        );
      }
    }

    return this.prisma.rekomtekBerkasTemplate.update({
      where: { id },
      data,
    });
  }

  async archiveTemplate(id: string, user: AuthenticatedUser) {
    this.assertCanManageTemplates(user);
    const result = await this.prisma.rekomtekBerkasTemplate.updateMany({
      where: { id, isActive: true },
      data: { isActive: false },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Template checklist aktif tidak ditemukan');
    }
    return { id, isActive: false };
  }
}
