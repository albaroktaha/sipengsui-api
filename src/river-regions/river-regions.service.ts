import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { CreateRiverRegionDto } from './dto/create-river-region.dto';
import { UpdateRiverRegionDto } from './dto/update-river-region.dto';

@Injectable()
export class RiverRegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRiverRegionDto) {
    return this.prisma.riverRegion.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.riverRegion.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const riverRegion = await this.prisma.riverRegion.findUnique({
      where: { id },
    });

    if (!riverRegion) {
      throw new NotFoundException('River Region not found');
    }

    return riverRegion;
  }

  async update(id: string, dto: UpdateRiverRegionDto) {
    await this.findOne(id);

    return this.prisma.riverRegion.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.riverRegion.delete({
      where: { id },
    });
  }

  async publish(id: string) {
    const riverRegion = await this.findOne(id);

    if (riverRegion.publishedAt) {
      throw new BadRequestException('Wilayah Sungai sudah dipublikasikan');
    }

    return this.prisma.riverRegion.update({
      where: { id },
      data: {
        status: true,
        publishedAt: new Date(),
      },
    });
  }

  async unpublish(id: string) {
    await this.findOne(id);

    return this.prisma.riverRegion.update({
      where: { id },
      data: {
        publishedAt: null,
      },
    });
  }
}
