import { Injectable, Logger } from '@nestjs/common';

interface CompletionEvent {
  channel?: string;
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
    const { channel, userId, sourceIds, usage, latencyMs } = event;
    this.logger.log(
      `[AI] Completion channel=${channel ?? 'WEB'} userId=${userId ?? 'guest'} sources=${sourceIds.length} ` +
        `tokens=${usage?.totalTokens ?? 'n/a'} latencyMs=${latencyMs ?? 'n/a'}`,
    );
  }

  recordProviderError(event: ProviderErrorEvent): void {
    const category =
      event.error instanceof Error
        ? event.error.name
        : 'UNKNOWN_PROVIDER_ERROR';
    this.logger.error(`[AI] Provider error category=${category}`);
  }

  recordPolicyBlock(reason: string): void {
    this.logger.warn(`[AI] Policy block: ${reason}`);
  }
}
