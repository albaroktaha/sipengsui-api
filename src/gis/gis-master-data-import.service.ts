import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GisMasterDataFeatureOverrideDto,
  GisMasterDataParentDto,
  ImportGisMasterDataDto,
} from './dto/gis-master-data-import.dto';

export type GisMasterDataTarget = 'RIVER_REGION' | 'WATERSHED' | 'RIVER';

const TARGET_BY_CATEGORY: Record<string, GisMasterDataTarget> = {
  PETA_WILAYAH_SUNGAI: 'RIVER_REGION',
  PETA_DAERAH_ALIRAN_SUNGAI: 'WATERSHED',
  PETA_SUNGAI: 'RIVER',
};

const TARGET_LABEL: Record<GisMasterDataTarget, string> = {
  RIVER_REGION: 'Wilayah Sungai',
  WATERSHED: 'Daerah Aliran Sungai',
  RIVER: 'Sungai',
};

type GeoJsonFeature = {
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
  id?: unknown;
};

type PreparedFeature = {
  index: number;
  name: string;
  code?: string;
  slug: string;
  description?: string;
  area?: number;
  length?: number;
  orderNumber?: number;
  geometry: Record<string, unknown> | null;
  key: string;
};

type ExistingRecord = {
  id: string;
  name: string;
  code: string | null;
  slug: string | null;
  sourceGisMapId: string | null;
};

type ExistingBatch = {
  byCode: Map<string, ExistingRecord>;
  bySlug: Map<string, ExistingRecord>;
  byName: Map<string, ExistingRecord>;
};

type ParentInfo = {
  id: string;
  name: string;
  type: 'RIVER_REGION' | 'WATERSHED';
} | null;

type MapContext = {
  id: string;
  name: string;
  category: string;
  geometry: Prisma.JsonValue | null;
  target: GisMasterDataTarget;
};

@Injectable()
export class GisMasterDataImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(mapId: string, dto: GisMasterDataParentDto) {
    const context = await this.getMapContext(mapId);
    const parent = await this.getParent(
      context.target,
      dto.parentId,
      this.prisma,
    );
    const features = prepareFeatures(context.geometry);
    const existing = await this.findExistingBatch(
      this.prisma,
      context.target,
      features,
      context.id,
    );
    const seen = new Set<string>();

