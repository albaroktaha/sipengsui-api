import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { basename, extname, isAbsolute, join, relative, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateKmzArchiveLimits } from './gis-kmz-limits';
import {
  GIS_CATEGORY_GEOMETRY_TYPES,
  validateGeoJson,
} from './gis-geometry.validator';

const ALLOWED_EXT = ['.kmz', '.kml'];
const MAX_SIZE = 30 * 1024 * 1024; // 30MB

export interface GisMapFileData {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  geometry: Prisma.InputJsonValue;
}

@Injectable()
export class GisMapFileService {
  private readonly logger = new Logger(GisMapFileService.name);
  private uploadDir: string;

  constructor(private readonly prisma: PrismaService) {
    this.uploadDir = join(process.cwd(), 'uploads', 'gis-maps');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Validasi lalu simpan sebagai versi draft. Versi/berkas lama dipertahankan
   * sampai ada keputusan retensi terpisah; publikasi membaca snapshot published.
   */
  async saveForMap(
    mapId: string,
    file: Express.Multer.File,
    createdById?: string,
  ): Promise<GisMapFileData> {
    const map = await this.prisma.gisMap.findUnique({
      where: { id: mapId },
      select: {
        id: true,
        category: true,
        sourceOrganization: true,
        surveyDate: true,
        accuracyMeters: true,
        sourceCrs: true,
        outputCrs: true,
        license: true,
        coverage: true,
        qualityNotes: true,
      },
    });
    if (!map) {
      throw new NotFoundException('Peta tidak ditemukan');
    }

    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('File wajib diunggah');
    }
    const safeOriginalName = Array.from(
      basename(file.originalname.replace(/\\/g, '/')),
    )
      .filter((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 0x20 && !(codePoint >= 0x7f && codePoint <= 0x9f);
      })
      .join('')
      .trim()
      .slice(0, 255);
    const ext = extname(safeOriginalName).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(
        'Format file tidak didukung. Gunakan file .kmz atau .kml',
      );
    }

    if (file.size > MAX_SIZE || file.buffer.length > MAX_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 30MB');
    }
    if (file.size !== file.buffer.length) {
      throw new BadRequestException(
        'Ukuran berkas tidak sesuai dengan isi unggahan',
      );
    }
    if (!safeOriginalName) {
      throw new BadRequestException('Nama berkas tidak valid');
    }

    let geometry: unknown;
    try {
      geometry = this.convertToGeoJson(file.buffer, ext);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Gagal membaca data peta dari file',
      );
    }

    const validation = validateGeoJson(geometry, {
      allowedGeometryTypes: GIS_CATEGORY_GEOMETRY_TYPES[map.category],
    });
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Geometri file tidak valid untuk kategori peta ini',
        validation,
      });
    }

    const safeName = `${randomUUID()}${ext}`;
    const filePath = join(this.uploadDir, safeName);
    try {
      await writeFile(filePath, file.buffer, { flag: 'wx' });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `Gagal menyimpan berkas baru: ${error.message}`
          : 'Gagal menyimpan berkas baru',
      );
    }

    const fileUrl = `/uploads/gis-maps/${safeName}`;
    const metadata = {
      sourceOrganization: map.sourceOrganization,
      surveyDate: map.surveyDate?.toISOString() ?? null,
      accuracyMeters: map.accuracyMeters?.toString() ?? null,
      sourceCrs: map.sourceCrs,
      outputCrs: map.outputCrs,
      license: map.license,
      coverage: map.coverage,
      qualityNotes: map.qualityNotes,
    } as Prisma.InputJsonValue;
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.gisMap.update({
          where: { id: mapId },
          data: {
            fileUrl,
            fileName: safeOriginalName,
            fileSize: file.size,
            geometry: geometry as Prisma.InputJsonValue,
            hasGeometry: true,
            versionCounter: { increment: 1 },
          },
          select: { versionCounter: true },
        });
        await tx.gisMapVersion.updateMany({
          where: { mapId, status: 'DRAFT' },
          data: { status: 'SUPERSEDED' },
        });
        await tx.gisMapVersion.create({
          data: {
            mapId,
            version: updated.versionCounter,
            fileUrl,
            fileName: safeOriginalName,
            fileSize: file.size,
            checksum: createHash('sha256').update(file.buffer).digest('hex'),
            geometry: geometry as Prisma.InputJsonValue,
            validationReport: validation as unknown as Prisma.InputJsonValue,
            metadata,
            status: 'DRAFT',
            createdById: createdById ?? null,
          },
        });
      });
    } catch (error) {
      try {
        await this.deleteFile(fileUrl);
      } catch (cleanupError) {
        this.logger.error(
          `Berkas GIS draft gagal dibersihkan setelah transaksi gagal (${safeName}): ${cleanupError instanceof Error ? cleanupError.message : 'unknown error'}`,
        );
      }
      throw error;
    }

    return {
      fileUrl,
      fileName: safeOriginalName,
      fileSize: file.size,
      geometry: geometry as Prisma.InputJsonValue,
    };
  }

  async deleteFileByUrl(fileUrl: string): Promise<void> {
    await this.deleteFile(fileUrl);
  }

  resolveStoredFilePath(fileUrl: string): string {
    const pathname = fileUrl.split(/[?#]/, 1)[0].replace(/\\/g, '/');
    const prefix = '/uploads/gis-maps/';
    if (!pathname.toLowerCase().startsWith(prefix)) {
      throw new NotFoundException('Berkas GIS tidak ditemukan');
    }

    let fileName: string;
    try {
      fileName = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      throw new NotFoundException('Berkas GIS tidak ditemukan');
    }
    if (
      !fileName ||
      fileName !== basename(fileName) ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw new NotFoundException('Berkas GIS tidak ditemukan');
    }

    const root = resolve(this.uploadDir);
    const filePath = resolve(root, fileName);
    const pathFromRoot = relative(root, filePath);
    if (
      !pathFromRoot ||
      pathFromRoot.startsWith('..') ||
      isAbsolute(pathFromRoot) ||
      !existsSync(filePath)
    ) {
      throw new NotFoundException('Berkas GIS tidak ditemukan');
    }
    return filePath;
  }

  private async deleteFile(fileUrl: string): Promise<void> {
    const fileName = decodeURIComponent(fileUrl.split('/').pop() ?? '');
    if (
      !fileName ||
      basename(fileName) !== fileName ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw new BadRequestException('Referensi berkas GIS tidak valid');
    }
    const root = resolve(this.uploadDir);
    const filePath = resolve(root, fileName);
    if (!filePath.startsWith(`${root}/`) && !filePath.startsWith(`${root}\\`)) {
      throw new BadRequestException(
        'Referensi berkas GIS berada di luar direktori upload',
      );
    }
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  /**
   * Konversi buffer KMZ/KML menjadi GeoJSON FeatureCollection.
   */
  private convertToGeoJson(buffer: Buffer, ext: string): unknown {
    const kmlBuffer = ext === '.kmz' ? this.extractKmlFromKmz(buffer) : buffer;
    if (!kmlBuffer) {
      throw new Error('Tidak ada file .kml di dalam .kmz');
    }

    const xml = kmlBuffer.toString('utf-8');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
      throw new Error('Deklarasi DOCTYPE/ENTITY tidak diizinkan pada file KML');
    }
    const parserErrors: string[] = [];
    const doc = new DOMParser({
      errorHandler: (level, message) => {
        if (level === 'error' || level === 'fatalError')
          parserErrors.push(message);
      },
    }).parseFromString(xml, 'text/xml');
    if (parserErrors.length > 0) {
      throw new Error(`Struktur XML KML tidak valid: ${parserErrors[0]}`);
    }
    const geojson = kml(doc) as unknown;
    if (!geojson || typeof geojson !== 'object') {
      throw new Error('File KML tidak memiliki data yang valid');
    }
    return geojson;
  }

  /**
   * Ekstrak entry .kml pertama dari arsip .kmz (zip).
   * Google Earth umumnya menyimpan sebagai doc.kml.
   */
  private extractKmlFromKmz(buffer: Buffer): Buffer | null {
    const zip = new AdmZip(buffer);
    const allEntries = zip.getEntries();
    validateKmzArchiveLimits(allEntries);
    const entries = allEntries.filter(
      (entry) => !entry.isDirectory && /\.kml$/i.test(entry.entryName),
    );

    const preferred = entries.find((e) => /doc\.kml$/i.test(e.entryName));
    const chosen = preferred ?? entries[0];
    if (!chosen) return null;
    return chosen.getData();
  }
}
