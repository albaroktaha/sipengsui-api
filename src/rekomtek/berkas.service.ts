import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBerkasDto, ReturnForRevisionDto } from './dto/berkas.dto';

@Injectable()
export class BerkasService {
  constructor(private readonly prisma: PrismaService) {}

  async getByRekomtekId(rekomtekId: string) {
    const items = await this.prisma.rekomtekBerkas.findMany({
      where: { rekomtekId },
      orderBy: [{ nomorUrut: 'asc' }, { kode: 'asc' }],
    });

    return items;
  }

  async update(rekomtekId: string, berkasId: string, dto: UpdateBerkasDto) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
    });

    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.isComplete !== undefined) {
      updateData.isComplete = dto.isComplete;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    return this.prisma.rekomtekBerkas.update({
      where: { id: berkasId },
      data: updateData,
    });
  }

  async returnForRevision(
    rekomtekId: string,
    berkasId: string,
    dto: ReturnForRevisionDto,
  ) {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
    });

    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    return this.prisma.rekomtekBerkas.update({
      where: { id: berkasId },
      data: {
        isComplete: false,
        revisionNote: dto.revisionNote,
        returnedAt: new Date(),
      },
    });
  }

  async generateFromTemplate(
    rekomtekId: string,
    jenis: string,
    jenisPermohonan: string,
  ) {
    // Ambil template
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

    // Batch create berkas items
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

  async getProgress(rekomtekId: string) {
    const all = await this.prisma.rekomtekBerkas.findMany({
      where: { rekomtekId },
    });

    const total = all.length;
    const completed = all.filter((b) => b.isComplete).length;
    const required = all.filter((b) => b.isRequired).length;
    const completedRequired = all.filter(
      (b) => b.isRequired && b.isComplete,
    ).length;

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
