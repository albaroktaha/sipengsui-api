import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { KnowledgeChunk } from './knowledge.types';
import type { KnowledgeRetriever } from './knowledge-retriever.interface';

interface FlowNode {
  id?: string;
  label?: string;
}

interface FlowEdge {
  id?: string;
  source?: string;
  target?: string;
  label?: string;
}

const MAX_CONTEXT_CHARS = 6000;

/**
 * Retriever knowledge dari database (Prisma) untuk konten publik SIPENGSUI.
 * Hanya data dengan akses publik yang dikembalikan ke guest.
 */
@Injectable()
export class PrismaKnowledgeService implements KnowledgeRetriever {
  private readonly logger = new Logger(PrismaKnowledgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    options?: { limit?: number; userId?: string; roles?: string[] },
  ): Promise<KnowledgeChunk[]> {
    const limit = options?.limit ?? 5;
    const normalized = query.toLowerCase().trim();

    const chunks = await this.collectChunks(normalized);
    return chunks.slice(0, limit);
  }

  /**
   * Ringkasan statistik nyata dari database (bukan angka karangan).
   * Menampilkan total data di sistem; angka terpublikasi disebut bila berbeda.
   * Selalu disertakan sebagai konteks agar model tidak mengarang jumlah.
   */
  async getSummaryChunk(): Promise<KnowledgeChunk | null> {
    const [riverRegions, riverRegionsPublished, watersheds, rivers, stations] =
      await Promise.all([
        this.prisma.riverRegion.count(),
        this.prisma.riverRegion.count({
          where: { status: true, publishedAt: { not: null } },
        }),
        this.prisma.watershed.count(),
        this.prisma.river.count(),
        this.prisma.station.count(),
      ]);

    const parts: string[] = [
      `Statistik data pada sistem SIPENGSUI saat ini:`,
      `• Wilayah Sungai: ${riverRegions}`,
      `• Daerah Aliran Sungai (DAS): ${watersheds}`,
      `• Sungai: ${rivers}`,
      `• Stasiun: ${stations}`,
    ];
    if (riverRegionsPublished !== riverRegions) {
      parts.push(`• Wilayah Sungai terpublikasi: ${riverRegionsPublished}`);
    }

    return {
      id: 'live-stats',
      title: 'Statistik Data SIPENGSUI',
      content: parts.join('\n'),
      accessLevel: 'public',
      score: 100,
      updatedAt: new Date().toISOString(),
    };
  }

  private async collectChunks(query: string): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    let totalChars = 0;

    const push = (chunk: KnowledgeChunk) => {
      if (totalChars + chunk.content.length > MAX_CONTEXT_CHARS) return;
      chunks.push(chunk);
      totalChars += chunk.content.length;
    };

    // Flowchart publik (alur rekomtek / permintaan data).
    const flowcharts = await this.prisma.flowchart.findMany({
      where: { isPublished: true },
      take: 5,
    });
    for (const flowchart of flowcharts) {
      const title = flowchart.title;
      const label = title.toLowerCase();
      const q = query.toLowerCase();
      if (
        !label.includes(q.slice(0, 10)) &&
        q.length > 2 &&
        !this.mentions(q, [
          'rekomtek',
          'alur',
          'permohonan',
          'proses',
          'berkas',
          'rekomendasi',
        ])
      ) {
        continue;
      }
      const nodes = (
        Array.isArray(flowchart.nodes) ? flowchart.nodes : []
      ) as FlowNode[];
      const edges = (
        Array.isArray(flowchart.edges) ? flowchart.edges : []
      ) as FlowEdge[];
      const steps = nodes
        .map((node) => node.label ?? node.id ?? '')
        .filter(Boolean);
      const transitions = edges
        .filter((edge) => edge.label)
        .map((edge) => `(${edge.label})`)
        .filter(Boolean);
      const content = `${flowchart.description ?? ''}\n\nAlur: ${steps.join(' → ')}${transitions.length ? `\nDurasi: ${[...new Set(transitions)].join(', ')}` : ''}`;
      push({
        id: `flowchart:${flowchart.slug}`,
        title,
        content,
        accessLevel: 'public',
        updatedAt: flowchart.updatedAt.toISOString(),
        score: 10,
      });
    }

    // Wilayah Sungai (status + publishedAt).
    const riverRegions = await this.prisma.riverRegion.findMany({
      where: { status: true, publishedAt: { not: null } },
      select: { id: true, name: true, description: true, code: true },
      take: 20,
    });
    for (const region of riverRegions) {
      push({
        id: `river-region:${region.id}`,
        title: `Wilayah Sungai: ${region.name}`,
        content: `Wilayah Sungai ${region.name}${region.code ? ` (kode ${region.code})` : ''}.${region.description ? ` ${region.description}` : ''}`,
        accessLevel: 'public',
        score: 3,
      });
    }

