import { Injectable, BadRequestException } from '@nestjs/common';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  private uploadDir: string;

  constructor(private readonly prisma: PrismaService) {
    this.uploadDir = join(process.cwd(), 'uploads', 'gis-maps');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Simpan file KMZ/KML ke disk, konversi ke GeoJSON, lalu update record GisMap.
   * File lama dihapus. Mengembalikan data file + hasil konversi.
   */
  async saveForMap(
    mapId: string,
    file: Express.Multer.File,
  ): Promise<GisMapFileData> {
    const map = await this.prisma.gisMap.findUnique({
      where: { id: mapId },
      select: { fileUrl: true },
    });
    if (!map) {
      throw new BadRequestException('Peta tidak ditemukan');
    }

    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(
        'Format file tidak didukung. Gunakan file .kmz atau .kml',
      );
    }

    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 30MB');
    }

    let geometry: Prisma.InputJsonValue;
    try {
      geometry = this.convertToGeoJson(file.buffer, ext);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Gagal membaca data peta dari file',
      );
    }

    if (!geometry || typeof geometry !== 'object') {
      throw new BadRequestException(
        'File tidak memiliki data geometri yang valid',
      );
    }

    if (map.fileUrl) {
      await this.deleteFile(map.fileUrl).catch(() => {});
    }

    const safeName = `${randomUUID()}${ext}`;
    const filePath = join(this.uploadDir, safeName);
    await writeFile(filePath, file.buffer);

    const fileUrl = `/uploads/gis-maps/${safeName}`;

    await this.prisma.gisMap.update({
      where: { id: mapId },
      data: {
        fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        geometry: geometry,
        hasGeometry: true,
      },
    });

    return {
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
      geometry,
    };
  }

  async deleteFileByUrl(fileUrl: string): Promise<void> {
    await this.deleteFile(fileUrl).catch(() => {});
  }

  private async deleteFile(fileUrl: string): Promise<void> {
    const fileName = fileUrl.split('/').pop();
    if (!fileName) return;
    const filePath = join(this.uploadDir, fileName);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  /**
   * Konversi buffer KMZ/KML menjadi GeoJSON FeatureCollection.
   */
  private convertToGeoJson(buffer: Buffer, ext: string): Prisma.InputJsonValue {
    const kmlBuffer = ext === '.kmz' ? this.extractKmlFromKmz(buffer) : buffer;
    if (!kmlBuffer) {
      throw new Error('Tidak ada file .kml di dalam .kmz');
    }

    const xml = kmlBuffer.toString('utf-8');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const geojson = kml(doc) as unknown as Prisma.InputJsonValue;
    if (!geojson) {
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
    const entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory && /\.kml$/i.test(e.entryName));

    const preferred = entries.find((e) => /doc\.kml$/i.test(e.entryName));
    const chosen = preferred ?? entries[0];
    return chosen ? chosen.getData() : null;
  }
}
