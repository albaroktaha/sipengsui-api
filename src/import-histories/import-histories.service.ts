import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { QueryImportHistoryDto } from './dto/query-import-history.dto';

@Injectable()
export class ImportHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryImportHistoryDto) {
    const where: Prisma.ImportHistoryWhereInput = {};

    if (query.stationId) {
      where.stationId = query.stationId;
    }

    if (query.importType) {
      where.importType = query.importType;
    }

    if (query.filename) {
      where.filename = {
        contains: query.filename,
        mode: Prisma.QueryMode.insensitive,
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate && {
          gte: new Date(query.startDate),
        }),
        ...(query.endDate && {
          lte: new Date(query.endDate),
        }),
      };
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.importHistory.findMany({
        where,

        skip,

        take: query.limit,

        orderBy: {
          createdAt: 'desc',
        },

        include: {
          station: true,
        },
      }),

      this.prisma.importHistory.count({
        where,
      }),
    ]);

    return {
      data: items,

      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const history = await this.prisma.importHistory.findUnique({
      where: {
        id,
      },
      include: {
        station: true,
        observations: true,
        importErrors: true,
      },
    });

    if (!history) {
      throw new NotFoundException('Import History tidak ditemukan');
    }

    return history;
  }

  async findErrors(id: string) {
    const history = await this.prisma.importHistory.findUnique({
      where: {
        id,
      },
    });

    if (!history) {
      throw new NotFoundException('Import History tidak ditemukan');
    }

    const errors = await this.prisma.importError.findMany({
      where: {
        historyId: id,
      },
      orderBy: {
        rowNumber: 'asc',
      },
    });

    return {
      historyId: id,
      totalErrors: errors.length,
      data: errors,
    };
  }

  async remove(id: string) {
    const history = await this.prisma.importHistory.findUnique({
      where: {
        id,
      },
    });

    if (!history) {
      throw new NotFoundException('Import History tidak ditemukan');
    }

    return this.prisma.importHistory.delete({
      where: {
        id,
      },
    });
  }

  async statistics() {
    const [totalImport, arrImport, awlrImport, aggregate, lastImport] =
      await this.prisma.$transaction([
        this.prisma.importHistory.count(),

        this.prisma.importHistory.count({
          where: {
            importType: 'ARR',
          },
        }),

        this.prisma.importHistory.count({
          where: {
            importType: 'AWLR',
          },
        }),

        this.prisma.importHistory.aggregate({
          _sum: {
            totalRows: true,
            successRows: true,
            failedRows: true,
          },
        }),

        this.prisma.importHistory.findFirst({
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            station: true,
          },
        }),
      ]);

    return {
      totalImport,

      totalRows: aggregate._sum.totalRows ?? 0,

      totalSuccessRows: aggregate._sum.successRows ?? 0,

      totalFailedRows: aggregate._sum.failedRows ?? 0,

      arrImport,

      awlrImport,

      lastImport,
    };
  }
}
