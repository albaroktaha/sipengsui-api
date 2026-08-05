import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DisasterReportsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    judul: string;
    jenis: string;
    deskripsi: string;
    lokasi?: Record<string, any>;
    severity?: string;
    tanggalKejadian?: string;
    userId?: string | null;
    reporterName?: string;
    reporterPhone?: string;
    attachments?: string[];
  }) {
    return this.prisma.disasterReport.create({
      data: {
        judul: data.judul,
        jenis: data.jenis as any,
        deskripsi: data.deskripsi,
        lokasi: data.lokasi,
        severity: data.severity as any,
        tanggalKejadian: data.tanggalKejadian
          ? new Date(data.tanggalKejadian)
          : new Date(),
        userId: data.userId ?? null,
        reporterName: data.reporterName ?? '',
        reporterPhone: data.reporterPhone ?? '',
        attachments: data.attachments ?? [],
      },
    });
  }

  async findAll(query: {
    status?: string;
    page?: number;
    limit?: number;
    userId?: string;
  }) {
    const { status, page = 1, limit = 10, userId } = query;

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.disasterReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.disasterReport.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    return this.prisma.disasterReport.findUnique({ where: { id } });
  }

  async update(id: string, data: any) {
    return this.prisma.disasterReport.update({ where: { id }, data });
  }

  async submit(id: string) {
    return this.prisma.disasterReport.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });
  }

  async verify(id: string) {
    return this.prisma.disasterReport.update({
      where: { id },
      data: { status: 'VERIFIED' },
    });
  }

  async reject(id: string) {
    return this.prisma.disasterReport.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }
}
