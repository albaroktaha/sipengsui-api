# Runbook WhatsApp WAHA/SumoPod SIPENGSUI

Dokumen ini mengikuti `WHATSAPP_BOT_AGENT_INSTRUCTIONS.md`. Target provider
adalah WAHA yang di-host oleh SumoPod. WAHA memakai sesi WhatsApp Web dan bukan
API resmi/terotorisasi WhatsApp; nomor layanan dapat dibatasi atau diblokir.
Gunakan nomor khusus layanan dan dapatkan persetujuan risiko operasional sebelum
production.

## Sumber kontrak provider

- WAHA introduction: <https://waha.devlike.pro/docs/overview/introduction/>
- Send text: <https://waha.devlike.pro/docs/how-to/send-messages/>
- Events/HMAC: <https://waha.devlike.pro/docs/how-to/events/>
- Security: <https://waha.devlike.pro/docs/how-to/security/>
- Sessions/status: <https://waha.devlike.pro/docs/how-to/sessions/>
- Engines/OpenAPI differences: <https://waha.devlike.pro/docs/how-to/engines/>

OpenAPI publik WAHA mendefinisikan `POST /api/sendText` dengan body `session`,
`chatId`, dan `text`, serta response `WAMessage` yang memiliki `id`. Instance
SumoPod yang digunakan tetap harus diuji karena payload dapat berbeda antar
engine.

## Dua lapisan konfigurasi

Konfigurasi WAHA dan konfigurasi `sipengsui-api` berada pada dua deployment
yang berbeda dan tidak boleh dicampur:

- `WAHA_COOLIFY_ENV.example` berisi environment container WAHA di Coolify.
- `WAHA_SESSION_WEBHOOK.example.json` berisi payload konfigurasi webhook
  session WAHA.
- `sipengsui-api_coolify_env.example` berisi environment API SIPENGSUI untuk
  Coolify; `.env.docker.example` adalah padanan Docker/Compose lokal.

`WAHA_DASHBOARD_*`, `WHATSAPP_SWAGGER_*`, `WAHA_PUBLIC_URL`,
`WHATSAPP_DEFAULT_ENGINE`, dan `WAHA_NAMESPACE` adalah konfigurasi WAHA.
SIPENGSUI hanya membutuhkan URL/API key/session/engine expected serta secret
HMAC pada environment API-nya.

## Full local: PostgreSQL + WAHA + SIPENGSUI API

Gunakan stack lokal terpisah dari konfigurasi Coolify/production:

- `compose.waha.local.yaml` menjalankan `db`, `waha`, dan `api` dalam satu
  network Compose;
- `.env.waha.local.example` adalah template khusus container WAHA;
- `.env.api.waha.local.example` adalah template khusus SIPENGSUI API;
- `WAHA_SESSION_WEBHOOK.local.example.json` adalah template konfigurasi session
  WAHA lokal;
- `scripts/verify-whatsapp-local.mjs` menjalankan probe read-only terhadap health
  WAHA, route webhook, dan HMAC sintetis tanpa memanggil `/api/sendText`.

Pemetaan alamat full-local:

| Arah | URL |
|---|---|
| Browser/operator ke Dashboard WAHA | `http://localhost:3002/dashboard` |
| Browser/frontend ke SIPENGSUI API | `http://localhost:3000` |
| SIPENGSUI API container ke WAHA | `http://waha:3000` |
| WAHA container ke webhook API | `http://api:3000/whatsapp/webhook` |
| Frontend lokal | `http://localhost:3001` |

Jangan memakai `localhost` untuk komunikasi antar-container: di dalam container,
`localhost` berarti container itu sendiri. Jangan memakai database atau session
production untuk pengujian lokal.

### Menyiapkan environment lokal

Dari direktori `sipengsui-api`:

```bash
cp .env.api.waha.local.example .env.api.waha.local
cp .env.waha.local.example .env.waha.local
```

Isi nilai rahasia hanya pada dua file yang di-ignore tersebut:

1. Isi `JWT_SECRET` lokal khusus untuk API; jangan menyalin secret production.
2. Buat API key WAHA lokal dan isi nilai yang sama pada:
   - `.env.waha.local:WAHA_API_KEY`
   - `.env.api.waha.local:WAHA_API_KEY`
3. Buat HMAC key lain yang berbeda dari API key, lalu isi:
   - `.env.api.waha.local:WAHA_WEBHOOK_HMAC_KEY`
   - field `hmac.key` pada webhook session WAHA lokal
4. Buat password Dashboard WAHA dan isi hanya di `.env.waha.local`.
5. Pertahankan `WHATSAPP_ENABLED=false` selama setup awal.

Jalankan preflight terlebih dahulu. Pemeriksaan ini hanya menampilkan status
konfigurasi, bukan nilai secret:

```bash
npm run whatsapp:local:preflight
```

Preflight menolak file yang hilang, JWT secret yang kosong, API key yang
berbeda antara service, HMAC yang sama dengan API key, custom-secret yang masih
aktif, URL internal yang salah, engine mismatch, serta Dashboard yang nonaktif
atau tidak memiliki username/password lengkap.

Validasi kontrak Compose tanpa menjalankan container:

```bash
npm run whatsapp:local:config
```

Output service harus mencakup `db`, `waha`, dan `api`. Kemudian nyalakan Docker
Desktop dan jalankan:

```bash
npm run whatsapp:local:up
```

Untuk volume database lokal yang baru, jalankan seed development satu kali agar
akun, role, permission, dan data dasar tersedia:

```bash
npm run whatsapp:local:seed
```

Jangan jalankan seed development terhadap database non-lokal atau database yang
berisi data penting; mode tersebut dapat mereset data pengembangan. `tsx`
tersedia sebagai runtime dependency agar `prisma db seed` dapat berjalan di
image API production-style yang dipakai Compose lokal.

`compose.waha.local.yaml` memakai volume terpisah untuk database, session WAHA,
media WAHA, upload API, dan storage Rekomtek. Default amd64/Windows x64 dipin
ke `devlikeapro/waha:chrome-2026.8.1`, versi WEBJS yang menyediakan endpoint
session, timelock, dan capping yang diwajibkan verifier. `npm run
whatsapp:local:up` menarik image tersebut bila belum tersedia. Pada host ARM,
pilih tag ARM versi yang sama secara eksplisit:

```bash
WAHA_LOCAL_IMAGE=devlikeapro/waha:arm-2026.8.1 npm run whatsapp:local:up
```

Healthcheck Compose memanggil `GET /health` dengan `X-Api-Key`, bukan hanya
memeriksa port TCP. Jangan mengganti pin versi sebelum OpenAPI, response health,
engine, dan fixture webhook versi baru diverifikasi.

### Pairing provider dan webhook lokal

1. Buka `http://localhost:3002/dashboard` dan login ke Dashboard WAHA.
2. Buat/start session `default` dengan engine `WEBJS`.
3. Scan QR memakai **nomor layanan khusus**, bukan nomor pengguna penguji.
4. Konfigurasikan webhook session memakai nilai dari
   `WAHA_SESSION_WEBHOOK.local.example.json`:
   - URL `http://api:3000/whatsapp/webhook`;
   - event `message`, `message.ack`, dan `session.status`;
   - HMAC key yang sama dengan `WAHA_WEBHOOK_HMAC_KEY` milik API;
   - retry exponential, delay 2 detik, maksimal 15 percobaan.
5. Setelah menyimpan konfigurasi, tunggu session kembali berstatus `WORKING`.

Pairing QR di atas hanya menghubungkan nomor layanan ke WAHA. Pairing code dari
Profil SIPENGSUI adalah alur berbeda: nomor pengguna mengirim `PAIR <code>` ke
nomor layanan.

### Verifikasi aman sebelum aktivasi

Dengan API dan WAHA hidup tetapi `WHATSAPP_ENABLED=false`, jalankan:

```bash
npm run whatsapp:local:verify
```

Verifier membaca `.env.api.waha.local`, memeriksa tiga endpoint berikut dengan
`X-Api-Key`, dan tidak pernah mengirim pesan:

