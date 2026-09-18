import { RekomtekStatus, RekomtekWorkflowStage } from '@prisma/client';

export const WORKFLOW_STAGE_LABELS: Record<RekomtekWorkflowStage, string> = {
  PEMOHON_DRAFT: 'Draft Pemohon',
  MENUNGGU_PENUNJUKAN_POKJA: 'Menunggu Penunjukan Pokja',
  EVALUASI_DOKUMEN_AWAL: 'Evaluasi Dokumen Awal',
  PERBAIKAN_AWAL_PEMOHON: 'Perbaikan Dokumen Awal oleh Pemohon',
  EVALUASI_DOKUMEN_ULANG: 'Evaluasi Dokumen Ulang',
  PENYUSUNAN_SURAT_PENOLAKAN: 'Penyusunan Surat Penolakan',
  DITOLAK: 'Ditolak',
  MENUNGGU_JADWAL_EKSPOSE: 'Menunggu Jadwal Ekspose',
  EKSPOSE_TERJADWAL: 'Ekspose Terjadwal',
  MENUNGGU_BA_EKSPOSE: 'Menunggu Berita Acara Ekspose',
  VERIFIKASI_HASIL_EKSPOSE: 'Verifikasi Hasil Ekspose',
  PERBAIKAN_PASCA_EKSPOSE: 'Perbaikan Pasca-Ekspose',
  VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE: 'Verifikasi Perbaikan Pasca-Ekspose',
  MENUNGGU_SPT_LAPANGAN: 'Menunggu SPT Lapangan',
  KUNJUNGAN_LAPANGAN_DITUGASKAN: 'Kunjungan Lapangan Ditugaskan',
  MENUNGGU_BA_LAPANGAN: 'Menunggu Berita Acara Lapangan',
  PERSIAPAN_SIDANG_REKOMTEK: 'Persiapan Sidang Rekomtek',
  MENUNGGU_BA_SIDANG_REKOMTEK: 'Menunggu Berita Acara Sidang Rekomtek',
  PENYUSUNAN_HASIL_REKOMTEK: 'Penyusunan Hasil Rekomtek',
  PEMERIKSAAN_PEJABAT: 'Pemeriksaan Pejabat Rekomtek',
  MENUNGGU_PERSETUJUAN_ATASAN: 'Menunggu Persetujuan Atasan Pejabat',
  DISETUJUI_ATASAN: 'Disetujui Atasan Pejabat',
  DOKUMEN_REKOMTEK_TERBIT: 'Dokumen Rekomtek Terbit',
};

export const WORKFLOW_STAGE_PROJECTION: Record<
  RekomtekWorkflowStage,
  RekomtekStatus
> = {
  PEMOHON_DRAFT: RekomtekStatus.DRAFT,
  MENUNGGU_PENUNJUKAN_POKJA: RekomtekStatus.REVIEW,
  EVALUASI_DOKUMEN_AWAL: RekomtekStatus.REVIEW,
  PERBAIKAN_AWAL_PEMOHON: RekomtekStatus.DRAFT,
  EVALUASI_DOKUMEN_ULANG: RekomtekStatus.REVIEW,
  PENYUSUNAN_SURAT_PENOLAKAN: RekomtekStatus.REJECTED,
  DITOLAK: RekomtekStatus.REJECTED,
  MENUNGGU_JADWAL_EKSPOSE: RekomtekStatus.REVIEW,
  EKSPOSE_TERJADWAL: RekomtekStatus.REVIEW,
  MENUNGGU_BA_EKSPOSE: RekomtekStatus.REVIEW,
  VERIFIKASI_HASIL_EKSPOSE: RekomtekStatus.REVIEW,
  PERBAIKAN_PASCA_EKSPOSE: RekomtekStatus.DRAFT,
  VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE: RekomtekStatus.REVIEW,
  MENUNGGU_SPT_LAPANGAN: RekomtekStatus.REVIEW,
  KUNJUNGAN_LAPANGAN_DITUGASKAN: RekomtekStatus.REVIEW,
  MENUNGGU_BA_LAPANGAN: RekomtekStatus.REVIEW,
  PERSIAPAN_SIDANG_REKOMTEK: RekomtekStatus.REVIEW,
  MENUNGGU_BA_SIDANG_REKOMTEK: RekomtekStatus.REVIEW,
  PENYUSUNAN_HASIL_REKOMTEK: RekomtekStatus.REVIEW,
  PEMERIKSAAN_PEJABAT: RekomtekStatus.REVIEW,
  MENUNGGU_PERSETUJUAN_ATASAN: RekomtekStatus.REVIEW,
  DISETUJUI_ATASAN: RekomtekStatus.APPROVED,
  DOKUMEN_REKOMTEK_TERBIT: RekomtekStatus.PUBLISHED,
};

