import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateObservationDto } from './dto/create-observation.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';
import { QueryObservationDto } from './dto/query-observation.dto';

@Injectable()
export class ObservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateObservationDto) {
    const station = await this.prisma.station.findUnique({
      where: {
        id: dto.stationId,
      },
    });

    if (!station) {
      throw new NotFoundException('Station tidak ditemukan');
    }

    return this.prisma.observation.create({
      data: {
        stationId: dto.stationId,
        observationDate: new Date(dto.observationDate),
        rainfall: dto.rainfall,
        waterLevel: dto.waterLevel,
        discharge: dto.discharge,
        note: dto.note,
      },
      include: {
        station: true,
      },
    });
  }

  async findAll() {
    return this.prisma.observation.findMany({
      include: {
        station: true,
      },
      orderBy: {
        observationDate: 'desc',
      },
    });
  }

  async paginate(query: QueryObservationDto) {
    const where: Prisma.ObservationWhereInput = {};

    if (query.stationId) {
      where.stationId = query.stationId;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.startDate || query.endDate) {
      where.observationDate = {
        ...(query.startDate && {
          gte: new Date(query.startDate),
        }),
        ...(query.endDate && {
          lte: new Date(query.endDate),
        }),
      };
    }

    if (query.keyword) {
      where.OR = [
        {
          note: {
            contains: query.keyword,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          observerName: {
            contains: query.keyword,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.observation.findMany({
        where,
        include: {
          station: {
            include: {
              river: true,
              watershed: true,
            },
          },
        },
        orderBy: {
          observationDate: 'desc',
        },
        skip,
        take: query.limit,
      }),

      this.prisma.observation.count({
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
    const observation = await this.prisma.observation.findUnique({
      where: {
        id,
      },
      include: {
        station: {
          include: {
            river: true,
            watershed: true,
          },
        },
        importHistory: true,
      },
    });

    if (!observation) {
      throw new NotFoundException('Observation tidak ditemukan');
    }

    return observation;
  }

  async findByStation(stationId: string) {
    return this.prisma.observation.findMany({
      where: {
        stationId,
      },
      include: {
        station: true,
      },
      orderBy: {
        observationDate: 'desc',
      },
    });
  }

  async latest() {
    return this.prisma.observation.findMany({
      take: 20,
      include: {
        station: true,
      },
      orderBy: {
        observationDate: 'desc',
      },
    });
  }

  async update(id: string, dto: UpdateObservationDto) {
    return this.prisma.observation.update({
      where: {
        id,
      },
      data: {
        stationId: dto.stationId,
        observationDate: dto.observationDate
          ? new Date(dto.observationDate)
          : undefined,
        rainfall: dto.rainfall,
        waterLevel: dto.waterLevel,
        discharge: dto.discharge,
        note: dto.note,
      },
      include: {
        station: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.observation.delete({
      where: {
        id,
      },
    });
  }
}
