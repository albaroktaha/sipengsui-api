import { PrismaClient, RoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Mode: 'development' (default) atau 'production'.
// - development: seed bisa mereset data (menghapus user lain & data GIS)
// - production : seed hanya idempotent — tidak pernah menghapus data.
const SEED_ENV = (process.env.SEED_ENV ?? 'development').toLowerCase();
const IS_PRODUCTION = SEED_ENV === 'production';

// NODE_ENV dianggap production bila SEED_ENV tidak diset eksplisit.
const IS_NODE_PRODUCTION = !process.env.SEED_ENV && process.env.NODE_ENV === 'production';

// Email + password superadmin. Password diambil dari env agar tidak
// terkunci ke kredensial yang sama di semua lingkungan; tanpa env di
// production, seed dibatalkan demi keamanan.
const SUPERADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'sipengsui@gmail.com';
const SUPERADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

function validateEnv() {
  if (IS_NODE_PRODUCTION && !process.env.SEED_ENV) {
    throw new Error(
      'NODE_ENV=production membutuhkan SEED_ENV eksplisit (development|production). ' +
        'Set SEED_ENV=production untuk menjalankan seed idempotent, atau jangan jalankan seed di production.',
    );
  }
  if (IS_PRODUCTION && !SUPERADMIN_PASSWORD) {
    throw new Error(
      'SEED_ADMIN_PASSWORD wajib diisi di production (mode SEED_ENV=production). ' +
        'Set variabel SEED_ADMIN_PASSWORD dengan password superadmin yang kuat.',
    );
  }
}

// ══════════════════════════════════════════════════════════════
// DEFINE ALL PERMISSIONS
// ══════════════════════════════════════════════════════════════

const ALL_PERMISSIONS = [
  // ── Dashboard ──
  { slug: 'dashboard.view', name: 'Lihat Dashboard', group: 'dashboard' },
  { slug: 'dashboard.admin', name: 'Dashboard Admin', group: 'dashboard' },
  { slug: 'dashboard.hydrology', name: 'Dashboard Hidrologi', group: 'dashboard' },
  { slug: 'dashboard.rekomtek', name: 'Dashboard Rekomtek', group: 'dashboard' },
  { slug: 'dashboard.system', name: 'Dashboard Sistem', group: 'dashboard' },

  // ── Stations ──
  { slug: 'stations.read', name: 'Lihat Stasiun', group: 'stations' },
  { slug: 'stations.create', name: 'Tambah Stasiun', group: 'stations' },
  { slug: 'stations.update', name: 'Ubah Stasiun', group: 'stations' },
  { slug: 'stations.delete', name: 'Hapus Stasiun', group: 'stations' },

  // ── Observations ──
  { slug: 'observations.read', name: 'Lihat Observasi', group: 'observations' },
  { slug: 'observations.create', name: 'Tambah Observasi', group: 'observations' },
  { slug: 'observations.update', name: 'Ubah Observasi', group: 'observations' },
  { slug: 'observations.delete', name: 'Hapus Observasi', group: 'observations' },

  // ── Imports ──
  { slug: 'imports.read', name: 'Lihat Import', group: 'imports' },
  { slug: 'imports.create', name: 'Import Data', group: 'imports' },

  // ── GIS ──
  { slug: 'gis.read', name: 'Lihat Peta GIS', group: 'gis' },
  { slug: 'gis.publish', name: 'Publikasi Data GIS', group: 'gis' },
  { slug: 'gis.manage', name: 'Kelola Peta GIS', group: 'gis' },

  // ── Rekomtek ──
  { slug: 'rekomtek.read', name: 'Lihat Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.create', name: 'Buat Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.update', name: 'Ubah Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.delete', name: 'Hapus Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.submit', name: 'Ajukan Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.approve', name: 'Setujui Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.reject', name: 'Tolak Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.publish', name: 'Publikasi Rekomtek', group: 'rekomtek' },
  { slug: 'rekomtek.berkas', name: 'Kelola Berkas Rekomtek', group: 'rekomtek' },

  // ── Flowchart ──
  { slug: 'flowchart.read', name: 'Lihat Flowchart', group: 'flowchart' },
  { slug: 'flowchart.manage', name: 'Kelola Flowchart', group: 'flowchart' },

  // ── Disaster Reports ──
  { slug: 'disaster-reports.read', name: 'Lihat Laporan Bencana', group: 'disaster-reports' },
  { slug: 'disaster-reports.create', name: 'Buat Laporan Bencana', group: 'disaster-reports' },
  { slug: 'disaster-reports.update', name: 'Ubah Laporan Bencana', group: 'disaster-reports' },
  { slug: 'disaster-reports.verify', name: 'Verifikasi Laporan Bencana', group: 'disaster-reports' },

  // ── Watersheds / Rivers / Regions ──
  { slug: 'master-data.read', name: 'Lihat Data Master', group: 'master-data' },
  { slug: 'master-data.create', name: 'Tambah Data Master', group: 'master-data' },
  { slug: 'master-data.update', name: 'Ubah Data Master', group: 'master-data' },
  { slug: 'master-data.delete', name: 'Hapus Data Master', group: 'master-data' },

  // ── Users ──
  { slug: 'users.read', name: 'Lihat User', group: 'users' },
  { slug: 'users.create', name: 'Tambah User', group: 'users' },
  { slug: 'users.update', name: 'Ubah User', group: 'users' },
  { slug: 'users.delete', name: 'Hapus User', group: 'users' },
  { slug: 'users.manage', name: 'Kelola Role & Permission User', group: 'users' },

  // ── Roles & Permissions ──
  { slug: 'roles.read', name: 'Lihat Role', group: 'roles' },
  { slug: 'permissions.read', name: 'Lihat Permission', group: 'roles' },
  { slug: 'permissions.manage', name: 'Kelola Permission', group: 'roles' },

  // ── Superadmin ──
  { slug: '*', name: 'Super Admin (Semua Akses)', group: 'superadmin' },
];

async function main() {
  console.log('🌱 Seeding database...');
  validateEnv();
  console.log(`  Mode: ${IS_PRODUCTION ? 'production (idempotent)' : 'development (boleh reset)'}`);

  // =====================================================
  // ROLE
  // =====================================================

  const roles: Record<RoleType, { id: string }> = {} as Record<
    RoleType,
    { id: string }
  >;

  for (const role of Object.values(RoleType)) {
    roles[role] = await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
  }

  console.log('✅ Role seeded');

  // =====================================================
  // PERMISSIONS
  // =====================================================

  const permissionMap: Record<string, { id: string }> = {};

  for (const perm of ALL_PERMISSIONS) {
    permissionMap[perm.slug] = await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: { name: perm.name, group: perm.group },
      create: perm,
    });
  }

  console.log(`✅ ${ALL_PERMISSIONS.length} permissions seeded`);

  // =====================================================
  // USER
  // =====================================================

  // Password: di development pakai default yang jelas; di production
  // wajib berasal dari env SEED_ADMIN_PASSWORD (dipastikan validateEnv).
  const password = await bcrypt.hash(IS_PRODUCTION ? SUPERADMIN_PASSWORD! : 'Admin123!', 10);

  // Hapus user lain hanya di development. Di production seed tidak
  // pernah menghapus akun — akun yang sudah ada dibiarkan utuh.
  if (!IS_PRODUCTION) {
    await prisma.user.deleteMany({
      where: { email: { not: SUPERADMIN_EMAIL } },
    });
  }

  // ── Superadmin ──
  // update: {} → akun yang sudah ada TIDAK diganti password-nya.
  // Password env hanya dipakai saat membuat akun baru (first deploy).
  const superadminUser = await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: {},
    create: {
      name: 'Super Administrator',
      email: SUPERADMIN_EMAIL,
      password,
      roleId: roles.SUPER_ADMIN.id,
      emailVerified: true,
      isActive: true,
    },
  });

  // Assign SUPER_ADMIN role via UserRole
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superadminUser.id, roleId: roles.SUPER_ADMIN.id } },
    update: {},
    create: { userId: superadminUser.id, roleId: roles.SUPER_ADMIN.id },
  });

  // Assign all permissions to superadmin
  for (const perm of ALL_PERMISSIONS) {
    await prisma.userPermission
      .upsert({
        where: {
          userId_permissionId: {
            userId: superadminUser.id,
            permissionId: permissionMap[perm.slug].id,
          },
        },
        update: {},
        create: {
          userId: superadminUser.id,
          permissionId: permissionMap[perm.slug].id,
        },
      })
      .catch(() => {
        // Skip duplicate
      });
  }

  console.log('✅ Superadmin seeded with all permissions');

  // =====================================================
  // DATA GIS — hanya dikosongkan di development
  // =====================================================

  // Di production seed TIDAK menghapus data GIS yang sudah ada
  // (sungai, DAS, WS, peta) karena itu data operasional asli.
  if (!IS_PRODUCTION) {
    await prisma.river.deleteMany({});
    await prisma.watershed.deleteMany({});
    await prisma.riverRegion.deleteMany({});
    await prisma.gisMap.deleteMany({});

    console.log('✅ Data GIS dikosongkan (development)');
  } else {
    console.log('⏭️  Lewati penghapusan data GIS (mode production)');
  }

  // =====================================================
  // REKOMTEK BERKAS TEMPLATES
  // =====================================================

  console.log('🔄 Seeding rekomtek berkas templates...');

  type BerkasTemplate = { kode: string; nomorUrut: number; uraian: string; isRequired: boolean; hasSubItems: boolean };

  async function seedTemplate(jenis: string, jenisPermohonan: string, items: BerkasTemplate[]) {
    // Upsert existing — cari by unique composite
    const existing = await prisma.rekomtekBerkasTemplate.findMany({
      where: { jenis, jenisPermohonan: jenisPermohonan as any },
    });
    const existingMap = new Map(existing.map((e) => [e.kode, e]));

    for (const item of items) {
      const existingItem = existingMap.get(item.kode);
      if (existingItem) {
        await prisma.rekomtekBerkasTemplate.update({
          where: { id: existingItem.id },
          data: {
            nomorUrut: item.nomorUrut,
            uraian: item.uraian,
            isRequired: item.isRequired,
            hasSubItems: item.hasSubItems,
          },
        });
      } else {
        await prisma.rekomtekBerkasTemplate.create({
          data: {
            jenis,
            jenisPermohonan: jenisPermohonan as any,
            kode: item.kode,
            nomorUrut: item.nomorUrut,
            uraian: item.uraian,
            isRequired: item.isRequired,
            hasSubItems: item.hasSubItems,
          },
        });
      }
    }
    console.log(`  ✅ ${jenis} / ${jenisPermohonan} — ${items.length} item`);
  }

  // ── GALIAN_C / IZIN_BARU ──
  await seedTemplate('GALIAN_C', 'IZIN_BARU', [
    { kode: '1', nomorUrut: 1, uraian: 'Surat permohonan bermaterai Rp. 10.000,-', isRequired: true, hasSubItems: false },
    { kode: '2', nomorUrut: 2, uraian: 'Fotokopi Akte Pendirian Perusahaan dan Pengesahannya', isRequired: true, hasSubItems: false },
    { kode: '3', nomorUrut: 3, uraian: 'Fotokopi KTP Direktur/Penanggung jawab perusahaan', isRequired: true, hasSubItems: false },
    { kode: '4', nomorUrut: 4, uraian: 'Surat Kuasa apabila pengurusan dikuasakan dan ditanda-tangani pemberi dan penerima kuasa diatas materai 10.000', isRequired: false, hasSubItems: false },
    { kode: '5', nomorUrut: 5, uraian: 'Nomor Pokok Wajib Pajak (NPWP)', isRequired: true, hasSubItems: false },
    { kode: '6', nomorUrut: 6, uraian: 'Foto Copy SIUP/SIPB dan TDP/NIB', isRequired: true, hasSubItems: false },
    { kode: '7', nomorUrut: 7, uraian: 'Surat Pernyataan Kebenaran Data bermaterai Rp. 10.000', isRequired: true, hasSubItems: false },
    { kode: '8', nomorUrut: 8, uraian: 'Surat Persetujuan Kesesuaian Tata Ruang dari Pemerintah Daerah', isRequired: true, hasSubItems: false },
    { kode: '9', nomorUrut: 9, uraian: 'Peta situasi termasuk bangunan sungai dan bangunan air di sekitar lokasi usulan (berskala minimal 1 : 10.000) dengan satuan koordinat', isRequired: true, hasSubItems: false },
    { kode: '10', nomorUrut: 10, uraian: 'Dokumen teknis pertambangan (peta, potongan, situasi)', isRequired: true, hasSubItems: true },
    { kode: '10.a', nomorUrut: 10, uraian: 'Usulan wilayah pertambangan dengan luas dan batas – batas yang jelas dituangkan dalam peta berskala 1 : 10.000 dilengkapi dengan penjelasan mengenai dalamnya penggalian yang direncanakan', isRequired: true, hasSubItems: false },
    { kode: '10.b', nomorUrut: 10, uraian: 'Peta situasi sungai berskala 1 : 1.000 lengkap dengan kontur garis tinggi yang meliputi palung, bantaran, tebing dan data tanggul dan data ukur', isRequired: true, hasSubItems: false },
    { kode: '10.c', nomorUrut: 10, uraian: 'Gambar potongan memanjang berskala 1 : 1.000 skala tinggi 1 : 250 dengan jarak pengukuran 25 m meliputi garis tebing kiri dan kanan, garis tinggi dasar sungai', isRequired: true, hasSubItems: false },
    { kode: '10.d', nomorUrut: 10, uraian: 'Gambar Potongan melintang berskala 1 : 500, skala tinggi 250 dengan kerapatan pengukuran di wilayah pertambangan tidak lebih dari 10 meter', isRequired: true, hasSubItems: false },
    { kode: '10.e', nomorUrut: 10, uraian: 'Lokasi dan situasi bangunan – bangunan pengairan dan bangunan umum lain yang ada', isRequired: true, hasSubItems: false },
    { kode: '11', nomorUrut: 11, uraian: 'Dokumen Lingkungan dan/atau Ijin Lingkungan sesuai peraturan Perundang-undangan (SPPL, UKL-UPL, AMDAL)', isRequired: true, hasSubItems: false },
    { kode: '12', nomorUrut: 12, uraian: 'Berita Acara PKM (Pertemuan Konsultasi Masyarakat)', isRequired: true, hasSubItems: false },
    { kode: '13', nomorUrut: 13, uraian: 'Melampirkan hasil uji bor disungai untuk mengetahui lapisan minimum perisai sungai', isRequired: true, hasSubItems: false },
    { kode: '14', nomorUrut: 14, uraian: 'BM dan CP pengukuran wajib mengikat pada Titik Kontrol Geodesi (TKG) baik itu dalam bentuk pilar atau Indonesia Countinously Operating Reference Stations (Ina-CORS) sesuai Peraturan Badan Informasi Geospasial no 13 tahun 2021. BM dan CP dilengkapi dengan deskripsi patok plat nomenklatur sesuai standar bidang ke PU an', isRequired: true, hasSubItems: false },
    { kode: '15', nomorUrut: 15, uraian: 'Melampirkan calculation sheet perhitungan data ukur dalam format excel', isRequired: true, hasSubItems: false },
    { kode: '16', nomorUrut: 16, uraian: 'Melampirkan citra dan video drone/orthophoto serta mengikat titik BM/GCP (report terlampir)', isRequired: true, hasSubItems: false },
  ]);

  // ── GALIAN_C / PERPANJANGAN ──
  await seedTemplate('GALIAN_C', 'PERPANJANGAN', [
    { kode: '1', nomorUrut: 1, uraian: 'Surat permohonan bermaterai Rp. 10.000,-', isRequired: true, hasSubItems: false },
    { kode: '2', nomorUrut: 2, uraian: 'Fotokopi Akte Pendirian Perusahaan dan Pengesahannya', isRequired: true, hasSubItems: false },
    { kode: '3', nomorUrut: 3, uraian: 'Fotokopi KTP Direktur/Penanggung jawab perusahaan', isRequired: true, hasSubItems: false },
    { kode: '4', nomorUrut: 4, uraian: 'Surat Kuasa apabila pengurusan dikuasakan dan ditanda-tangani pemberi dan penerima kuasa diatas materai 10.000', isRequired: false, hasSubItems: false },
    { kode: '5', nomorUrut: 5, uraian: 'Nomor Pokok Wajib Pajak (NPWP)', isRequired: true, hasSubItems: false },
    { kode: '6', nomorUrut: 6, uraian: 'Foto Copy SIUP/SIPB dan TDP/NIB', isRequired: true, hasSubItems: false },
    { kode: '7', nomorUrut: 7, uraian: 'Surat Pernyataan Kebenaran Data bermaterai Rp. 10.000', isRequired: true, hasSubItems: false },
    { kode: '8', nomorUrut: 8, uraian: 'Dokumen izin pengusahaan sumber daya air dan rekomendasi teknis yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '9', nomorUrut: 9, uraian: 'Surat Persetujuan Kesesuaian Tata Ruang dari Pemerintah Daerah', isRequired: true, hasSubItems: false },
    { kode: '10', nomorUrut: 10, uraian: 'Laporan pemenuhan persyaratan / rekomendasi teknis sebelumnya', isRequired: true, hasSubItems: false },
    { kode: '11', nomorUrut: 11, uraian: 'Peta situasi termasuk bangunan sungai dan bangunan air di sekitar lokasi usulan (berskala minimal 1 : 10.000) dengan satuan koordinat', isRequired: true, hasSubItems: false },
    { kode: '12', nomorUrut: 12, uraian: 'Dokumen teknis perbandingan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: true },
    { kode: '12.a', nomorUrut: 12, uraian: 'Usulan wilayah pertambangan dengan luas dan batas – batas yang jelas dituangkan dalam peta berskala 1 : 10.000 dilengkapi dengan penjelasan mengenai dalamnya penggalian yang direncanakan dibandingkan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '12.b', nomorUrut: 12, uraian: 'Peta situasi sungai berskala 1 : 1.000 lengkap dengan kontur garis tinggi yang meliputi palung, bantaran, tebing dan data tanggul dan data ukur dibandingkan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '12.c', nomorUrut: 12, uraian: 'Gambar potongan memanjang berskala 1 : 1.000 skala tinggi 1 : 250 dengan jarak pengukuran 25 m meliputi garis tebing kiri dan kanan, garis tinggi dasar sungai dibandingkan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '12.d', nomorUrut: 12, uraian: 'Gambar Potongan melintang berskala 1 : 500, skala tinggi 250 dengan kerapatan pengukuran di wilayah pertambangan tidak lebih dari 10 meter dibandingkan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '12.e', nomorUrut: 12, uraian: 'Lokasi dan situasi bangunan – bangunan pengairan dan bangunan umum lain yang ada dibandingkan dengan kondisi izin yang masih berlaku', isRequired: true, hasSubItems: false },
    { kode: '13', nomorUrut: 13, uraian: 'Dokumen pemantauan dan pengelolaan lingkungan 1 (satu) tahun terakhir', isRequired: true, hasSubItems: false },
    { kode: '14', nomorUrut: 14, uraian: 'Berita Acara PKM (Pertemuan Konsultasi Masyarakat) terbaru', isRequired: true, hasSubItems: false },
    { kode: '15', nomorUrut: 15, uraian: 'Melampirkan hasil uji bor disungai untuk mengetahui lapisan minimum perisai sungai', isRequired: true, hasSubItems: false },
    { kode: '16', nomorUrut: 16, uraian: 'BM dan CP pengukuran wajib mengikat pada Titik Kontrol Geodesi (TKG) baik itu dalam bentuk pilar atau Indonesia Countinously Operating Reference Stations (Ina-CORS) sesuai Peraturan Badan Informasi Geospasial no 13 tahun 2021. BM dan CP dilengkapi dengan deskripsi patok plat nomenklatur sesuai standar bidang ke PU an', isRequired: true, hasSubItems: false },
    { kode: '17', nomorUrut: 17, uraian: 'Melampirkan calculation sheet perhitungan data ukur dalam format excel', isRequired: true, hasSubItems: false },
    { kode: '18', nomorUrut: 18, uraian: 'Melampirkan citra dan video drone/orthophoto serta mengikat titik BM/GCP (report terlampir)', isRequired: true, hasSubItems: false },
  ]);

  // ── APU/PLTM/PLTA + IZIN_BARU ──
  // Note: untuk jenis APU, PLTA, PLTM — template sama
  for (const jns of ['APU', 'PLTA', 'PLTM']) {
    await seedTemplate(jns, 'IZIN_BARU', [
      { kode: '1', nomorUrut: 1, uraian: 'Surat permohonan bermaterai Rp.10.000,- dilengkapi dengan proposal teknis (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '2', nomorUrut: 2, uraian: 'Akte Pendirian Perusahaan dan Akte Perubahan (jika ada) serta Pengesahannya', isRequired: true, hasSubItems: false },
      { kode: '3', nomorUrut: 3, uraian: 'KTP Direktur/Penanggung jawab perusahaan', isRequired: true, hasSubItems: false },
      { kode: '4', nomorUrut: 4, uraian: 'Surat Kuasa apabila pengurusan dikuasakan dan ditanda-tangani pemberi dan penerima kuasa diatas materai Rp.10.000 (format terlampir)', isRequired: false, hasSubItems: false },
      { kode: '5', nomorUrut: 5, uraian: 'Nomor Pokok Wajib Pajak (NPWP)', isRequired: true, hasSubItems: false },
      { kode: '6', nomorUrut: 6, uraian: 'Dokumen Nomor Induk Berusaha (NIB) yang telah terintegrasi dengan OSS', isRequired: true, hasSubItems: false },
      { kode: '7', nomorUrut: 7, uraian: 'Surat Pernyataan Kebenaran Data bermaterai Rp. 10.000 (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '8', nomorUrut: 8, uraian: 'Surat Persetujuan Kesesuaian Tata Ruang dari Pemerintah Daerah', isRequired: true, hasSubItems: false },
      { kode: '9', nomorUrut: 9, uraian: 'Dokumen Kajian Teknis (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '10', nomorUrut: 10, uraian: 'Dokumen Lingkungan dan/atau Ijin Lingkungan sesuai peraturan Perundang-undangan (SPPL, UKL-UPL, AMDAL)', isRequired: true, hasSubItems: false },
      { kode: '11', nomorUrut: 11, uraian: 'Peta dan gambar teknis (panduan terlampir)', isRequired: true, hasSubItems: true },
      { kode: '11.a', nomorUrut: 11, uraian: 'Peta situasi sumber air (sungai, danau, embung, saluran irigasi, mata air) termasuk bangunan air', isRequired: true, hasSubItems: false },
      { kode: '11.b', nomorUrut: 11, uraian: 'Gambar potongan memanjang dan melintang sumber air', isRequired: true, hasSubItems: false },
      { kode: '11.c', nomorUrut: 11, uraian: 'Gambar detail konstruksi pengambilan', isRequired: true, hasSubItems: false },
      { kode: '12', nomorUrut: 12, uraian: 'Spesifikasi teknis konstruksi (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '13', nomorUrut: 13, uraian: 'Dokumen Manual Operasi dan Pemeliharaan konstruksi', isRequired: true, hasSubItems: false },
      { kode: '14', nomorUrut: 14, uraian: 'Berita Acara PKM (Pertemuan Konsultasi Masyarakat)', isRequired: true, hasSubItems: false },
      { kode: '15', nomorUrut: 15, uraian: 'Khusus kegiatan PLTA/PLTM: Surat Pernyataan Rencana waktu pembangunan', isRequired: false, hasSubItems: false },
      { kode: '16', nomorUrut: 16, uraian: 'Khusus kegiatan di wilayah kawasan hutan: Surat Keterangan Bebas dari Kawasan Hutan dari Instansi Teknis yang membidangi urusan kehutanan ataupun Izin Pinjam Pakai Kawasan Hutan (IPPKH)', isRequired: false, hasSubItems: false },
      { kode: '17', nomorUrut: 17, uraian: 'Khusus kegiatan yang sudah beroperasi namun belum memiliki izin: laporan pemantauan dan pengelolaan lingkungan 1 (satu) tahun terakhir', isRequired: false, hasSubItems: false },
      { kode: '18', nomorUrut: 18, uraian: 'Khusus kegiatan PLTA/PLTM: Dokumen Power Purchase Agreement (PPA) atau Dokumen Perjanjian Jual Beli Tenaga Listrik dengan PLN', isRequired: false, hasSubItems: false },
      { kode: '19', nomorUrut: 19, uraian: 'Khusus kegiatan yang memanfaatkan sempadan sungai dan danau: peta pemakaian sempadan', isRequired: false, hasSubItems: false },
    ]);
  }

  // ── APU/PLTM/PLTA + PERPANJANGAN ──
  for (const jns of ['APU', 'PLTA', 'PLTM']) {
    await seedTemplate(jns, 'PERPANJANGAN', [
      { kode: '1', nomorUrut: 1, uraian: 'Surat permohonan bermaterai Rp.10.000,- dilengkapi dengan proposal teknis (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '2', nomorUrut: 2, uraian: 'Akte Pendirian Perusahaan dan Akte Perubahan (jika ada) serta Pengesahannya', isRequired: true, hasSubItems: false },
      { kode: '3', nomorUrut: 3, uraian: 'KTP Direktur/Penanggung jawab perusahaan', isRequired: true, hasSubItems: false },
      { kode: '4', nomorUrut: 4, uraian: 'Surat Kuasa apabila pengurusan dikuasakan dan ditanda-tangani pemberi dan penerima kuasa diatas materai Rp.10.000 (format terlampir)', isRequired: false, hasSubItems: false },
      { kode: '5', nomorUrut: 5, uraian: 'Nomor Pokok Wajib Pajak (NPWP)', isRequired: true, hasSubItems: false },
      { kode: '6', nomorUrut: 6, uraian: 'Dokumen Nomor Induk Berusaha (NIB) yang telah terintegrasi dengan OSS', isRequired: true, hasSubItems: false },
      { kode: '7', nomorUrut: 7, uraian: 'Dokumen Perizinan Pengusahaan Sumber Daya Air serta rekomendasi teknis yang masih berlaku', isRequired: true, hasSubItems: false },
      { kode: '8', nomorUrut: 8, uraian: 'Surat Pernyataan Kebenaran Data bermaterai Rp. 10.000 (format terlampir)', isRequired: true, hasSubItems: false },
      { kode: '9', nomorUrut: 9, uraian: 'Surat Persetujuan Kesesuaian Tata Ruang dari Pemerintah Daerah', isRequired: true, hasSubItems: false },
      { kode: '10', nomorUrut: 10, uraian: 'Laporan pemenuhan persyaratan / rekomendasi teknis sebelumnya', isRequired: true, hasSubItems: false },
      { kode: '11', nomorUrut: 11, uraian: 'Surat persetujuan lingkungan dan/atau Ijin Lingkungan', isRequired: true, hasSubItems: false },
      { kode: '12', nomorUrut: 12, uraian: 'Peta dan gambar teknis (panduan terlampir)', isRequired: true, hasSubItems: true },
      { kode: '12.a', nomorUrut: 12, uraian: 'Peta situasi sumber air (sungai, danau, embung, saluran irigasi, mata air) termasuk bangunan air', isRequired: true, hasSubItems: false },
      { kode: '12.b', nomorUrut: 12, uraian: 'Gambar potongan memanjang dan melintang sumber air', isRequired: true, hasSubItems: false },
      { kode: '12.c', nomorUrut: 12, uraian: 'Gambar detail konstruksi pengambilan', isRequired: true, hasSubItems: false },
      { kode: '13', nomorUrut: 13, uraian: 'Laporan Pemakaian Air Bulanan dan Pajak Air Permukaan selama 1 (satu) tahun terakhir', isRequired: true, hasSubItems: false },
      { kode: '14', nomorUrut: 14, uraian: 'Berita Acara PKM (Pertemuan Konsultasi Masyarakat)', isRequired: true, hasSubItems: false },
      { kode: '15', nomorUrut: 15, uraian: 'Khusus kegiatan PLTA/PLTM: Surat Pernyataan Rencana waktu pembangunan', isRequired: false, hasSubItems: false },
      { kode: '16', nomorUrut: 16, uraian: 'Khusus kegiatan di wilayah kawasan hutan: Surat Keterangan Bebas dari Kawasan Hutan dari Instansi Teknis yang membidangi urusan kehutanan ataupun Izin Pinjam Pakai Kawasan Hutan (IPPKH)', isRequired: false, hasSubItems: false },
      { kode: '17', nomorUrut: 17, uraian: 'Khusus kegiatan yang sudah beroperasi namun belum memiliki izin: laporan pemantauan dan pengelolaan lingkungan 1 (satu) tahun terakhir', isRequired: false, hasSubItems: false },
      { kode: '18', nomorUrut: 18, uraian: 'Khusus kegiatan PLTA/PLTM: Dokumen Power Purchase Agreement (PPA) atau Dokumen Perjanjian Jual Beli Tenaga Listrik dengan PLN', isRequired: false, hasSubItems: false },
      { kode: '19', nomorUrut: 19, uraian: 'Khusus kegiatan yang memanfaatkan sempadan sungai dan danau: peta pemakaian sempadan', isRequired: false, hasSubItems: false },
    ]);
  }

  console.log('✅ Rekomtek berkas templates seeded');

  // =====================================================
  // FLOWCHART DEFAULT (Alur Rekomtek)
  // =====================================================

  console.log('🔄 Seeding flowchart rekomtek...');

  const rekomtekNodes = [
    // ── Proses utama (persegi) ──
    { id: 'PEMOHON', label: 'Pemohon Rekomendasi', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'DINAS', label: 'Kepala Dinas SDA Provinsi', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'KABID', label: 'Kepala Bidang P/SA', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'TIM', label: 'Tim Teknis Bidang P/SA (ADM)', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'EKSPOSE', label: 'Ekspose', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'BA_EKSPOSE', label: 'Berita Acara Ekspose', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'LENGKAPI', label: 'Melengkapi Dokumen', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'PERBAIKI', label: 'Perbaikan Dokumen', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'DITOLAK1', label: 'Permohonan Ditolak', type: 'process', fill: '#f8d7da', stroke: '#b02a37', textColor: '#58151c' },
    { id: 'DITOLAK2', label: 'Dokumen Teknis Ditolak', type: 'process', fill: '#f8d7da', stroke: '#b02a37', textColor: '#58151c' },
    { id: 'TINJAUAN', label: 'Tinjauan Lapangan', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'BA_TINJAUAN', label: 'Berita Acara Tinjauan Lapangan', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'RAPAT', label: 'Rapat Pembahasan Rekomtek', type: 'process', fill: '#d8f3dc', stroke: '#2d6a4f', textColor: '#1b4332' },

    // ── Dokumen (parallelogram) ──
    { id: 'EVALUASI', label: 'Evaluasi Kelengkapan Dokumen', type: 'document', fill: '#d4e157', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'KAJIAN', label: 'Kajian & Evaluasi Teknis', type: 'document', fill: '#d4e157', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'DRAFT', label: 'Draft Final Rekomtek (MS/TMS)', type: 'document', fill: '#d4e157', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'DOK_AKHIR', label: 'Dokumen Rekomtek (MS/TMS)', type: 'document', fill: '#d4e157', stroke: '#2d6a4f', textColor: '#1b4332' },

    // ── Keputusan (diamond) ──
    { id: 'K1', label: 'Memenuhi', type: 'decision', fill: '#ffea00', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'K1B', label: 'Memenuhi', type: 'decision', fill: '#ffea00', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'K2', label: 'Memenuhi', type: 'decision', fill: '#ffea00', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'K2B', label: 'Memenuhi', type: 'decision', fill: '#ffea00', stroke: '#2d6a4f', textColor: '#1b4332' },
    { id: 'K3', label: 'Cek Kesiapan Lapangan', type: 'decision', fill: '#ffea00', stroke: '#2d6a4f', textColor: '#1b4332' },
  ];

  const rekomtekEdges = [
    // Pemohon → Dinas → Kabid → Tim
    { id: 'e-pemohon-dinas', source: 'PEMOHON', target: 'DINAS', label: '1 Hari Kerja' },
    { id: 'e-dinas-kabid', source: 'DINAS', target: 'KABID', label: '1 Hari Kerja' },
    { id: 'e-kabid-tim', source: 'KABID', target: 'TIM', label: '1 Hari Kerja' },
    { id: 'e-tim-evaluasi', source: 'TIM', target: 'EVALUASI', label: '1 Hari Kerja' },

    // Evaluasi → Memenuhi (K1)
    { id: 'e-evaluasi-k1', source: 'EVALUASI', target: 'K1', label: '6 Hari Kerja' },
    // K1: Tidak → Melengkapi Dokumen → Memenuhi (K1B) → (Ya → kembali; Tidak → Permohonan Ditolak)
    { id: 'e-k1-lengkapi', source: 'K1', target: 'LENGKAPI', label: 'Tidak' },
    { id: 'e-lengkapi-k1b', source: 'LENGKAPI', target: 'K1B', label: '6 Hari' },
    { id: 'e-k1b-k1', source: 'K1B', target: 'K1', label: 'Ya' },
    { id: 'e-k1b-ditolak1', source: 'K1B', target: 'DITOLAK1', label: 'Tidak' },
    { id: 'e-ditolak1-pemohon', source: 'DITOLAK1', target: 'PEMOHON', label: '1 Hari Kerja' },
    // K1: Ya → Ekspose → Berita Acara → Kajian
    { id: 'e-k1-ekspose', source: 'K1', target: 'EKSPOSE', label: 'Ya' },
    { id: 'e-ekspose-ba', source: 'EKSPOSE', target: 'BA_EKSPOSE', label: undefined },
    { id: 'e-ba-kajian', source: 'BA_EKSPOSE', target: 'KAJIAN', label: undefined },

    // Kajian → Memenuhi (K2)
    { id: 'e-kajian-k2', source: 'KAJIAN', target: 'K2', label: '6 Hari Kerja' },
    // K2: Tidak → Perbaikan Dokumen → Memenuhi (K2B) → (Ya → kembali; Tidak → Dokumen Teknis Ditolak)
    { id: 'e-k2-perbaiki', source: 'K2', target: 'PERBAIKI', label: 'Tidak' },
    { id: 'e-perbaiki-k2b', source: 'PERBAIKI', target: 'K2B', label: '14 Hari' },
    { id: 'e-k2b-k2', source: 'K2B', target: 'K2', label: 'Ya' },
    { id: 'e-k2b-ditolak2', source: 'K2B', target: 'DITOLAK2', label: 'Tidak' },
    { id: 'e-ditolak2-pemohon', source: 'DITOLAK2', target: 'PEMOHON', label: '1 Hari Kerja' },
    // K2: Ya → Cek Kesiapan Lapangan
    { id: 'e-k2-k3', source: 'K2', target: 'K3', label: 'Ya' },

    // Cek Kesiapan Lapangan: Tidak → Rapat Pembahasan → Draft Final; Ya → Tinjauan → BA Tinjauan → Draft Final
    { id: 'e-k3-rapat', source: 'K3', target: 'RAPAT', label: 'Tidak' },
    { id: 'e-rapat-draft', source: 'RAPAT', target: 'DRAFT', label: '2 Hari Kerja' },
    { id: 'e-k3-tinjauan', source: 'K3', target: 'TINJAUAN', label: 'Ya' },
    { id: 'e-tinjauan-ba', source: 'TINJAUAN', target: 'BA_TINJAUAN', label: '4 Hari Kerja' },
    { id: 'e-ba-draft', source: 'BA_TINJAUAN', target: 'DRAFT', label: undefined },

    // Draft Final → Dokumen Akhir → Dinas
    { id: 'e-draft-dok', source: 'DRAFT', target: 'DOK_AKHIR', label: undefined },
    { id: 'e-dok-dinas', source: 'DOK_AKHIR', target: 'DINAS', label: '1 Hari Kerja' },
  ];

  await prisma.flowchart.upsert({
    where: { slug: 'rekomtek' },
    update: {
      title: 'Alur Pengajuan Rekomendasi Teknis (Rekomtek)',
      description:
        'Visualisasi interaktif untuk pelaksanaan proses standar operasional pengajuan rekomendasi teknis.',
      isPublished: true,
      nodes: rekomtekNodes as any,
      edges: rekomtekEdges as any,
    },
    create: {
      slug: 'rekomtek',
      title: 'Alur Pengajuan Rekomendasi Teknis (Rekomtek)',
      description:
        'Visualisasi interaktif untuk pelacakan proses standar operasional pengajuan rekomendasi teknis.',
      isPublished: true,
      nodes: rekomtekNodes as any,
      edges: rekomtekEdges as any,
    },
  });

  console.log('✅ Flowchart rekomtek seeded');

  console.log('\n🎉 Seeding complete!\n');
  if (IS_PRODUCTION) {
    console.log('📋 Mode production: akun superadmin sudah dijamin lewat SEED_ADMIN_PASSWORD.');
  } else {
    console.log('📋 Akun tersedia (development):');
    console.log(`   ${SUPERADMIN_EMAIL} / Admin123! — Super Admin`);
    console.log('   ⚠️  Ganti password setelah login pertama.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });