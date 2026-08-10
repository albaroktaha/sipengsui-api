import type { AccessLevel } from '../guardrails/policy.types';

export type { AccessLevel };

/** Satu unit pengetahuan yang dapat diberikan ke model sebagai konteks. */
export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  updatedAt?: string;
  accessLevel: AccessLevel;
  score?: number;
}
