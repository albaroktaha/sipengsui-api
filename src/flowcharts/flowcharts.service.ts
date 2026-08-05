import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Flowchart, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateFlowchartDto } from './dto/create-flowchart.dto';
import { UpdateFlowchartDto } from './dto/update-flowchart.dto';

@Injectable()
export class FlowchartsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flowchart publik (hanya yang isPublished) — dipakai endpoint publik. */
  async getPublicBySlug(slug: string): Promise<Flowchart | null> {
    return this.prisma.flowchart.findFirst({
      where: { slug, isPublished: true },
    });
  }

  async findAll(): Promise<Flowchart[]> {
    return this.prisma.flowchart.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Flowchart> {
    const flowchart = await this.prisma.flowchart.findUnique({
      where: { id },
    });

    if (!flowchart) {
      throw new NotFoundException('Flowchart tidak ditemukan');
    }

    return flowchart;
  }

  async findBySlug(slug: string): Promise<Flowchart | null> {
    return this.prisma.flowchart.findUnique({ where: { slug } });
  }

  async create(dto: CreateFlowchartDto): Promise<Flowchart> {
    const existing = await this.prisma.flowchart.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(
        `Slug flowchart '${dto.slug}' sudah digunakan`,
      );
    }

    const data: Prisma.FlowchartCreateInput = {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      isPublished: dto.isPublished ?? true,
      nodes: (dto.nodes ?? []) as unknown as Prisma.InputJsonValue,
      edges: (dto.edges ?? []) as unknown as Prisma.InputJsonValue,
    };

    return this.prisma.flowchart.create({ data });
  }

  async update(id: string, dto: UpdateFlowchartDto): Promise<Flowchart> {
    await this.findOne(id);

    if (dto.slug) {
      const existing = await this.prisma.flowchart.findUnique({
        where: { slug: dto.slug },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Slug flowchart '${dto.slug}' sudah digunakan`,
        );
      }
    }

    const data: Prisma.FlowchartUpdateInput = {
      ...(dto.slug !== undefined && { slug: dto.slug }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
      ...(dto.nodes !== undefined && {
        nodes: dto.nodes as unknown as Prisma.InputJsonValue,
      }),
      ...(dto.edges !== undefined && {
        edges: dto.edges as unknown as Prisma.InputJsonValue,
      }),
    };

    return this.prisma.flowchart.update({ where: { id }, data });
  }

  async remove(id: string): Promise<Flowchart> {
    await this.findOne(id);

    return this.prisma.flowchart.delete({ where: { id } });
  }
}