    return {
      map: {
        id: context.id,
        name: context.name,
        category: context.category,
      },
      target: {
        type: context.target,
        label: TARGET_LABEL[context.target],
        parentRequired: context.target !== 'RIVER_REGION',
      },
      parent,
      total: features.length,
      features: features.map((feature) => {
        const keys = featureKeys(feature);
        const duplicateInFile = keys.some((key) => seen.has(key));
        keys.forEach((key) => seen.add(key));
        const current = duplicateInFile
          ? undefined
          : existingForFeature(existing, feature);

        return {
          index: feature.index,
          name: feature.name,
          code: feature.code ?? null,
          slug: feature.slug,
          geometryType: geometryType(feature.geometry),
          action: duplicateInFile ? 'duplicate' : current ? 'update' : 'create',
          existing: current ? { id: current.id, name: current.name } : null,
        };
      }),
    };
  }

  async import(mapId: string, dto: ImportGisMasterDataDto) {
    const context = await this.getMapContext(mapId);
    const allFeatures = prepareFeatures(context.geometry);
    const features = selectFeatures(allFeatures, dto);

    if (!features.length) {
      throw new BadRequestException(
        'Tidak ada fitur GIS yang dipilih untuk diimpor',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const parent = await this.getParent(context.target, dto.parentId, tx);
      const existing = await this.findExistingBatch(
        tx,
        context.target,
        features,
        context.id,
      );
      const seen = new Set<string>();
      const items: Array<{
        index: number;
        id: string | null;
        name: string;
        action: 'created' | 'updated' | 'skipped';
        reason?: string;
      }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const feature of features) {
        const keys = featureKeys(feature);
        if (keys.some((key) => seen.has(key))) {
          skipped += 1;
          items.push({
            index: feature.index,
            id: null,
            name: feature.name,
            action: 'skipped',
            reason: 'duplicate_in_file',
          });
          continue;
        }
        keys.forEach((key) => seen.add(key));

        const current = existingForFeature(existing, feature);
        if (current && dto.updateExisting === false) {
          skipped += 1;
          items.push({
            index: feature.index,
            id: current.id,
            name: current.name,
            action: 'skipped',
            reason: 'already_exists',
          });
          continue;
        }

        if (current) {
          const updatedRecord = await this.updateMasterRecord(
            tx,
            context.target,
            current.id,
            feature,
            context.id,
            parent?.id,
          );
          registerExisting(existing, feature, {
            id: updatedRecord.id,
            name: updatedRecord.name,
            code: feature.code ?? current.code,
            slug: feature.slug,
            sourceGisMapId: context.id,
          });
          updated += 1;
          items.push({
            index: feature.index,
            id: updatedRecord.id,
            name: updatedRecord.name,
            action: 'updated',
          });
          continue;
        }

        const createdRecord = await this.createMasterRecord(
          tx,
          context.target,
          feature,
          context.id,
          parent?.id,
        );
        registerExisting(existing, feature, {
          id: createdRecord.id,
          name: createdRecord.name,
          code: feature.code ?? null,
          slug: feature.slug,
          sourceGisMapId: context.id,
        });
        created += 1;
        items.push({
          index: feature.index,
          id: createdRecord.id,
          name: createdRecord.name,
          action: 'created',
        });
      }

      return {
        map: {
          id: context.id,
          name: context.name,
          category: context.category,
        },
        target: context.target,
        parent,
        total: features.length,
        created,
        updated,
        skipped,
        items,
      };
    });

    return result;
  }

  private async getMapContext(mapId: string): Promise<MapContext> {
    const map = await this.prisma.gisMap.findUnique({
      where: { id: mapId },
      select: {
        id: true,
        name: true,
        category: true,
        geometry: true,
        hasGeometry: true,
      },
    });

    if (!map) {
      throw new NotFoundException('Peta GIS tidak ditemukan');
    }

    const target = TARGET_BY_CATEGORY[map.category];
    if (!target) {
      throw new BadRequestException(
        'Kategori peta ini belum memiliki target master data otomatis',
      );
    }

    if (!map.hasGeometry || !map.geometry) {
      throw new BadRequestException(
        'Peta belum memiliki geometri yang dapat diimpor',
      );
    }

    const features = parseGeoJsonFeatures(map.geometry);
    if (!features.length) {
      throw new BadRequestException('Peta tidak berisi fitur GeoJSON');
    }

    return {
      id: map.id,
      name: map.name,
      category: map.category,
      geometry: map.geometry,
      target,
    };
  }

  private async getParent(
    target: GisMasterDataTarget,
    parentId: string | undefined,
    db: PrismaService | Prisma.TransactionClient,
  ): Promise<ParentInfo> {
    if (target === 'RIVER_REGION') return null;

    if (!parentId) {
      throw new BadRequestException(
        target === 'WATERSHED'
          ? 'Pilih Wilayah Sungai sebagai induk DAS'
          : 'Pilih DAS sebagai induk sungai',
      );
    }

    if (target === 'WATERSHED') {
      const parent = await db.riverRegion.findUnique({
        where: { id: parentId },
        select: { id: true, name: true },
      });
      if (!parent)
        throw new NotFoundException('Wilayah Sungai induk tidak ditemukan');
      return { ...parent, type: 'RIVER_REGION' };
    }

    const parent = await db.watershed.findUnique({
      where: { id: parentId },
      select: { id: true, name: true },
    });
    if (!parent) throw new NotFoundException('DAS induk tidak ditemukan');
    return { ...parent, type: 'WATERSHED' };
  }

  private async findExistingBatch(
    db: PrismaService | Prisma.TransactionClient,
    target: GisMasterDataTarget,
    features: PreparedFeature[],
    sourceGisMapId: string,
  ): Promise<ExistingBatch> {
    const codes = unique(
      features.flatMap((feature) => (feature.code ? [feature.code] : [])),
    );
    const slugs = unique(features.map((feature) => feature.slug));
    const names = unique(features.map((feature) => feature.name));
    const whereParts = [
      ...(codes.length ? [{ code: { in: codes } }] : []),
      { slug: { in: slugs } },
      { sourceGisMapId, name: { in: names } },
    ];
    let rows: ExistingRecord[];

    switch (target) {
      case 'RIVER_REGION':
        rows = await db.riverRegion.findMany({
          where: { OR: whereParts },
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            sourceGisMapId: true,
          },
        });
        break;
      case 'WATERSHED':
        rows = await db.watershed.findMany({
          where: { OR: whereParts },
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            sourceGisMapId: true,
          },
        });
        break;
      case 'RIVER':
        rows = await db.river.findMany({
          where: { OR: whereParts },
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            sourceGisMapId: true,
          },
        });
        break;
    }

    const byCode = new Map<string, ExistingRecord>();
    const bySlug = new Map<string, ExistingRecord>();
    const byName = new Map<string, ExistingRecord>();
    for (const row of rows) {
      if (row.code) byCode.set(lookupKey(row.code), row);
      if (row.slug) bySlug.set(lookupKey(row.slug), row);
      if (row.sourceGisMapId === sourceGisMapId) {
        byName.set(lookupKey(row.name), row);
      }
    }
    return { byCode, bySlug, byName };
  }

  private async createMasterRecord(
    tx: Prisma.TransactionClient,
    target: GisMasterDataTarget,
    feature: PreparedFeature,
    sourceGisMapId: string,
    parentId?: string,
  ): Promise<{ id: string; name: string }> {
    const geometry = geometryInput(feature.geometry);

    switch (target) {
      case 'RIVER_REGION': {
        const data: Prisma.RiverRegionUncheckedCreateInput = {
          code: feature.code ?? null,
          slug: feature.slug,
          name: feature.name,
          ...(geometry ? { geometry } : {}),
          description: feature.description ?? null,
          sourceGisMapId,
        };
        return tx.riverRegion.create({
          data,
          select: { id: true, name: true },
        });
      }
      case 'WATERSHED': {
        const data: Prisma.WatershedUncheckedCreateInput = {
          riverRegionId: parentId!,
          code: feature.code ?? null,
          slug: feature.slug,
          name: feature.name,
          ...(feature.area !== undefined ? { area: feature.area } : {}),
          ...(geometry ? { geometry } : {}),
          description: feature.description ?? null,
          sourceGisMapId,
        };
        return tx.watershed.create({ data, select: { id: true, name: true } });
      }
      case 'RIVER': {
        const data: Prisma.RiverUncheckedCreateInput = {
          watershedId: parentId!,
          code: feature.code ?? null,
          slug: feature.slug,
          name: feature.name,
          ...(feature.orderNumber !== undefined
            ? { orderNumber: feature.orderNumber }
            : {}),
          ...(feature.length !== undefined ? { length: feature.length } : {}),
          ...(geometry ? { geometry } : {}),
          description: feature.description ?? null,
          sourceGisMapId,
        };
        return tx.river.create({ data, select: { id: true, name: true } });
      }
    }
  }

  private async updateMasterRecord(
    tx: Prisma.TransactionClient,
    target: GisMasterDataTarget,
    id: string,
    feature: PreparedFeature,
    sourceGisMapId: string,
    parentId?: string,
  ): Promise<{ id: string; name: string }> {
    const geometry = geometryInput(feature.geometry);

    switch (target) {
      case 'RIVER_REGION': {
        const data: Prisma.RiverRegionUncheckedUpdateInput = {
          ...(feature.code !== undefined ? { code: feature.code } : {}),
          slug: feature.slug,
          name: feature.name,
          ...(feature.description !== undefined
            ? { description: feature.description }
            : {}),
          ...(geometry ? { geometry } : {}),
          sourceGisMapId,
        };
        return tx.riverRegion.update({
          where: { id },
          data,
          select: { id: true, name: true },
        });
      }
      case 'WATERSHED': {
        const data: Prisma.WatershedUncheckedUpdateInput = {
          riverRegionId: parentId!,
          ...(feature.code !== undefined ? { code: feature.code } : {}),
          slug: feature.slug,
          name: feature.name,
          ...(feature.area !== undefined ? { area: feature.area } : {}),
          ...(feature.description !== undefined
            ? { description: feature.description }
            : {}),
          ...(geometry ? { geometry } : {}),
          sourceGisMapId,
        };
        return tx.watershed.update({
          where: { id },
          data,
          select: { id: true, name: true },
        });
      }
      case 'RIVER': {
        const data: Prisma.RiverUncheckedUpdateInput = {
          watershedId: parentId!,
          ...(feature.code !== undefined ? { code: feature.code } : {}),
          slug: feature.slug,
          name: feature.name,
          ...(feature.orderNumber !== undefined
            ? { orderNumber: feature.orderNumber }
            : {}),
          ...(feature.length !== undefined ? { length: feature.length } : {}),
          ...(feature.description !== undefined
            ? { description: feature.description }
            : {}),
          ...(geometry ? { geometry } : {}),
          sourceGisMapId,
        };
        return tx.river.update({
          where: { id },
          data,
          select: { id: true, name: true },
        });
      }
    }
  }
}

function parseGeoJsonFeatures(value: unknown): GeoJsonFeature[] {
  const root = asRecord(value);
  if (!root) return [];

  if (root.type === 'Feature') {
    const feature = normalizeFeature(root);
    return feature ? [feature] : [];
  }

  if (root.type !== 'FeatureCollection' || !Array.isArray(root.features)) {
    return [];
  }

  return root.features.flatMap((value) => {
    const feature = normalizeFeature(value);
    return feature ? [feature] : [];
  });
}

function normalizeFeature(value: unknown): GeoJsonFeature | null {
  const record = asRecord(value);
  if (!record || record.type !== 'Feature') return null;
  return {
    id: record.id,
    geometry: asRecord(record.geometry),
    properties: asRecord(record.properties) ?? {},
  };
}

function prepareFeatures(value: unknown): PreparedFeature[] {
  return parseGeoJsonFeatures(value).map((feature, index) => {
    const code = firstString(feature.properties, [
      'code',
      'kode',
      'id',
      'kd_ws',
      'kd_das',
      'kd_sungai',
      'ws_id',
      'das_id',
    ]);
    const name =
      firstString(feature.properties, [
        'name',
        'nama',
        'title',
        'nama_ws',
        'nama_das',
        'nama_sungai',
        'nama_wilayah',
      ]) ??
      code ??
      `Fitur ${index + 1}`;
    const featureId = scalarString(feature.id);
    const slug =
      slugify(
        firstString(feature.properties, ['slug']) ??
          name + (featureId ? `-${featureId}` : ''),
      ) || `fitur-${index + 1}`;

    return {
      index,
      name,
      code,
      slug,
      description: firstString(feature.properties, [
        'description',
        'deskripsi',
        'keterangan',
      ]),
      area: firstNumber(feature.properties, ['area', 'luas']),
      length: firstNumber(feature.properties, ['length', 'panjang']),
      orderNumber: firstInteger(feature.properties, [
        'ordernumber',
        'order',
        'urutan',
      ]),
      geometry: feature.geometry,
      key: code ? `code:${lookupKey(code)}` : `slug:${lookupKey(slug)}`,
    };
  });
}

