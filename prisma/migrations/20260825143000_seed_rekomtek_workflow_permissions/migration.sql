-- Make workflow permissions available without running the destructive development seed.
INSERT INTO "Permission" ("id", "slug", "name", "group", "createdAt", "updatedAt")
VALUES
  (md5('rekomtek.workflow.read')::uuid, 'rekomtek.workflow.read', 'Lihat antrean dan audit workflow Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.workflow.migrate')::uuid, 'rekomtek.workflow.migrate', 'Petakan record workflow Rekomtek legacy', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.assign')::uuid, 'rekomtek.assign', 'Tunjuk Pokja Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.evaluate')::uuid, 'rekomtek.evaluate', 'Evaluasi Berkas dan hasil Ekspose Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.correct.initial')::uuid, 'rekomtek.correct.initial', 'Kirim Perbaikan Dokumen Awal', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.correct.post-expose')::uuid, 'rekomtek.correct.post-expose', 'Kirim Pelengkapan Pasca-Ekspose', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.expose')::uuid, 'rekomtek.expose', 'Kelola Ekspose Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.field')::uuid, 'rekomtek.field', 'Kelola SPT dan Kunjungan Lapangan', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.council')::uuid, 'rekomtek.council', 'Kelola Sidang Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.draft')::uuid, 'rekomtek.draft', 'Susun hasil dan draft Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.inspect')::uuid, 'rekomtek.inspect', 'Periksa hasil sebagai Pejabat Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.approve.final')::uuid, 'rekomtek.approve.final', 'Setujui hasil sebagai Atasan Pejabat', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.artifact')::uuid, 'rekomtek.artifact', 'Kelola Artefak Proses Rekomtek', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('rekomtek.publish.final')::uuid, 'rekomtek.publish.final', 'Terbitkan Dokumen Rekomtek final', 'rekomtek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "group" = EXCLUDED."group",
    "updatedAt" = CURRENT_TIMESTAMP;
