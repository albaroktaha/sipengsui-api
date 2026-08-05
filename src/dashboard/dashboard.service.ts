import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async statistics() {
    const [
      riverRegions,
      watersheds,
      rivers,
      stations,
      observations,
      arrStations,
      awlrStations,
    ] = await Promise.all([
      this.prisma.riverRegion.count(),
      this.prisma.watershed.count(),
      this.prisma.river.count(),
      this.prisma.station.count(),
      this.prisma.observation.count(),

      this.prisma.station.count({
        where: {
          type: 'ARR',
        },
      }),

      this.prisma.station.count({
        where: {
          type: 'AWLR',
        },
      }),
    ]);

    return {
      riverRegions,
      watersheds,
      rivers,
      stations,
      observations,
      arrStations,
      awlrStations,
    };
  }

  async superadminStats() {
    const [users, roles, permissions, activeUsers, deactivatedUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.role.count(),
        this.prisma.permission.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isActive: false } }),
      ]);

    // User distribution by role
    const roleDistribution = await this.prisma.role.findMany({
      include: {
        _count: { select: { userRoles: true } },
      },
    });

    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await this.prisma.user.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });

    return {
      users,
      roles,
      permissions,
      activeUsers,
      deactivatedUsers,
      roleDistribution: roleDistribution.map((r) => ({
        name: r.name,
        count: r._count.userRoles,
      })),
      recentRegistrations,
    };
  }

  async adminStats() {
    const [
      stats,
      totalRekomtek,
      rekomtekByStatus,
      recentImports,
      recentObservations,
    ] = await Promise.all([
      this.statistics(),
      this.prisma.rekomtek.count(),
      this.prisma.rekomtek.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.importHistory.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.observation.count({
        where: {
          observationDate: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      ...stats,
      rekomtek: {
        total: totalRekomtek,
        byStatus: rekomtekByStatus.map((r) => ({
          status: r.status,
          count: r._count.status,
        })),
      },
      recentImports,
      recentObservations,
    };
  }

  async hydrologyStats() {
    const [stations, observations, observationsByType, recentObservations] =
      await Promise.all([
        this.prisma.station.count(),
        this.prisma.observation.count(),
        this.prisma.station.groupBy({
          by: ['type'],
          _count: { type: true },
        }),
        this.prisma.observation.findMany({
          take: 10,
          orderBy: { observationDate: 'desc' },
          include: {
            station: {
              select: { id: true, name: true, code: true, type: true },
            },
          },
        }),
      ]);

    return {
      stations,
      observations,
      stationsByType: observationsByType.map((s) => ({
        type: s.type,
        count: s._count.type,
      })),
      recentObservations,
    };
  }

  async rekomtekStats() {
    const [total, byStatus, pendingReview] = await Promise.all([
      this.prisma.rekomtek.count(),
      this.prisma.rekomtek.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.rekomtek.count({
        where: { status: 'REVIEW' },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: r._count.status,
      })),
      pendingReview,
    };
  }

  async userStats(userId: string) {
    const [rekomteks, disasterReports] = await Promise.all([
      this.prisma.rekomtek.findMany({
        where: { createdBy: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          nomor: true,
          judul: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.disasterReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      rekomtekCount: rekomteks.length,
      rekomteks,
      disasterReportCount: disasterReports.length,
      disasterReports,
    };
  }
}