function selectFeatures(
  features: PreparedFeature[],
  dto: ImportGisMasterDataDto,
): PreparedFeature[] {
  const overrideMap = new Map<number, GisMasterDataFeatureOverrideDto>();
  for (const override of dto.features ?? []) {
    if (!features.some((feature) => feature.index === override.index)) {
      throw new BadRequestException(
        `Index fitur GIS tidak valid: ${override.index}`,
      );
    }
    overrideMap.set(override.index, override);
  }

  const requestedIndexes = dto.featureIndexes
    ? new Set(dto.featureIndexes)
    : undefined;
  if (requestedIndexes) {
    for (const index of requestedIndexes) {
      if (!features.some((feature) => feature.index === index)) {
        throw new BadRequestException(`Index fitur GIS tidak valid: ${index}`);
      }
    }
  }

  return features
    .filter(
      (feature) => !requestedIndexes || requestedIndexes.has(feature.index),
    )
    .map((feature) => applyOverride(feature, overrideMap.get(feature.index)));
}

function applyOverride(
  feature: PreparedFeature,
  override?: GisMasterDataFeatureOverrideDto,
): PreparedFeature {
  if (!override) return feature;

  const name = override.name?.trim() || feature.name;
  const code = override.code?.trim() || feature.code;
  const slug = override.slug?.trim()
    ? slugify(override.slug.trim())
    : feature.slug;

  return {
    ...feature,
    name,
    code,
    slug: slug || slugify(name) || feature.slug,
    description:
      override.description !== undefined
        ? override.description.trim() || undefined
        : feature.description,
    area: override.area ?? feature.area,
    length: override.length ?? feature.length,
    orderNumber: override.orderNumber ?? feature.orderNumber,
    key: code
      ? `code:${lookupKey(code)}`
      : `slug:${lookupKey(slug || feature.slug)}`,
  };
}

