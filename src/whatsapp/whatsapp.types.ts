export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export type WhatsAppMessageKey =
  | 'STAGE_CHANGED'
  | 'CORRECTION_REQUIRED'
  | 'EXPOSE_INVITATION'
  | 'EXPOSE_RESCHEDULED'
  | 'EXPOSE_CANCELLED'
  | 'EXPOSE_REMINDER'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'CONVERSATION_REPLY';

export type WhatsAppProviderErrorKind = 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN';

export interface WhatsAppSendTextInput {
  to: string;
  text: string;
}

export interface WhatsAppProviderSendResult {
  providerMessageId: string;
}

export interface WhatsAppSessionHealth {
  session: string;
  status: string;
  engine: string | null;
  isWorking: boolean;
  reachoutTimelockActive: boolean;
  messageCappingStatus: string | null;
  observedAt: Date;
}

export interface WhatsAppSessionStatusObservation {
  session: string;
  engine?: string;
  status: string;
  data?: unknown;
  timestamp?: Date | null;
}

export interface WhatsAppProviderPort {
  sendText(input: WhatsAppSendTextInput): Promise<WhatsAppProviderSendResult>;
  getSessionHealth(): Promise<WhatsAppSessionHealth>;
  observeSessionStatus(input: WhatsAppSessionStatusObservation): void;
}

export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    readonly kind: WhatsAppProviderErrorKind,
    readonly code: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'WhatsAppProviderError';
  }
}

export interface WhatsAppStageMessageContext {
  applicationNumber: string;
  stageLabel: string;
  nextAction: string;
  applicationUrl: string;
}

export interface WhatsAppExposeMessageContext {
  invitationNumber: string;
  applicationNumber: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  method: string;
  venue?: string | null;
  agenda: string;
  applicationUrl: string;
}

export interface WhatsAppRenderedMessage {
  messageKey: WhatsAppMessageKey;
  messageVersion: string;
  language: string;
  text: string;
}
