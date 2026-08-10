import { Injectable } from '@nestjs/common';
import type { KnowledgeChunk } from './knowledge.types';
import type { KnowledgeRetriever } from './knowledge-retriever.interface';

/**
 * Knowledge base statis berisi konten resmi SIPENGSUI yang disetujui.
 * Tidak mengandung jawaban faktual palsu sebagai placeholder.
 */
@Injectable()
export class StaticKnowledgeService implements KnowledgeRetriever {
  private readonly chunks: KnowledgeChunk[] = [
    {
      id: 'about-sipengsui',
      title: 'Tentang SIPENGSUI',
      content:
        'SIPENGSUI v2.0 adalah platform terpadu untuk pengelolaan data observasi hidrologi di Indonesia — memantau curah hujan, tinggi muka air, dan debit sungai secara real-time.\n\nHirarki data: Wilayah Sungai → Daerah Aliran Sungai (DAS) → Sungai → Stasiun (ARR/AWLR) → Data Observasi.\n\nJumlah wilayah sungai, DAS, sungai, dan stasiun yang tersedia dapat dilihat dari data statistik terbaru aplikasi, bukan dari angka tetap.',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-features',
      title: 'Fitur Utama SIPENGSUI',
      content:
        'Fitur utama SIPENGSUI:\n• Dashboard Interaktif — statistik ringkasan, grafik distribusi, data terbaru\n• GIS Map — peta interaktif dengan layer stasiun, sungai, DAS\n• Import Excel — import massal ARR & AWLR dengan deteksi otomatis\n• Manajemen Stasiun — kelola stasiun ARR (curah hujan) dan AWLR (tinggi muka air)\n• Data Observasi — pencatatan curah hujan, tinggi muka air, debit\n• Rekomtek — penerbitan rekomendasi teknis dengan workflow Draft→Review→Approve→Reject/Publish\n• Pelaporan Bencana — lapor kejadian banjir, longsor, kekeringan, dll.\n• Manajemen Pengguna & RBAC — role-based access control',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-station-types',
      title: 'Jenis Stasiun',
      content:
        'SIPENGSUI memiliki 2 jenis stasiun:\n• ARR (Alat Rekam Hujan) — mencatat curah hujan\n• AWLR (Automatic Water Level Recorder) — mencatat tinggi muka air & debit',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-rekomtek',
      title: 'Rekomendasi Teknis (Rekomtek)',
      content:
        'Rekomtek adalah rekomendasi teknis yang diterbitkan SIPENGSUI melalui alur kerja: Pemohon → Dinas SDA → Evaluasi Kelengkapan Dokumen → Ekspose → Kajian & Evaluasi Teknis → Tinjauan Lapangan → Rapat Pembahasan → Draft Final Rekomtek (MS/TMS). Proses melibatkan Kepala Dinas SDA Provinsi, Kepala Bidang P/SA, dan Tim Teknis. Terdapat tahapan perbaikan dokumen bila tidak memenuhi persyaratan.',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-disaster-report',
      title: 'Pelaporan Bencana',
      content:
        'Masyarakat dapat melaporkan kejadian bencana (banjir, gempa, longsor, kekeringan, angin topan, kebakaran hutan, gelombang pasang) melalui menu Pelaporan Bencana di SIPENGSUI. Laporan mencakup jenis bencana, deskripsi, lokasi, dan tingkat keparahan.',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-contact',
      title: 'Kontak Resmi',
      content:
        'Kontak resmi SIPENGSUI: Email support@sipengsui.go.id, Telepon (021) 1234-5678.',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-dashboard',
      title: 'Dashboard SIPENGSUI',
      content:
        'Dashboard SIPENGSUI menampilkan statistik ringkasan: jumlah wilayah sungai, DAS, sungai, stasiun, observasi, serta pembagian stasiun ARR dan AWLR. Data dapat dilihat berdasarkan wilayah dan periode.',
      accessLevel: 'public',
    },
    {
      id: 'sipengsui-import',
      title: 'Import Data Excel',
      content:
        'SIPENGSUI mendukung import massal data observasi ARR & AWLR melalui file Excel dengan alur Upload → Preview → Draft → Confirm. Kesalahan pada file ditangkap dan dilaporkan untuk diperbaiki.',
      accessLevel: 'public',
    },
  ];

  search(
    query: string,
    options?: { limit?: number; userId?: string; roles?: string[] },
  ): Promise<KnowledgeChunk[]> {
    const limit = options?.limit ?? 5;
    const normalized = query.toLowerCase().trim();

    const scored = this.chunks
      .filter((chunk) => chunk.accessLevel === 'public')
      .map((chunk) => {
        const haystack = `${chunk.title} ${chunk.content}`.toLowerCase();
        let score = 0;

        // Cocokkan kata-kata penting dari query.
        const terms = normalized
          .split(/\s+/)
          .filter((term) => term.length >= 3);
        for (const term of terms) {
          if (haystack.includes(term)) score += 2;
        }

        // Cocokkan frasa domain yang relevan.
        const keywords = [
          'fitur',
          'stasiun',
          'arr',
          'awlr',
          'rekomtek',
          'rekomendasi',
          'banjir',
          'bencana',
          'lapor',
          'dashboard',
          'import',
          'excel',
          'kontak',
          'email',
          'telepon',
          'curah hujan',
          'debit',
          'wilayah sungai',
          'das',
          'permintaan data',
        ];
        for (const keyword of keywords) {
          if (haystack.includes(keyword)) score += 1;
        }

        return { chunk, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return Promise.resolve(
      scored.map(({ chunk, score }) => ({ ...chunk, score })),
    );
  }
}
