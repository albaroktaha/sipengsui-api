import type { KnowledgeChunk } from './knowledge.types';

/**
 * Kontrak retriever knowledge base untuk chatbot SIPENGSUI.
 */
export interface KnowledgeRetriever {
  search(
    query: string,
    options?: {
      limit?: number;
      userId?: string;
      roles?: string[];
    },
  ): Promise<KnowledgeChunk[]>;
}