```text
GET /api/sessions/default
GET /api/sessions/default/timelock
GET /api/sessions/default/capping
```

Verifier hanya mengizinkan tujuan loopback HTTP pada port WAHA `3002` dan API
`3000`. Override yang menunjuk host remote, path tambahan, credential URL, atau
port lain ditolak sebelum API key maupun HMAC dikirim.

Hasil awal yang diharapkan:

- `provider.ready=true`;
- engine `WEBJS` dan status `WORKING`;
- route API `DISABLED_READY`;
- `messageSent=false`;
- probe bertanda tangan mengonfirmasi bahwa proses API masih disabled, tanpa
  memproses event.

Setelah hasil tersebut lulus, ubah hanya
`.env.api.waha.local:WHATSAPP_ENABLED=true`, lalu recreate API:

```bash
docker compose -f compose.waha.local.yaml up -d --force-recreate api
npm run whatsapp:local:verify
```

Pada mode aktif, verifier mengirim tepat satu event sintetis `local.probe`
dengan HMAC SHA-512. Event itu wajib menghasilkan `200 ignored`; jika file env
menyatakan aktif tetapi proses API masih disabled (atau sebaliknya), verifier
gagal dengan `SIPENGSUI_KILL_SWITCH_MISMATCH`. Event tidak disimpan sebagai
pesan dan tidak memicu router, outbox, workflow, atau `/api/sendText`.

Sesudah verifier lulus, gunakan nomor penguji terpisah untuk mengirim `MENU` ke
nomor layanan. Baru setelah inbound dan balasan nyata berhasil, lanjutkan uji
pairing pengguna, consent, `STATUS`, dan notifikasi workflow.

Log dan penghentian stack:

```bash
npm run whatsapp:local:logs
npm run whatsapp:local:down
```

`down` mempertahankan volume. Jangan menambahkan `-v` kecuali memang ingin
menghapus database serta session QR lokal dan melakukan pairing ulang.

## Setup operator SumoPod

1. Buat satu session khusus layanan di SumoPod.
2. Deployment ini menetapkan `WEBJS`: gunakan `WHATSAPP_DEFAULT_ENGINE=WEBJS`
   di container WAHA, pilih `WEBJS` pada form session, lalu isi
   `WAHA_EXPECTED_ENGINE=WEBJS` di API SIPENGSUI. Jika detail session WAHA
   menunjukkan engine berbeda, hentikan aktivasi dan selaraskan kedua nilai
   secara sengaja; jangan membiarkan mismatch.
3. Scan QR atau gunakan pairing code **hanya dari dashboard/API operator
   SumoPod**. SIPENGSUI tidak membuat, menghapus, me-restart, logout, atau
   memulai pairing session.
4. Konfigurasikan session webhook hanya untuk:
   - `message`
   - `message.ack`
   - `session.status`
5. Konfigurasikan HMAC webhook session menggunakan
   `WAHA_SESSION_WEBHOOK.example.json`. Isi `hmac.key` dengan secret yang
   sama dengan `sipengsui-api:WAHA_WEBHOOK_HMAC_KEY`, tetapi berbeda dari
   `WAHA_API_KEY`.
6. Set webhook URL ke:

   ```text
   https://api.sipengsui.id/whatsapp/webhook
   ```

7. Konfigurasikan retry webhook WAHA secara konservatif. Aplikasi SIPENGSUI
   tetap melakukan deduplikasi berdasarkan request ID dan provider message ID.
8. Pastikan firewall/reverse proxy hanya membuka endpoint API yang diperlukan.
   Jangan mengekspos API WAHA langsung ke internet tanpa API key dan firewall.
9. Pasang persistent volume Coolify untuk `/app/.sessions` dan `/app/.media`.
   Session QR harus tetap ada setelah redeploy; media WAHA tidak mengikuti
   retention database SIPENGSUI.

## Environment SIPENGSUI

Untuk resource API Coolify, gunakan `sipengsui-api_coolify_env.example`.
Untuk Docker/Compose lokal, gunakan `.env.docker.example`. Nilai rahasia harus
diisi operator pada secret manager/deployment platform, bukan repository:

