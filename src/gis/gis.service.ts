import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryGisDto } from './dto/query-gis.dto';

interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

type StationFeatureSource = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  elevation: Prisma.Decimal | null;
  operatorName: string | null;
  village: string | null;
  district: string | null;
  regency: string | null;
  installationYear: number | null;
  status: boolean;
  publishedAt: Date | null;
  watershedId: string;
  watershed?: { name: string } | null;
  riverId: string | null;
  river?: { name: string } | null;
  _count?: { observations: number };
};

@Injectable()
export class GisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse bounding box string "minLng,minLat,maxLng,maxLat"
   */
  private parseBBox(bbox?: string): BBox | null {
    if (!bbox) return null;
    const parts = bbox.split(',').map(Number);
    if (
      parts.length !== 4 ||
      parts.some((value) => !Number.isFinite(value)) ||
      parts[0] < -180 ||
      parts[0] > 180 ||
      parts[2] < -180 ||
      parts[2] > 180 ||
      parts[1] < -90 ||
      parts[1] > 90 ||
      parts[3] < -90 ||
      parts[3] > 90 ||
      parts[0] > parts[2] ||
      parts[1] > parts[3]
    ) {
      throw new BadRequestException(
        'Format bbox tidak valid. Gunakan: minLng,minLat,maxLng,maxLat',
      );
    }
    return {
      minLng: parts[0],
      minLat: parts[1],
      maxLng: parts[2],
      maxLat: parts[3],
    };
  }

  /**
   * Build GeoJSON Feature for a station
   */
  private toStationFeature(station: StationFeatureSource) {
    if (station.latitude == null || station.longitude == null) return null;

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(station.longitude), Number(station.latitude)],
      },
      properties: {
        id: station.id,
        code: station.code,
        name: station.name,
        type: station.type,
        elevation: station.elevation ? Number(station.elevation) : null,
        operatorName: station.operatorName,
        village: station.village,
        district: station.district,
        regency: station.regency,
        installationYear: station.installationYear,
        status: station.status,
        publishedAt: station.publishedAt,
        watershedId: station.watershedId,
        watershedName: station.watershed?.name || null,
        riverId: station.riverId,
        riverName: station.river?.name || null,
        observationCount: station._count?.observations ?? 0,
      },
    };
  }

  /**
   * Build a `where` clause that only matches published records when requested.
   */
  private publishedFilter<T extends object>(
    extra: T,
    publishedOnly: boolean,
  ): T {
    if (!publishedOnly) return extra;
    return {
      ...extra,
      status: true,
      publishedAt: { not: null },
    };
  }

  /**
   * GET /gis/stations - GeoJSON Point features
   */
  async getStations(query: QueryGisDto) {
    const bbox = this.parseBBox(query.bbox);
    const where: Prisma.StationWhereInput = {
      latitude: { not: null },
      longitude: { not: null },
    };

    if (bbox) {
      where.longitude = { gte: bbox.minLng, lte: bbox.maxLng };
      where.latitude = { gte: bbox.minLat, lte: bbox.maxLat };
    }

    if (query.stationType === 'ARR' || query.stationType === 'AWLR') {
      where.type = query.stationType;
    } else if (query.stationType) {
      throw new BadRequestException('Tipe station tidak valid');
    }

    const stations = await this.prisma.station.findMany({
      where,
      include: {
        watershed: { select: { name: true } },
        river: { select: { name: true } },
        _count: { select: { observations: true } },
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit, 5000),
      skip: (query.page - 1) * query.limit,
    });

    const features = stations
      .map((s) => this.toStationFeature(s))
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * GET /gis/stations/with-latest-obs - Stations + latest observation
   */
  async getStationsWithLatestObservation(query: QueryGisDto) {
    const bbox = this.parseBBox(query.bbox);
    const where: Prisma.StationWhereInput = {
      latitude: { not: null },
      longitude: { not: null },
    };

    if (bbox) {
      where.longitude = { gte: bbox.minLng, lte: bbox.maxLng };
      where.latitude = { gte: bbox.minLat, lte: bbox.maxLat };
    }

    if (query.stationType === 'ARR' || query.stationType === 'AWLR') {
      where.type = query.stationType;
    } else if (query.stationType) {
      throw new BadRequestException('Tipe station tidak valid');
    }

    const stations = await this.prisma.station.findMany({
      where,
      include: {
        watershed: { select: { name: true } },
        observations: {
          orderBy: { observationDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: Math.min(query.limit, 5000),
    });

    const features = stations
      .map((s) => {
        if (s.latitude == null || s.longitude == null) return null;
        const latestObs = s.observations?.[0] || null;
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number(s.longitude), Number(s.latitude)],
          },
          properties: {
            id: s.id,
            code: s.code,
            name: s.name,
            type: s.type,
            elevation: s.elevation ? Number(s.elevation) : null,
            operatorName: s.operatorName,
            village: s.village,
            district: s.district,
            regency: s.regency,
            status: s.status,
            watershedName: s.watershed?.name || null,
            latestObservation: latestObs
              ? {
                  date: latestObs.observationDate,
                  rainfall: latestObs.rainfall
                    ? Number(latestObs.rainfall)
                    : null,
                  waterLevel: latestObs.waterLevel
                    ? Number(latestObs.waterLevel)
                    : null,
                  discharge: latestObs.discharge
                    ? Number(latestObs.discharge)
                    : null,
                  source: latestObs.source,
                }
              : null,
          },
        };
      })
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * GET /gis/rivers - GeoJSON LineString features
   */
  async getRivers(query: QueryGisDto) {
    const rivers = await this.prisma.river.findMany({
      include: {
        watershed: { select: { name: true, code: true } },
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit, 5000),
    });

    const features = rivers
      .map((r) => {
        if (!r.geometry) return null;
        return {
          type: 'Feature',
          geometry: r.geometry,
          properties: {
            id: r.id,
            code: r.code,
            slug: r.slug,
            name: r.name,
            length: r.length,
            orderNumber: r.orderNumber,
            watershedId: r.watershedId,
            watershedName: r.watershed?.name || null,
            parentRiverId: r.parentRiverId,
            status: r.status,
          },
        };
      })
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * GET /gis/watersheds - GeoJSON Polygon/MultiPolygon features
   */
  async getWatersheds(query: QueryGisDto) {
    const watersheds = await this.prisma.watershed.findMany({
      include: {
        riverRegion: { select: { name: true, code: true } },
        _count: { select: { stations: true, rivers: true } },
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit, 5000),
    });

    const features = watersheds
      .map((w) => {
        if (!w.geometry) return null;
        return {
          type: 'Feature',
          geometry: w.geometry,
          properties: {
            id: w.id,
            code: w.code,
            slug: w.slug,
            name: w.name,
            area: w.area,
            riverRegionId: w.riverRegionId,
            riverRegionName: w.riverRegion?.name || null,
            stationCount: w._count?.stations ?? 0,
            riverCount: w._count?.rivers ?? 0,
            status: w.status,
          },
        };
      })
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * GET /gis/river-regions - GeoJSON Polygon/MultiPolygon features
   */
  async getRiverRegions(query: QueryGisDto) {
    const regions = await this.prisma.riverRegion.findMany({
      include: {
        _count: { select: { watersheds: true } },
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit, 5000),
    });

    const features = regions
      .map((r) => {
        if (!r.geometry) return null;
        return {
          type: 'Feature',
          geometry: r.geometry,
          properties: {
            id: r.id,
            code: r.code,
            slug: r.slug,
            name: r.name,
            description: r.description,
            watershedCount: r._count?.watersheds ?? 0,
            status: r.status,
          },
        };
      })
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * GET /gis/map - Gabungan semua layer dalam 1 response
   */
  async getMap(options: { publishedOnly?: boolean } = {}) {
    const { publishedOnly = false } = options;

    const [stations, rivers, watersheds, riverRegions] = await Promise.all([
      this.prisma.station.findMany({
        where: this.publishedFilter(
          { latitude: { not: null }, longitude: { not: null } },
          publishedOnly,
        ),
        include: {
          watershed: { select: { name: true } },
          _count: { select: { observations: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.river.findMany({
        where: this.publishedFilter(
          { geometry: { not: Prisma.DbNull } },
          publishedOnly,
        ),
        include: { watershed: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.watershed.findMany({
        where: this.publishedFilter(
          { geometry: { not: Prisma.DbNull } },
          publishedOnly,
        ),
        include: { riverRegion: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.riverRegion.findMany({
        where: this.publishedFilter(
          { geometry: { not: Prisma.DbNull } },
          publishedOnly,
        ),
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      layers: {
        stations: {
          type: 'FeatureCollection',
          features: stations
            .map((s) => this.toStationFeature(s))
            .filter(Boolean),
        },
        rivers: {
          type: 'FeatureCollection',
          features: rivers
            .map((r) => ({
              type: 'Feature',
              geometry: r.geometry,
              properties: {
                id: r.id,
                code: r.code,
                name: r.name,
                length: r.length,
                orderNumber: r.orderNumber,
                watershedName: r.watershed?.name || null,
                publishedAt: r.publishedAt,
              },
            }))
            .filter(Boolean),
        },
        watersheds: {
          type: 'FeatureCollection',
          features: watersheds
            .map((w) => ({
              type: 'Feature',
              geometry: w.geometry,
              properties: {
                id: w.id,
                code: w.code,
                name: w.name,
                area: w.area,
                riverRegionName: w.riverRegion?.name || null,
                publishedAt: w.publishedAt,
              },
            }))
            .filter(Boolean),
        },
        riverRegions: {
          type: 'FeatureCollection',
          features: riverRegions
            .map((r) => ({
              type: 'Feature',
              geometry: r.geometry,
              properties: {
                id: r.id,
                code: r.code,
                name: r.name,
                publishedAt: r.publishedAt,
              },
            }))
            .filter(Boolean),
        },
      },
    };
  }

  /**
   * GET /gis/summary - Statistik jumlah data per layer
   */
  async getSummary(options: { publishedOnly?: boolean } = {}) {
    const { publishedOnly = false } = options;
    const publishedWhere = publishedOnly
      ? { status: true, publishedAt: { not: null } }
      : {};

    const [
      stationCount,
      riverCount,
      watershedCount,
      riverRegionCount,
      observationCount,
    ] = await Promise.all([
      this.prisma.station.count({ where: publishedWhere }),
      this.prisma.river.count({ where: publishedWhere }),
      this.prisma.watershed.count({ where: publishedWhere }),
      this.prisma.riverRegion.count({ where: publishedWhere }),
      this.prisma.observation.count(),
    ]);

    return {
      summary: {
        stations: {
          total: stationCount,
          withCoordinates: await this.prisma.station.count({
            where: {
              ...publishedWhere,
              latitude: { not: null },
              longitude: { not: null },
            },
          }),
          withGeometry: await this.prisma.station.count({
            where: {
              ...publishedWhere,
              latitude: { not: null },
              longitude: { not: null },
            },
          }),
        },
        rivers: {
          total: riverCount,
          withGeometry: await this.prisma.river.count({
            where: { ...publishedWhere, geometry: { not: Prisma.DbNull } },
          }),
        },
        watersheds: {
          total: watershedCount,
          withGeometry: await this.prisma.watershed.count({
            where: { ...publishedWhere, geometry: { not: Prisma.DbNull } },
          }),
        },
        riverRegions: {
          total: riverRegionCount,
          withGeometry: await this.prisma.riverRegion.count({
            where: { ...publishedWhere, geometry: { not: Prisma.DbNull } },
          }),
        },
        observations: {
          total: observationCount,
        },
      },
    };
  }
}
