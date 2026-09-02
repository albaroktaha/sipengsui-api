import { RekomtekStatus, RekomtekWorkflowStage } from '@prisma/client';
import {
  assertWorkflowTransition,
  projectWorkflowStatus,
  WORKFLOW_TRANSITIONS,
} from './workflow-state';

describe('rekomtek workflow state machine', () => {
  it('contains the complete happy-path transition chain', () => {
    const happyPath: RekomtekWorkflowStage[] = [
      RekomtekWorkflowStage.PEMOHON_DRAFT,
      RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA,
      RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
      RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
      RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
      RekomtekWorkflowStage.MENUNGGU_BA_EKSPOSE,
      RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE,
      RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN,
      RekomtekWorkflowStage.KUNJUNGAN_LAPANGAN_DITUGASKAN,
      RekomtekWorkflowStage.MENUNGGU_BA_LAPANGAN,
      RekomtekWorkflowStage.PERSIAPAN_SIDANG_REKOMTEK,
      RekomtekWorkflowStage.MENUNGGU_BA_SIDANG_REKOMTEK,
      RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK,
      RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT,
      RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN,
      RekomtekWorkflowStage.DISETUJUI_ATASAN,
      RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT,
    ];

    for (let index = 1; index < happyPath.length; index += 1) {
      expect(() =>
        assertWorkflowTransition(happyPath[index - 1], happyPath[index]),
      ).not.toThrow();
    }

    expect(projectWorkflowStatus(RekomtekWorkflowStage.PEMOHON_DRAFT)).toBe(
      RekomtekStatus.DRAFT,
    );
    expect(
      projectWorkflowStatus(RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN),
    ).toBe(RekomtekStatus.REJECTED);
    expect(projectWorkflowStatus(RekomtekWorkflowStage.DISETUJUI_ATASAN)).toBe(
      RekomtekStatus.APPROVED,
    );
    expect(
      projectWorkflowStatus(RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT),
    ).toBe(RekomtekStatus.PUBLISHED);
  });

  it('rejects bypassing the initial correction and terminal stages', () => {
    expect(() =>
      assertWorkflowTransition(
        RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
        RekomtekWorkflowStage.EVALUASI_DOKUMEN_ULANG,
      ),
    ).toThrow('Transisi workflow tidak diizinkan');
    expect(WORKFLOW_TRANSITIONS[RekomtekWorkflowStage.DITOLAK]).toEqual([]);
    expect(
      WORKFLOW_TRANSITIONS[RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT],
    ).toEqual([]);
  });

  it('keeps post-expose corrections separate from the initial counter', () => {
    expect(
      WORKFLOW_TRANSITIONS[RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE],
    ).toContain(RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE);
    expect(
      WORKFLOW_TRANSITIONS[
        RekomtekWorkflowStage.VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE
      ],
    ).toContain(RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN);
  });
});
