import { z } from 'zod';

/**
 * Schema awal request chat — validasi struktur kasar sebelum
 * validasi UIMessage lengkap via `validateUIMessages` dari AI SDK.
 */
export const ChatRequestSchema = z.object({
  id: z.string().max(128).optional(),
  messages: z.array(z.unknown()).min(1).max(20),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
