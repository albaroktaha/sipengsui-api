import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiverDto } from './dto/create-river.dto';
import { UpdateRiverDto } from './dto/update-river.dto';

@Injectable()
export class RiversService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRiverDto) {
    return this.prisma.river.create({
      data: {
        watershedId: dto.watershedId,
        parentRiverId: dto.parentRiverId,
        code: dto.code,
        slug: dto.slug,
        name: dto.name,
        orderNumber: dto.orderNumber,
        length: dto.length,
        geometry: dto.geometry as Prisma.InputJsonValue,
        description: dto.description,
      },
      include: {
        watershed: true,
        parentRiver: true,
      },
    });
  }

  async findAll(watershedId?: string) {
    const where = watershedId ? { watershedId } : {};
    return this.prisma.river.findMany({
      where,
      include: {
        watershed: true,
        parentRiver: true,
        childRivers: true,
      },
    });
  }

  async findOne(id: string) {
    const river = await this.prisma.river.findUnique({
      where: { id },
      include: {
        watershed: true,
        parentRiver: true,
        childRivers: true,
      },
    });

    if (!river) {
      throw new NotFoundException('Sungai tidak ditemukan');
    }

    return river;
  }

  async update(id: string, dto: UpdateRiverDto) {
    await this.findOne(id);

    return this.prisma.river.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.river.delete({
      where: { id },
    });
  }

  async publish(id: string) {
    const river = await this.findOne(id);

    if (river.publishedAt) {
      throw new BadRequestException('Sungai sudah dipublikasikan');
    }

    return this.prisma.river.update({
      where: { id },
      data: {
        status: true,
        publishedAt: new Date(),
      },
      include: {
        watershed: true,
      },
    });
  }

  async unpublish(id: string) {
    await this.findOne(id);

    return this.prisma.river.update({
      where: { id },
      data: {
        publishedAt: null,
      },
      include: {
        watershed: true,
      },
    });
  }
}