function existingForFeature(
  existing: ExistingBatch,
  feature: PreparedFeature,
): ExistingRecord | undefined {
  return (
    (feature.code ? existing.byCode.get(lookupKey(feature.code)) : undefined) ??
    existing.bySlug.get(lookupKey(feature.slug)) ??
    existing.byName.get(lookupKey(feature.name))
  );
}

function registerExisting(
  existing: ExistingBatch,
  feature: PreparedFeature,
  record: ExistingRecord,
): void {
  if (record.code) existing.byCode.set(lookupKey(record.code), record);
  existing.bySlug.set(lookupKey(feature.slug), record);
  if (record.sourceGisMapId) {
    existing.byName.set(lookupKey(record.name), record);
  }
}

function featureKeys(feature: PreparedFeature): string[] {
  return [
    ...(feature.code ? [`code:${lookupKey(feature.code)}`] : []),
    `slug:${lookupKey(feature.slug)}`,
  ];
}

function geometryInput(
  geometry: Record<string, unknown> | null,
): Prisma.InputJsonValue | undefined {
  return geometry ? (geometry as Prisma.InputJsonValue) : undefined;
}

function geometryType(geometry: Record<string, unknown> | null): string | null {
  return geometry && typeof geometry.type === 'string' ? geometry.type : null;
}

function firstString(
  properties: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const value = firstProperty(properties, keys);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstNumber(
  properties: Record<string, unknown>,
  keys: string[],
): number | undefined {
  const value = firstProperty(properties, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstInteger(
  properties: Record<string, unknown>,
  keys: string[],
): number | undefined {
  const value = firstNumber(properties, keys);
  return value !== undefined ? Math.trunc(value) : undefined;
}

function firstProperty(
  properties: Record<string, unknown>,
  keys: string[],
): unknown {
  const normalizedKeys = new Set(keys.map(normalizePropertyKey));
  const entry = Object.entries(properties).find(([key, value]) => {
    return normalizedKeys.has(normalizePropertyKey(key)) && value !== null;
  });
  return entry?.[1];
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizePropertyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
