import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BerkasTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplates(jenis: string, jenisPermohonan: string) {
    return this.prisma.rekomtekBerkasTemplate.findMany({
      where: {
        jenis,
        jenisPermohonan: jenisPermohonan as any,
      },
      orderBy: [{ nomorUrut: 'asc' }, { kode: 'asc' }],
    });
  }

  async getAllTemplates() {
    return this.prisma.rekomtekBerkasTemplate.findMany({
      orderBy: [
        { jenis: 'asc' },
        { jenisPermohonan: 'asc' },
        { nomorUrut: 'asc' },
        { kode: 'asc' },
      ],
    });
  }
}
