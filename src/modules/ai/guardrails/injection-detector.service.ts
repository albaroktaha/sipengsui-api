import { Injectable } from '@nestjs/common';
import type { InjectionAnalysis, RiskLevel } from './policy.types';

interface RiskPattern {
  category: string;
  weight: number;
  patterns: RegExp[];
}

/**
 * Detektor prompt injection berbasis skor risiko (bukan boolean dari satu keyword).
 * Keyword hanya sinyal awal — evaluasi konteks tetap dilakukan oleh input policy.
 */
@Injectable()
export class InjectionDetectorService {
  private readonly patterns: RiskPattern[] = [
    {
      category: 'ignore-rules',
      weight: 3,
      patterns: [
        /abaikan (semua )?(instruksi|aturan|perintah) (sebelumnya|di atas|anda|kamu)/i,
        /lupakan (semua )?(instruksi|aturan|perintah)/i,
        /ignore (all )?(previous|prior|above|your) (instructions?|rules?|prompts?)/i,
        /forget (all )?(your )?(instructions?|rules?|training)/i,
        /override (system )?prompt/i,
        /system\s*(:|prompt|message)[:\s]*/i,
        /<<SYS>>|<<\/SYS>>/,
      ],
    },
    {
      category: 'reveal-prompt',
      weight: 3,
      patterns: [
        /(tampilkan|bocorkan|sebutkan|reveal|show|print|dump).*(system|developer) prompt/i,
        /(system|developer) prompt.*(tampilkan|bocorkan|reveal|show|print|dump)/i,
        /(what is|tuliskan|outputkan).*(system|developer) prompt/i,
      ],
    },
    {
      category: 'secret-extraction',
      weight: 3,
      patterns: [
        /(api[\s_-]?key|environment variables?|secret|credential|password|token)/i,
        /(gemini_api_key|google_generative_ai_api_key|jwt_secret)/i,
        /(buka|read|show|tampilkan).*(\.env|environment|config)/i,
      ],
    },
    {
      category: 'admin-impersonation',
      weight: 2,
      patterns: [
        /(anggap|anggap saja|pretend|assume).*(administrator|admin|superuser|super admin|root)/i,
        /(saya|aku) (adalah|sebagai) (administrator|admin)/i,
        /you are now (a )?(different|new|another) (ai|bot|assistant)/i,
        /pretend you are/i,
        /act as (if you are|a different)/i,
      ],
    },
    {
      category: 'code-execution',
      weight: 3,
      patterns: [
        /(jalankan|eksekusi|execute|run).*(shell|terminal|sql|command|script|code)/i,
        /\b(drop table|delete from|insert into|update\s+\w+\s+set)\b/i,
        /\b(sql\s*injection|xss|csrf|ddos|malware|exploit|hack|crack)\b/i,
        /(jailbreak|bypass (safety|security)|unrestricted mode)/i,
        /(jalankan|eksekusi|run|execute)\s+(drop|delete|insert|update|select|truncate|alter)/i,
      ],
    },
    {
      category: 'encoded-instruction',
      weight: 2,
      patterns: [/base64|btoa|atob|hex\s+decode|rot13|obfuscate/i],
    },
    {
      category: 'document-instruction',
      weight: 2,
      patterns: [
        /(ikuti|ikuti) (instruksi|perintah) (rahasia|tersembunyi|dalam)/i,
        /(ignore|abaikan).*(content|isi|teks|dokumen) (dan|yang) (ikuti|ikuti saja|ikutilah)/i,
      ],
    },
    {
      category: 'knowledge-export',
      weight: 2,
      patterns: [
        /(ekspor|export|dump|print|cetak|tulis).*(semua|entire|whole|lengkap|seluruh).*(knowledge|pengetahuan|database|data|isi)/i,
        /(knowledge base|basis pengetahuan).*(lengkap|semua|entire)/i,
      ],
    },
  ];

  /**
   * Menganalisis teks dan menghasilkan skor risiko.
   * Pertanyaan edukatif ("apa itu prompt injection?") tidak terhitung berisiko
   * karena tidak cocok dengan pola perintah.
   */
  analyze(text: string): InjectionAnalysis {
    const normalized = text.toLowerCase();
    let score = 0;
    const matchedCategories: string[] = [];

    for (const group of this.patterns) {
      const matched = group.patterns.some((pattern) =>
        pattern.test(normalized),
      );
      if (matched) {
        score += group.weight;
        matchedCategories.push(group.category);
      }
    }

    let riskLevel: RiskLevel = 'low';
    if (score >= 3) riskLevel = 'high';
    else if (score >= 2) riskLevel = 'medium';

    return { riskLevel, matchedCategories };
  }
}
