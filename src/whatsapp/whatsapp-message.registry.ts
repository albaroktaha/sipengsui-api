import { Injectable } from '@nestjs/common';
import { WhatsAppConfig } from './whatsapp.config';
import type {
  WhatsAppExposeMessageContext,
  WhatsAppMessageKey,
  WhatsAppRenderedMessage,
  WhatsAppStageMessageContext,
} from './whatsapp.types';

@Injectable()
export class WhatsAppMessageRegistry {
  constructor(private readonly config: WhatsAppConfig) {}

  resolve(
    key: WhatsAppMessageKey,
    context: WhatsAppStageMessageContext | WhatsAppExposeMessageContext,
  ): WhatsAppRenderedMessage | null {
    const text = this.isStageContext(context)
      ? this.renderStage(key, context)
      : this.renderExpose(key, context);
    if (!text) return null;
    return {
      messageKey: key,
      messageVersion: this.config.messageVersion(key),
      language: this.config.defaultLanguage,
      text: text.slice(0, 4_000),
    };
  }

  private renderStage(
    key: WhatsAppMessageKey,
    context: WhatsAppStageMessageContext,
  ): string | null {
    const number = this.limit(context.applicationNumber, 120);
    const stage = this.limit(context.stageLabel, 160);
    const nextAction = this.limit(context.nextAction, 240);
    const url = this.limit(context.applicationUrl, 500);
    switch (key) {
      case 'STAGE_CHANGED':
        return `Permohonan Rekomtek ${number} memasuki tahap ${stage}. Tindakan berikutnya: ${nextAction}. Buka SIPENGSUI: ${url}`;
      case 'CORRECTION_REQUIRED':
        return `Permohonan Rekomtek ${number} memerlukan Perbaikan Dokumen Awal. Silakan buka SIPENGSUI untuk melihat catatan dan tindakan berikutnya: ${url}`;
      case 'REJECTED':
        return `Permohonan Rekomtek ${number} telah ditolak. Silakan masuk ke SIPENGSUI untuk melihat hasil dan Surat Penolakan: ${url}`;
      case 'PUBLISHED':
        return `Dokumen Rekomtek untuk permohonan ${number} telah diterbitkan. Silakan buka SIPENGSUI: ${url}`;
      default:
        return null;
    }
  }

  private renderExpose(
    key: WhatsAppMessageKey,
    context: WhatsAppExposeMessageContext,
  ): string | null {
    const date = new Intl.DateTimeFormat('id-ID', {
      timeZone: context.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(context.startsAt);
    const zone = context.timeZone === 'Asia/Jakarta' ? 'WIB' : context.timeZone;
    const time = `${this.formatTime(context.startsAt, context.timeZone)}–${this.formatTime(context.endsAt, context.timeZone)} ${zone}`;
    const method = this.limit(context.method, 40);
    const venue = this.limit(context.venue?.trim() || '—', 240);
    const agenda = this.limit(context.agenda, 300);
    const invitation = this.limit(context.invitationNumber, 120);
    const companyName = this.limit(context.companyName, 200);
    const url = this.limit(context.applicationUrl, 500);
    switch (key) {
      case 'EXPOSE_INVITATION':
        return [
          `Undangan Ekspose ${invitation} untuk Permohonan Rekomtek ${companyName},`,
          `Waktu: ${date}, ${time}`,
          `Metode: ${method}`,
          `Tempat: ${venue}`,
          `Agenda: ${agenda}`,
          `Buka detail undangan di SIPENGSUI: ${url}`,
        ].join('\n');
      case 'EXPOSE_RESCHEDULED':
        return [
          `Jadwal Ekspose untuk Permohonan Rekomtek ${companyName} telah diperbarui.`,
          `Waktu: ${date}, ${time}`,
          `Metode: ${method}`,
          `Tempat: ${venue}`,
          `Agenda: ${agenda}`,
          `Buka detail undangan di SIPENGSUI: ${url}`,
        ].join('\n');
      case 'EXPOSE_CANCELLED':
        return [
          `Jadwal Ekspose untuk Permohonan Rekomtek ${companyName} telah dibatalkan.`,
          ...(context.cancellationReason?.trim()
            ? [`Alasan: ${this.limit(context.cancellationReason, 300)}`]
            : []),
          `Buka detail undangan di SIPENGSUI: ${url}`,
        ].join('\n');
      case 'EXPOSE_REMINDER':
        return [
          `Pengingat: Ekspose Permohonan Rekomtek ${companyName}`,
          `Waktu: ${date}, ${time}`,
          `Metode: ${method}`,
          `Tempat: ${venue}`,
          `Buka detail undangan di SIPENGSUI: ${url}`,
        ].join('\n');
      default:
        return null;
    }
  }

  private formatTime(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  private limit(value: string, max: number): string {
    return value.trim().slice(0, max);
  }

  private isStageContext(
    context: WhatsAppStageMessageContext | WhatsAppExposeMessageContext,
  ): context is WhatsAppStageMessageContext {
    return 'stageLabel' in context;
  }
}
