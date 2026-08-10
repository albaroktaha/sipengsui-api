import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

interface CompletionEvent {
  userId?: string;
  sourceIds: string[];
  usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
}

interface ProviderErrorEvent {
  error: unknown;
}

/**
 * Logging audit untuk panggilan AI.
 * Tidak pernah mencatat API key, cookie, token, atau isi prompt/response mentah.
 */
@Injectable()
export class AiAuditService {
  private readonly logger = new Logger('AiAudit');

  recordCompletion(event: CompletionEvent): void {
    const { userId, sourceIds, usage, latencyMs } = event;
    this.logger.log(
      `[AI] Completion userId=${userId ?? 'guest'} sources=${sourceIds.length} ` +
        `tokens=${usage?.totalTokens ?? 'n/a'} latencyMs=${latencyMs ?? 'n/a'}`,
    );
  }

  recordProviderError(event: ProviderErrorEvent): void {
    const message =
      event.error instanceof Error ? event.error.message : String(event.error);
    this.logger.error(`[AI] Provider error: ${message}`);
  }

  recordPolicyBlock(reason: string): void {
    this.logger.warn(`[AI] Policy block: ${reason}`);
  }
}