    // Daerah Aliran Sungai (DAS).
    const watersheds = await this.prisma.watershed.findMany({
      where: { status: true, publishedAt: { not: null } },
      select: { id: true, name: true, description: true, area: true },
      take: 20,
    });
    for (const watershed of watersheds) {
      push({
        id: `watershed:${watershed.id}`,
        title: `Daerah Aliran Sungai: ${watershed.name}`,
        content: `DAS ${watershed.name}${watershed.area ? ` dengan luas ${watershed.area} km²` : ''}.${watershed.description ? ` ${watershed.description}` : ''}`,
        accessLevel: 'public',
        score: 3,
      });
    }

    // Sungai.
    const rivers = await this.prisma.river.findMany({
      where: { status: true, publishedAt: { not: null } },
      select: {
        id: true,
        name: true,
        description: true,
        length: true,
        orderNumber: true,
      },
      take: 20,
    });
    for (const river of rivers) {
      push({
        id: `river:${river.id}`,
        title: `Sungai: ${river.name}`,
        content: `Sungai ${river.name}${river.length ? ` dengan panjang ${river.length} km` : ''}${river.orderNumber ? ` (orde ${river.orderNumber})` : ''}.${river.description ? ` ${river.description}` : ''}`,
        accessLevel: 'public',
        score: 3,
      });
    }

    // Stasiun ARR/AWLR.
    const stations = await this.prisma.station.findMany({
      where: { status: true, publishedAt: { not: null } },
      select: {
        id: true,
        name: true,
        type: true,
        operatorName: true,
        village: true,
        district: true,
        regency: true,
        description: true,
      },
      take: 30,
    });
    for (const station of stations) {
      const typeLabel =
        station.type === 'ARR'
          ? 'ARR (Alat Rekam Hujan)'
          : 'AWLR (Automatic Water Level Recorder)';
      const location = [station.village, station.district, station.regency]
        .filter(Boolean)
        .join(', ');
      push({
        id: `station:${station.id}`,
        title: `Stasiun ${station.name}`,
        content: `Stasiun ${typeLabel} bernama ${station.name}${location ? ` di ${location}` : ''}${station.operatorName ? `, operator ${station.operatorName}` : ''}.${station.description ? ` ${station.description}` : ''}`,
        accessLevel: 'public',
        score: 3,
      });
    }

    // Template berkas rekomtek (kelompok per jenis + jenisPermohonan).
    const templates = await this.prisma.rekomtekBerkasTemplate.findMany({
      orderBy: [
        { jenis: 'asc' },
        { jenisPermohonan: 'asc' },
        { nomorUrut: 'asc' },
      ],
      take: 200,
    });
    const grouped = new Map<string, string[]>();
    for (const template of templates) {
      const key = `${template.jenis}|${template.jenisPermohonan}`;
      const item = `${template.kode}. ${template.uraian}${template.isRequired ? ' (wajib)' : ''}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    for (const [key, items] of grouped) {
      const [jenis, jenisPermohonan] = key.split('|');
      push({
        id: `berkas-template:${key}`,
        title: `Persyaratan Berkas ${jenis} (${jenisPermohonan})`,
        content: `Dokumen yang dibutuhkan untuk pengajuan ${jenis} ${jenisPermohonan}:\n${items.slice(0, 25).join('\n')}`,
        accessLevel: 'public',
        score: 4,
      });
    }

    // Rekomtek terpublikasi.
    const rekomteks = await this.prisma.rekomtek.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        nomor: true,
        judul: true,
        deskripsi: true,
        jenis: true,
      },
      take: 20,
    });
    for (const rekomtek of rekomteks) {
      push({
        id: `rekomtek:${rekomtek.id}`,
        title: `Rekomtek: ${rekomtek.judul}`,
        content: `Rekomendasi teknis ${rekomtek.jenis} nomor ${rekomtek.nomor} dengan judul "${rekomtek.judul}".${rekomtek.deskripsi ? ` ${rekomtek.deskripsi}` : ''}`,
        accessLevel: 'public',
        score: 2,
      });
    }

    // Peta GIS terpublikasi.
    const gisMaps = await this.prisma.gisMap.findMany({
      where: { status: true, publishedAt: { not: null }, hasGeometry: true },
      select: { id: true, name: true, category: true, description: true },
      take: 20,
    });
    for (const map of gisMaps) {
      push({
        id: `gis-map:${map.id}`,
        title: `Peta: ${map.name}`,
        content: `Peta GIS "${map.name}" (kategori ${map.category}).${map.description ? ` ${map.description}` : ''}`,
        accessLevel: 'public',
        score: 2,
      });
    }

    return chunks;
  }

  private mentions(query: string, terms: string[]): boolean {
    return terms.some((term) => query.includes(term));
  }
}
