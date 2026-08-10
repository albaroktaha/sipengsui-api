import { Injectable } from '@nestjs/common';
import type { TopicEvaluation } from './policy.types';

/**
 * Pembatasan topik — memastikan pertanyaan tetap dalam domain
 * SIPENGSUI dan sumber daya air. Permintaan di luar domain diarahkan kembali.
 */
@Injectable()
export class TopicPolicyService {
  private readonly domainTerms: string[] = [
    'sipengsui',
    'hidrologi',
    'sungai',
    'daerah aliran sungai',
    'das',
    'wilayah sungai',
    'ws',
    'stasiun',
    'arr',
    'awlr',
    'curah hujan',
    'tinggi muka air',
    'tma',
    'debit',
    'kualitas air',
    'air tanah',
    'banjir',
    'kekeringan',
    'longsor',
    'rekomtek',
    'rekomendasi teknis',
    'permohonan data',
    'data observasi',
    'observasi',
    'import',
    'excel',
    'dashboard',
    'gis',
    'peta',
    'lapor bencana',
    'pelaporan bencana',
    'bencana',
    'rekomendasi',
    'izin',
    'perizinan',
    'kontak',
    'support',
    'bantuan',
    'fitur',
    'login',
    'daftar',
    'pengguna',
    'role',
    'peran',
    'permintaan',
    'layanan',
    'dokumen',
    'berkas',
    'monitoring',
    'pemantauan',
    'pengelolaan',
    'pengolahan',
    'sumber daya air',
    'sda',
    'pengamat',
    'petugas',
    'wilayah',
    'provinsi',
    'kabupaten',
    'kota',
    'stasiun hujan',
    'stasiun air',
    'info',
    'informasi',
  ];

  private readonly offTopicTerms: string[] = [
    'politik',
    'pemilu',
    'presiden',
    'prabowo',
    'jokowi',
    'partai',
    'agama',
    'sara',
    'porno',
    'seks',
    'bokep',
    'narkoba',
    'sabu',
    'resep makanan',
    'memasak',
    'film',
    'musik',
    'sepak bola',
    'olahraga',
    'game',
    'trading',
    'saham',
    'kripto',
    'bitcoin',
    'perang',
    'esai politik',
    'puisi',
    'cerpen',
    'novel',
    'astronomi',
  ];

  /** Sapaan singkat yang tidak perlu diarahkan. */
  private readonly greetings = [
    'halo',
    'hai',
    'hi',
    'hello',
    'hallo',
    'apa kabar',
    'terima kasih',
    'thanks',
    'thank you',
    'selamat pagi',
    'selamat siang',
    'selamat sore',
    'selamat malam',
    'good morning',
    'good afternoon',
    'good evening',
    'assalamualaikum',
    'permisi',
    'test',
    'tes',
    'coba',
  ];

  evaluate(question: string): TopicEvaluation {
    const normalized = question.toLowerCase().trim();
    const matchedTopics: string[] = [];
    let domainHits = 0;

    for (const term of this.domainTerms) {
      if (normalized.includes(term)) {
        domainHits++;
        matchedTopics.push(term);
      }
    }

    let offTopicHits = 0;
    for (const term of this.offTopicTerms) {
      if (normalized.includes(term)) {
        offTopicHits++;
      }
    }

    // Pertanyaan yang menyebut istilah domain → diizinkan.
    if (domainHits > 0 && offTopicHits === 0) {
      return {
        allowed: true,
        confidence: domainHits >= 2 ? 'high' : 'medium',
        matchedTopics,
      };
    }

    // Pertanyaan ambigu (domain + di luar domain) → arahkan kembali.
    if (domainHits > 0 && offTopicHits > 0) {
      return { allowed: false, confidence: 'medium', matchedTopics };
    }

    // Sapaan singkat → diizinkan (system prompt tetap menjaga cakupan).
    if (domainHits === 0 && offTopicHits === 0 && this.isGreeting(normalized)) {
      return { allowed: true, confidence: 'low', matchedTopics };
    }

    // Pertanyaan tanpa istilah domain → arahkan kembali.
    return {
      allowed: false,
      confidence: offTopicHits > 0 ? 'high' : 'low',
      matchedTopics,
    };
  }

  private isGreeting(normalized: string): boolean {
    return (
      normalized.length <= 40 &&
      this.greetings.some((greeting) => normalized.includes(greeting))
    );
  }
}
