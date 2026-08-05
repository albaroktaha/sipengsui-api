import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(group?: string) {
    const where = group ? { group } : {};
    return this.prisma.permission.findMany({
      where,
      orderBy: [{ group: 'asc' }, { slug: 'asc' }],
    });
  }

  async findGroups() {
    const permissions = await this.prisma.permission.findMany({
      select: { group: true },
      distinct: ['group'],
      orderBy: { group: 'asc' },
    });
    return permissions.map((p) => p.group);
  }

  async findById(id: string) {
    return this.prisma.permission.findUnique({ where: { id } });
  }

  async findBySlug(slug: string) {
    return this.prisma.permission.findUnique({ where: { slug } });
  }

  async create(data: {
    slug: string;
    name: string;
    description?: string;
    group: string;
  }) {
    return this.prisma.permission.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; group?: string },
  ) {
    return this.prisma.permission.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.permission.delete({ where: { id } });
  }
}