```env
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=https://waha.sipengsui.id
WAHA_API_KEY=
WAHA_SESSION=default
WAHA_WEBHOOK_HMAC_KEY=
WAHA_WEBHOOK_CUSTOM_SECRET=
WAHA_EXPECTED_ENGINE=WEBJS
WHATSAPP_DISPATCH_LOCK_TTL_MS=120000
WHATSAPP_INBOX_MAX_ATTEMPTS=6
WHATSAPP_INBOX_RETRY_BASE_MS=15000
WHATSAPP_STATUS_RATE_LIMIT=10
WHATSAPP_STATUS_RATE_WINDOW_MINUTES=1
```

Saat `WHATSAPP_ENABLED=true`, API fail-fast bila base URL, API key, session,
engine, atau HMAC/custom secret belum tersedia. Production menolak mode custom-secret
dan mensyaratkan HMAC SHA-512.

`WAHA_BASE_URL` harus berupa URL HTTP(S) tanpa username/password dan harus
HTTPS pada production. Untuk deployment ini nilainya adalah
`https://waha.sipengsui.id`; jangan menambahkan anotasi URL, backtick, atau
path `/dashboard`/`/api`.

## Kontrak webhook

WAHA mengirim header:

- `X-Webhook-Request-Id`
- `X-Webhook-Timestamp` dalam Unix milliseconds
- `X-Webhook-Hmac`
- `X-Webhook-Hmac-Algorithm: sha512`

SIPENGSUI memverifikasi HMAC SHA-512 atas raw body sebelum parsing, memeriksa
clock skew, content type, dan ukuran body. Event selain `message`,
`message.ack`, dan `session.status` diabaikan.

Pesan hanya diproses jika:

- `payload.from` berakhiran `@c.us`;
- `fromMe` bernilai `false`;
- `source` bukan `api`;
- provider message ID tersedia;
- request ID belum pernah diproses.

Pesan grup, status, channel, pesan dari akun sendiri, dan event engine mentah
menghasilkan ignore tanpa echo.

## Status session dan outbound

Dispatcher melakukan health check singkat sebelum claim outbox. Pengiriman
ditahan jika status bukan `WORKING`, engine tidak sesuai, reachout timelock
aktif, atau message capping `CAPPED`. SIPENGSUI tidak otomatis logout,
restart, mengganti engine, atau re-pair session.

Pengiriman memakai:

```http
POST {WAHA_BASE_URL}/api/sendText
X-Api-Key: [REDACTED]
Content-Type: application/json
```

```json
{
  "session": "default",
  "chatId": "<digits>@c.us",
  "text": "...",
  "linkPreview": false
}
```

Domain menyimpan nomor E.164. Hanya adapter WAHA yang mengubahnya menjadi
`digits@c.us`. Semua pesan dirender oleh message registry dan masuk database
outbox dengan `messageKey`, `messageVersion`, teks snapshot, dan hash.

ACK dipetakan eksplisit:

| WAHA | Nilai | Audit SIPENGSUI |
|---|---:|---|
| `ERROR` | `-1` | `FAILED` |
| `PENDING` | `0` | `PENDING` |
| `SERVER` | `1` | `SENT` |
| `DEVICE` | `2` | `DELIVERED` |
| `READ` | `3` | `READ` |
| `PLAYED` | `4` | `READ` |

ACK yang tiba sebelum response send menyimpan audit orphan dan direkonsiliasi
ketika provider message ID sudah tersedia.

`sendStartedAt` adalah boundary reservation. Revocation membatalkan row
`PENDING`/`RETRY` dan `PROCESSING` yang belum memiliki `sendStartedAt`; send yang
sudah in-flight tidak dibatalkan secara retroaktif, dicatat sebagai boundary
operasional, dan hasil lokal yang gagal di-CAS dikarantina `DEAD` dengan provider
message ID agar tidak dikirim ulang otomatis.

## Pairing, consent, dan privasi

1. Pemohon membuat pairing code dari Profil SIPENGSUI.
2. Pemohon mengirim `PAIR <code>` atau token code mentah dari nomor yang akan
   ditautkan.
