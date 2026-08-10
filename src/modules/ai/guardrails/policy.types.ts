import type { UIMessage } from 'ai';

export type RiskLevel = 'low' | 'medium' | 'high';

export type AccessLevel = 'public' | 'authenticated' | 'internal';

/** Hasil evaluasi policy gabungan (input policy). */
export interface PolicyDecision {
  allowed: boolean;
  /** Pesan aman untuk ditampilkan bila request ditolak. */
  safeMessage?: string;
  riskLevel: RiskLevel;
  /** Pertanyaan yang sudah dinormalisasi. */
  normalizedQuestion: string;
  /** Diketahui bila request membawa token autentikasi. */
  userId?: string;
  roles?: string[];
}

/** Hasil deteksi prompt injection. */
export interface InjectionAnalysis {
  riskLevel: RiskLevel;
  matchedCategories: string[];
}

/** Hasil evaluasi topik. */
export interface TopicEvaluation {
  allowed: boolean;
  confidence: 'high' | 'medium' | 'low';
  matchedTopics: string[];
}

/** Hasil validasi request chat. */
export interface ValidatedChatRequest {
  messages: UIMessage[];
  question: string;
}
