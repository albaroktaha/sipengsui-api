import { Injectable } from '@nestjs/common';
import { createUIMessageStream, type UIMessageChunk } from 'ai';

const SECRET_PATTERNS: RegExp[] = [
  /(api[\s_-]?key|GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|JWT_SECRET|password|token)\s*[:=]\s*\S+/i,
  /AIza[0-9A-Za-z_-]{20,}/i,
];

const HTML_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /onerror\s*=/i,
  /javascript\s*:/i,
  /<iframe[\s>]/i,
];

/** Pesan aman yang ditampilkan ketika output ditolak. */
const OUTPUT_BLOCK_MESSAGE =
  'Maaf, saya tidak dapat memberikan respons untuk pertanyaan tersebut. Silakan ajukan pertanyaan lain seputar SIPENGSUI dan hidrologi.';

const SAFETY_BLOCK_MESSAGE =
  'Maaf, jawaban tidak dapat ditampilkan karena memicu filter keamanan. Silakan ajukan pertanyaan lain seputar SIPENGSUI.';

@Injectable()
export class OutputPolicyService {
  /**
   * Memeriksa finish reason dan teks output untuk pola berbahaya.
   * Digunakan pada strategi non-streaming / setelah stream selesai.
   */
  checkFinish(reason: string, text?: string): boolean {
    if (reason === 'content-filter') return false;

    if (text) {
      if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) return false;
      if (HTML_PATTERNS.some((pattern) => pattern.test(text))) return false;
      if (text.length > 4000) return false;
    }

    return true;
  }

  /** Pesan aman untuk finish reason content-filter. */
  safetyBlockMessage(): string {
    return SAFETY_BLOCK_MESSAGE;
  }

  /** Pesan baku untuk jawaban yang diblokir output policy. */
  outputBlockMessage(): string {
    return OUTPUT_BLOCK_MESSAGE;
  }

  /**
   * Membuat UI message stream statis untuk jawaban penolakan/fallback.
   * Mengembalikan ReadableStream<UIMessageChunk> yang siap di-pipe.
   */
  createStaticStream(message: string): ReadableStream<UIMessageChunk> {
    return createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({ type: 'text-start', id: 'static-1' });
        writer.write({ type: 'text-delta', id: 'static-1', delta: message });
        writer.write({ type: 'text-end', id: 'static-1' });
        writer.write({ type: 'finish', finishReason: 'stop' });
      },
    });
  }
}
