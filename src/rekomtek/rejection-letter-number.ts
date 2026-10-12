export type RejectionLetterNumberResetRule = 'TAHUNAN' | 'TIDAK_PERNAH';

export interface RenderRejectionLetterNumberInput {
  format: string;
  classificationCode: string;
  agendaScope: string;
  sequence: number;
  date: Date;
}

function yearInJakarta(date: Date): string {
  if (Number.isNaN(date.getTime()))
    throw new Error('Tanggal nomor surat tidak valid');
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).format(date);
}

export function getRejectionLetterPeriodKey(
  resetRule: RejectionLetterNumberResetRule,
  date: Date,
): string {
  if (resetRule === 'TIDAK_PERNAH') return 'TETAP';
  if (resetRule !== 'TAHUNAN')
    throw new Error('Aturan pergantian tahun belum dikonfigurasi');
  return yearInJakarta(date);
}

export function renderRejectionLetterNumber(
  input: RenderRejectionLetterNumberInput,
): string {
  const format = input.format.trim();
  const classificationCode = input.classificationCode.trim();
  const agendaScope = input.agendaScope.trim();
  if (!format || !classificationCode || !agendaScope) {
    throw new Error(
      'Format, kode klasifikasi, dan lingkup agenda resmi wajib dikonfigurasi',
    );
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error('Nomor urut surat harus berupa bilangan bulat positif');
  }
  if (!format.includes('{{sequence}}')) {
    throw new Error('Format nomor surat wajib memuat {{sequence}}');
  }

  const values: Record<string, string> = {
    classification: classificationCode,
    sequence: String(input.sequence),
    year: yearInJakarta(input.date),
    scope: agendaScope,
  };
  const rendered = format.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_match, key: string) => {
      if (!(key in values))
        throw new Error(`Variabel nomor surat tidak dikenal: ${key}`);
      return values[key];
    },
  );
  if (/[{}]/.test(rendered))
    throw new Error(
      'Format nomor surat mengandung kurung variabel yang tidak valid',
    );
  return rendered;
}
