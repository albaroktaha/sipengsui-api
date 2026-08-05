import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStationDto) {
    return this.prisma.station.create({
      data: {
        watershedId: dto.watershedId,
        riverId: dto.riverId,

        code: dto.code,
        name: dto.name,
        type: dto.type,

        latitude: dto.latitude,
        longitude: dto.longitude,
        elevation: dto.elevation,

        operatorName: dto.operatorName,

        village: dto.village,
        district: dto.district,
        regency: dto.regency,

        installationYear: dto.installationYear,

        description: dto.description,
      },
      include: {
        watershed: true,
        river: true,
      },
    });
  }

  async findAll() {
    return this.prisma.station.findMany({
      include: {
        watershed: true,
        river: true,
        _count: {
          select: {
            observations: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const station = await this.prisma.station.findUnique({
      where: { id },
      include: {
        watershed: true,
        river: true,
        observations: {
          orderBy: {
            observationDate: 'desc',
          },
        },
      },
    });

    if (!station) {
      throw new NotFoundException('Station tidak ditemukan');
    }

    return station;
  }

  async update(id: string, dto: UpdateStationDto) {
    await this.findOne(id);

    return this.prisma.station.update({
      where: { id },
      data: {
        watershedId: dto.watershedId,
        riverId: dto.riverId,

        code: dto.code,
        name: dto.name,
        type: dto.type,

        latitude: dto.latitude,
        longitude: dto.longitude,
        elevation: dto.elevation,

        operatorName: dto.operatorName,

        village: dto.village,
        district: dto.district,
        regency: dto.regency,

        installationYear: dto.installationYear,

        description: dto.description,

        status: dto.status,
      },
      include: {
        watershed: true,
        river: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.station.delete({
      where: {
        id,
      },
    });
  }

  async publish(id: string) {
    const station = await this.findOne(id);

    if (station.publishedAt) {
      throw new BadRequestException('Stasiun sudah dipublikasikan');
    }

    return this.prisma.station.update({
      where: { id },
      data: {
        status: true,
        publishedAt: new Date(),
      },
      include: {
        watershed: true,
        river: true,
      },
    });
  }

  async unpublish(id: string) {
    await this.findOne(id);

    return this.prisma.station.update({
      where: { id },
      data: {
        publishedAt: null,
      },
      include: {
        watershed: true,
        river: true,
      },
    });
  }
}