export const WORKFLOW_TRANSITIONS: Record<
  RekomtekWorkflowStage,
  readonly RekomtekWorkflowStage[]
> = {
  PEMOHON_DRAFT: ['MENUNGGU_PENUNJUKAN_POKJA'],
  MENUNGGU_PENUNJUKAN_POKJA: ['EVALUASI_DOKUMEN_AWAL'],
  EVALUASI_DOKUMEN_AWAL: ['PERBAIKAN_AWAL_PEMOHON', 'MENUNGGU_JADWAL_EKSPOSE'],
  PERBAIKAN_AWAL_PEMOHON: ['EVALUASI_DOKUMEN_ULANG'],
  EVALUASI_DOKUMEN_ULANG: [
    'MENUNGGU_JADWAL_EKSPOSE',
    'PENYUSUNAN_SURAT_PENOLAKAN',
  ],
  PENYUSUNAN_SURAT_PENOLAKAN: ['DITOLAK'],
  DITOLAK: [],
  MENUNGGU_JADWAL_EKSPOSE: ['EKSPOSE_TERJADWAL'],
  EKSPOSE_TERJADWAL: ['MENUNGGU_BA_EKSPOSE', 'MENUNGGU_JADWAL_EKSPOSE'],
  MENUNGGU_BA_EKSPOSE: ['VERIFIKASI_HASIL_EKSPOSE'],
  VERIFIKASI_HASIL_EKSPOSE: [
    'MENUNGGU_SPT_LAPANGAN',
    'PERBAIKAN_PASCA_EKSPOSE',
  ],
  PERBAIKAN_PASCA_EKSPOSE: ['VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE'],
  VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE: [
    'MENUNGGU_SPT_LAPANGAN',
    'PERBAIKAN_PASCA_EKSPOSE',
  ],
  MENUNGGU_SPT_LAPANGAN: ['KUNJUNGAN_LAPANGAN_DITUGASKAN'],
  KUNJUNGAN_LAPANGAN_DITUGASKAN: ['MENUNGGU_BA_LAPANGAN'],
  MENUNGGU_BA_LAPANGAN: ['PERSIAPAN_SIDANG_REKOMTEK'],
  PERSIAPAN_SIDANG_REKOMTEK: ['MENUNGGU_BA_SIDANG_REKOMTEK'],
  MENUNGGU_BA_SIDANG_REKOMTEK: ['PENYUSUNAN_HASIL_REKOMTEK'],
  PENYUSUNAN_HASIL_REKOMTEK: ['PEMERIKSAAN_PEJABAT'],
  PEMERIKSAAN_PEJABAT: [
    'PENYUSUNAN_HASIL_REKOMTEK',
    'MENUNGGU_PERSETUJUAN_ATASAN',
  ],
  MENUNGGU_PERSETUJUAN_ATASAN: [
    'PENYUSUNAN_HASIL_REKOMTEK',
    'DISETUJUI_ATASAN',
  ],
  DISETUJUI_ATASAN: ['DOKUMEN_REKOMTEK_TERBIT'],
  DOKUMEN_REKOMTEK_TERBIT: [],
};

export const TERMINAL_WORKFLOW_STAGES = new Set<RekomtekWorkflowStage>([
  RekomtekWorkflowStage.DITOLAK,
  RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT,
]);

export function projectWorkflowStatus(
  stage: RekomtekWorkflowStage,
): RekomtekStatus {
  return WORKFLOW_STAGE_PROJECTION[stage];
}

export function assertWorkflowTransition(
  from: RekomtekWorkflowStage,
  to: RekomtekWorkflowStage,
): void {
  if (!WORKFLOW_TRANSITIONS[from].includes(to)) {
    throw new Error(`Transisi workflow tidak diizinkan: ${from} -> ${to}`);
  }
}

export function isApplicantStage(stage: RekomtekWorkflowStage): boolean {
  return (
    stage === RekomtekWorkflowStage.PEMOHON_DRAFT ||
    stage === RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON ||
    stage === RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE
  );
}
