import { Injectable } from '@nestjs/common';

export type WhatsAppMetricName =
  | 'webhook_valid'
  | 'webhook_ignored'
  | 'webhook_replay'
  | 'webhook_auth_failed'
  | 'session_status'
  | 'session_disconnect'
  | 'session_reconnect'
  | 'session_timelock'
  | 'session_capping'
  | 'provider_health_error'
  | 'outbox_claimed'
  | 'outbox_attempt'
  | 'outbox_deferred'
  | 'outbox_dead'
  | 'outbox_send_success'
  | 'outbox_send_failure'
  | 'delivery_ack'
  | 'pairing_success'
  | 'pairing_failure'
  | 'consent_opt_in'
  | 'consent_opt_out'
  | 'inbound_processed'
  | 'inbound_failed';

@Injectable()
export class WhatsAppMetricsService {
  private readonly counters = new Map<WhatsAppMetricName, number>();
  private processingCount = 0;
  private processingTotalMs = 0;
  private processingMaxMs = 0;

  increment(name: WhatsAppMetricName, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observeInboundProcessing(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.processingCount += 1;
    this.processingTotalMs += durationMs;
    this.processingMaxMs = Math.max(this.processingMaxMs, durationMs);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(
        [...this.counters.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      inboundProcessing: {
        count: this.processingCount,
        averageMs:
          this.processingCount > 0
            ? Math.round(this.processingTotalMs / this.processingCount)
            : 0,
        maxMs: this.processingMaxMs,
      },
    };
  }
}
