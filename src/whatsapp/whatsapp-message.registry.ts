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
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(context.startsAt);
    const zone = context.timeZone === 'Asia/Jakarta' ? 'WIB' : context.timeZone;
    const time = `${this.formatTime(context.startsAt, context.timeZone)}-${this.formatTime(context.endsAt, context.timeZone)} ${zone}`;
    const method = this.exposeMethodLabel(context.method);
    const venue = this.singleLine(context.venue ?? '', 240);
    const agenda = this.singleLine(context.agenda, 300);
    const invitation = this.singleLine(context.invitationNumber, 120);
    const companyName = this.singleLine(context.companyName, 200);
    const url = this.limit(context.applicationUrl, 500);
    const invitationLine = invitation ? [`Nomor undangan: ${invitation}`] : [];
    const venueLine =
      venue && this.exposeMethodHasVenue(context.method)
        ? [`Tempat: ${venue}`]
        : [];
    const agendaLine = agenda ? [`Agenda: ${agenda}`] : [];
    switch (key) {
      case 'EXPOSE_INVITATION':
        return [
          '*Undangan Ekspose*',
          `Pemohon: ${companyName}`,
          ...invitationLine,
          `Tanggal: ${date}`,
          `Waktu: ${time}`,
          `Metode: ${method}`,
          ...venueLine,
          ...agendaLine,
          '',
          'Lihat undangan di SIPENGSUI:',
          url,
        ].join('\n');
      case 'EXPOSE_RESCHEDULED':
        return [
          '*Jadwal Ekspose Diperbarui*',
          `Pemohon: ${companyName}`,
          ...invitationLine,
          `Tanggal: ${date}`,
          `Waktu: ${time}`,
          `Metode: ${method}`,
          ...venueLine,
          ...agendaLine,
          '',
          'Lihat detail undangan di SIPENGSUI:',
          url,
        ].join('\n');
      case 'EXPOSE_CANCELLED':
        return [
          '*Jadwal Ekspose Dibatalkan*',
          `Pemohon: ${companyName}`,
          ...invitationLine,
          `Waktu: ${date}, ${time}`,
          ...(context.cancellationReason?.trim()
            ? [`Alasan: ${this.singleLine(context.cancellationReason, 300)}`]
            : []),
          '',
          'Lihat detail undangan di SIPENGSUI:',
          url,
        ].join('\n');
      case 'EXPOSE_REMINDER':
        return [
          '*Pengingat Ekspose*',
          `Pemohon: ${companyName}`,
          `Tanggal: ${date}`,
          `Waktu: ${time}`,
          `Metode: ${method}`,
          ...venueLine,
          '',
          'Lihat detail undangan di SIPENGSUI:',
          url,
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

  private exposeMethodLabel(method: string): string {
    switch (method) {
      case 'LURING':
        return 'Luring';
      case 'DARING':
        return 'Daring';
      case 'HIBRID':
        return 'Hibrida';
      default:
        return this.singleLine(method, 40);
    }
  }

  private exposeMethodHasVenue(method: string): boolean {
    return method === 'LURING' || method === 'HIBRID';
  }

  private singleLine(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
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
