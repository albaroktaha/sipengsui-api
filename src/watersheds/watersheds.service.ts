import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { CreateWatershedDto } from './dto/create-watershed.dto';
import { UpdateWatershedDto } from './dto/update-watershed.dto';

@Injectable()
export class WatershedsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWatershedDto) {
    return this.prisma.watershed.create({
      data: dto,
      include: {
        riverRegion: true,
      },
    });
  }

  async findAll(riverRegionId?: string) {
    const where = riverRegionId ? { riverRegionId } : {};
    return this.prisma.watershed.findMany({
      where,
      include: {
        riverRegion: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const watershed = await this.prisma.watershed.findUnique({
      where: { id },
      include: {
        riverRegion: true,
      },
    });

    if (!watershed) {
      throw new NotFoundException('DAS tidak ditemukan');
    }

    return watershed;
  }

  async update(id: string, dto: UpdateWatershedDto) {
    await this.findOne(id);

    return this.prisma.watershed.update({
      where: { id },
      data: dto,
      include: {
        riverRegion: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.watershed.delete({
      where: { id },
    });
  }

  async publish(id: string) {
    const watershed = await this.findOne(id);

    if (watershed.publishedAt) {
      throw new BadRequestException('DAS sudah dipublikasikan');
    }

    return this.prisma.watershed.update({
      where: { id },
      data: {
        status: true,
        publishedAt: new Date(),
      },
      include: {
        riverRegion: true,
      },
    });
  }

  async unpublish(id: string) {
    await this.findOne(id);

    return this.prisma.watershed.update({
      where: { id },
      data: {
        publishedAt: null,
      },
      include: {
        riverRegion: true,
      },
    });
  }
}