3. Setelah berhasil, Pemohon menjalankan `MULAI NOTIFIKASI`.
4. Pemohon mengonfirmasi dengan `SETUJU NOTIFIKASI`.
5. Percakapan AI publik membutuhkan `SETUJU LAYANAN`.
6. `BERHENTI` mencabut consent dan membatalkan outbox pending/retry.

Intent `STATUS` dibatasi per identity melalui `WHATSAPP_STATUS_RATE_LIMIT` dan
`WHATSAPP_STATUS_RATE_WINDOW_MINUTES`. Event inbound yang gagal diproses masuk
backoff `FAILED` sampai `WHATSAPP_INBOX_MAX_ATTEMPTS`; event yang sudah limit
tidak diputar ulang tanpa intervensi.

Nomor `User.phone` dan `DisasterReport.reporterPhone` tidak dianggap sebagai
bukti kepemilikan WhatsApp atau consent. Pairing code disimpan sebagai hash,
sekali pakai, berumur pendek, dan dibatasi percobaannya. Satu nomor hanya dapat
tertaut ke satu akun aktif.

## Operasional Rekomtek

- Perubahan tahap, penolakan final, penerbitan Dokumen Rekomtek, dan undangan
  Ekspose menghasilkan outbox hanya dalam transaksi event domain.
- `PENYUSUNAN_SURAT_PENOLAKAN` tidak mengirim `REJECTED`.
- `REJECTED` hanya dibuat setelah aksi final
  `TERBITKAN_SURAT_PENOLAKAN` memindahkan tahap ke `DITOLAK`.
- Undangan memakai `scheduleId`, `scheduleVersion`, peserta valid, consent,
  dan CTA web terautentikasi.
- Perubahan/pembatalan jadwal harus memakai command domain terlindungi bila
  fitur tersebut diaktifkan; jangan memalsukan transisi workflow.
- Peserta eksternal tidak menerima pesan tanpa identity provider dan consent
  khusus melalui bot.
- Outbox aktif memiliki marker `provider=waha`. Row legacy memakai marker
  `legacy_historical`, dikarantina `STALE`, dan tidak pernah di-claim dispatcher; constraint
  database mencegah writer legacy membuat row non-STALE setelah cutover.

## Monitoring dan fallback

Admin yang memiliki `users.manage` dapat memakai:

```text
GET  /whatsapp/admin/summary
GET  /whatsapp/admin/health
POST /whatsapp/admin/outbox/:id/requeue
```

Response admin hanya berisi agregat status, health session, engine, timelock,
capping, metrik, dan kode error aman. Tidak ada body pesan, QR, API key,
HMAC, atau URL privat.

Fallback ketika WAHA gagal:

- notifikasi in-app tetap dibuat;
- email best-effort tetap independen;
- outbox retry memakai lease, exponential backoff, jitter, dan `Retry-After`;
- status `DEAD` direqueue oleh admin setelah diagnosis;
- kill switch `WHATSAPP_ENABLED=false` menghentikan claim baru tanpa menghapus
  antrean atau histori.

## Rollback migration

Migration `20260901130000_migrate_whatsapp_to_waha` sengaja satu arah: row
outbox lama dipertahankan sebagai audit `STALE`, lalu kolom Meta-specific
dihapus setelah backfill. Rollback aplikasi harus memakai binary yang memahami
schema WAHA baru. Jika organisasi harus kembali ke schema sebelum migration,
gunakan backup database dan maintenance window yang disetujui; jangan memakai
`prisma migrate reset`, `prisma db push --force-reset`, atau menghapus volume.

## Keputusan operasional yang belum tersedia

Sebelum production, pemilik sistem masih harus menetapkan dan mencatat:

- URL instance SumoPod yang sebenarnya;
- API key dan HMAC key pada secret manager;
- nama session dan engine final;
- nomor khusus layanan;
- persetujuan risiko penggunaan API WhatsApp Web tidak resmi;
- kebijakan retensi pesan dan audit;
- SLA monitoring session;
- kanal eskalasi manusia;
- fixture webhook nyata dari instance SumoPod untuk engine/versi yang dipilih.
