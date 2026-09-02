# Deployment SIPENGSUI API dengan Docker

## Prasyarat

- Docker Engine + Docker Compose terinstall dan daemon berjalan.
  Cek: `docker info` (Linux) / Docker Desktop (Windows/macOS).
- Port `3000` (API) bebas (Postgres `5432` hanya internal antar-container).

## Struktur

| File | Fungsi |
|---|---|
| `Dockerfile` | Multi-stage build (node:22-alpine): build NestJS → production image |
| `docker-entrypoint.sh` | Menjalankan `prisma migrate deploy`, seed opsional, lalu start app |
| `compose.yaml` | Orchestrasi `api` + `db` (PostgreSQL 16) + volume (db, uploads). Self-contained — semua env punya default |
| `.env.docker.example` | Template environment Docker/Compose lokal |
| `sipengsui-api_coolify_env.example` | Template environment resource `sipengsui-api` di Coolify |

## Quick start (VPS / server)

```bash
git clone https://github.com/albaroktaha/sipengsui-api.git
cd sipengsui-api

# opsional: buat .env dari template (untuk JWT_SECRET, kredensial DB, dll.)
cp .env.docker.example .env

# wajib untuk production: set JWT_SECRET panjang & acak, mis.:
#   echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

docker compose up -d --build
```

- `compose.yaml` tidak membutuhkan file env — semua nilai punya default aman.
- Bila file `.env` ada di direktori yang sama, Compose otomatis membacanya dan
  nilainya menimpa default (interpolasi `${VAR:-default}`).
- `db` menjalankan healthcheck `pg_isready` — API menunggu DB siap.
- Entrypoint API otomatis menjalankan semua migration (`prisma migrate deploy`).

Cek log:

```bash
docker compose logs -f api
```

Swagger API: `http://localhost:3000/api`

## Konfigurasi environment (`.env`)

Semua variabel di bawah punya default di `compose.yaml`. Set lewat `.env` atau
environment platform (Render, Railway, VPS, dll.) untuk production:

| Variabel | Default | Keterangan |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `sipengsui` | Kredensial database |
| `JWT_SECRET` | `change-me-in-production` | **Wajib diganti** di production |
| `JWT_EXPIRES_IN` | `7d` | Masa berlaku token |
| `CORS_ORIGIN` | `http://localhost:3001` | URL frontend |
| `API_PORT` | `3000` | Port API di host |
| `TRUST_PROXY` | `1` pada Compose / `0` akses langsung | Jumlah reverse proxy di depan API; sesuaikan dengan jumlah hop Cloudflare/Nginx/load balancer |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | kosong | SMTP untuk email verifikasi (kosong = dev mode, email di-log) |
| `APP_URL` | `http://localhost:3001` | URL web untuk link verifikasi |
| `RECAPTCHA_SECRET_KEY` / `RECAPTCHA_SITE_KEY` | kosong | reCAPTCHA v2 (kosong = dilewati) |
| `GEMINI_API_KEY` | kosong | Chatbot AI |
| `WHATSAPP_ENABLED` | `false` | Kill switch. Tetap `false` sampai instance SumoPod/WAHA, secret, dan persetujuan risiko siap |
| `WHATSAPP_PROVIDER` | `waha` | Provider port yang dipakai aplikasi; jangan mengubah tanpa adapter yang teruji |
| `WAHA_BASE_URL` / `WAHA_SESSION` / `WAHA_EXPECTED_ENGINE` | `https://waha.sipengsui.id` / `default` / `WEBJS` | Konfigurasi deployment ini: URL WAHA, nama sesi, dan engine yang dikonfirmasi pada form session |
| `WAHA_API_KEY` / `WAHA_WEBHOOK_HMAC_KEY` | kosong | Secret outbound dan HMAC inbound; simpan di secret manager, jangan dicatat di log |
| `WAHA_WEBHOOK_CUSTOM_SECRET` | kosong | Fallback header `X-Webhook-Secret` bila HMAC SumoPod belum tersedia; **bukan production-ready** |
| `WAHA_WEBHOOK_MAX_CLOCK_SKEW_SECONDS` / `WAHA_SESSION_HEALTH_CACHE_MS` | `300` / `10000` | Toleransi replay timestamp dan TTL cache health sesi |
| `WAHA_SEND_MIN_INTERVAL_MS` | `1500` | Pacing minimum antar pengiriman; sesuaikan hanya setelah persetujuan operasional |
| `WHATSAPP_DISPATCH_LOCK_TTL_MS` | `120000` | TTL lock DB per session untuk mencegah cron/replica overlap |
| `WHATSAPP_INBOX_MAX_ATTEMPTS` / `WHATSAPP_INBOX_RETRY_BASE_MS` | `6` / `15000` | Batas dan backoff retry inbound `FAILED` |
| `WHATSAPP_STATUS_RATE_LIMIT` / `WHATSAPP_STATUS_RATE_WINDOW_MINUTES` | `10` / `1` | Batas intent `STATUS` per identity |
| `WHATSAPP_MESSAGE_*_VERSION` | `v1` | Versi teks message registry untuk audit dan deduplikasi; naikkan bila copy berubah |
| `WHATSAPP_EXPOSE_REMINDERS_ENABLED` | `false` | Reminder Ekspose opsional; offset di `WHATSAPP_EXPOSE_REMINDER_OFFSETS_MINUTES` |
| `RUN_SEED` | `false` | `true` sekali pada deploy pertama |

Daftar lengkap: lihat `.env.docker.example`.
Runbook provider dan rollback: `WHATSAPP_WAHA_RUNBOOK.md`.
Template environment WAHA Coolify: `WAHA_COOLIFY_ENV.example`.
Template webhook session WAHA: `WAHA_SESSION_WEBHOOK.example.json`.

## WhatsApp WAHA/SumoPod MVP

Integrasi menggunakan WAHA yang di-host oleh SumoPod. WAHA memakai sesi
WhatsApp Web dan bukan API resmi/terotorisasi WhatsApp; penggunaan production
adalah keputusan risiko operasional. Default fitur tetap **nonaktif**.

### Konfigurasi Coolify: dua aplikasi terpisah

Jangan menyalin satu blok environment ke dua aplikasi. Coolify memiliki dua
resource yang berbeda:

1. `waha` — container WAHA, Dashboard, engine, dan storage session.
2. `sipengsui-api` — API, database/outbox/inbox, webhook verifier, dan worker.

#### A. Resource `waha`

Gunakan `WAHA_COOLIFY_ENV.example` sebagai daftar environment untuk resource
WAHA. Nilai deployment yang ditetapkan:

```env
WAHA_API_KEY=
WAHA_BASE_URL=https://waha.sipengsui.id
WAHA_PUBLIC_URL=https://waha.sipengsui.id
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=
WAHA_DASHBOARD_ENABLED=true
WHATSAPP_SWAGGER_ENABLED=false
WHATSAPP_DEFAULT_ENGINE=WEBJS
WAHA_NAMESPACE=all
WAHA_CLIENT_DEVICE_NAME=SIPENGSUI
WAHA_LOG_FORMAT=JSON
WAHA_LOG_LEVEL=info
WAHA_PRINT_QR=false
WAHA_MEDIA_STORAGE=LOCAL
WHATSAPP_FILES_LIFETIME=0
WHATSAPP_FILES_FOLDER=/app/.media
```

Pasang persistent storage pada resource `waha`:

```text
/app/.sessions
/app/.media
```

`WAHA_API_KEY`, password Dashboard, dan password Swagger harus dibuat sebagai
Coolify Secret/Environment Secret. Jangan menaruh nilainya di Git.

#### B. Resource `sipengsui-api`

Gunakan `sipengsui-api_coolify_env.example` sebagai daftar environment resource
API di Coolify. `.env.docker.example` tetap menjadi template Docker/Compose
lokal. Bagian WAHA
yang harus berada pada resource `sipengsui-api` adalah:

```env
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=https://waha.sipengsui.id
WAHA_API_KEY=
WAHA_SESSION=default
WAHA_WEBHOOK_HMAC_KEY=
WAHA_WEBHOOK_CUSTOM_SECRET=
WAHA_EXPECTED_ENGINE=WEBJS
```

Nilai berikut adalah konfigurasi internal API dan tetap berada di resource
`sipengsui-api`, bukan di resource `waha`:

```env
WAHA_WEBHOOK_MAX_CLOCK_SKEW_SECONDS=300
WAHA_SESSION_HEALTH_CACHE_MS=10000
WAHA_SEND_MIN_INTERVAL_MS=1500
WHATSAPP_DEFAULT_COUNTRY_CODE=62
WHATSAPP_DEFAULT_LANGUAGE=id
WHATSAPP_WEBHOOK_MAX_BODY_BYTES=262144
WHATSAPP_OUTBOX_BATCH_SIZE=25
WHATSAPP_DISPATCH_LOCK_TTL_MS=120000
WHATSAPP_MAX_ATTEMPTS=6
WHATSAPP_INBOX_MAX_ATTEMPTS=6
WHATSAPP_INBOX_RETRY_BASE_MS=15000
WHATSAPP_CONNECT_TIMEOUT_MS=5000
WHATSAPP_RESPONSE_TIMEOUT_MS=10000
WHATSAPP_RETENTION_DAYS=90
WHATSAPP_STATUS_RATE_LIMIT=10
WHATSAPP_STATUS_RATE_WINDOW_MINUTES=1
WHATSAPP_EXPOSE_REMINDERS_ENABLED=false
```

`WAHA_EXPECTED_ENGINE=WEBJS` wajib berada di API karena kode SIPENGSUI
memakai nilai ini untuk memeriksa bahwa session WAHA benar-benar memakai
engine yang dipilih. `WHATSAPP_DEFAULT_ENGINE=WEBJS` memilih engine pada
resource WAHA; kedua nilai harus sama.

#### C. Webhook session WAHA

Pada form session WAHA `default`, gunakan:

```text
URL: https://api.sipengsui.id/whatsapp/webhook
Events: message, message.ack, session.status
Engine: WEBJS
```

Isi HMAC key pada form webhook dengan secret yang sama dengan
`sipengsui-api:WAHA_WEBHOOK_HMAC_KEY`. Biarkan:

```env
WAHA_WEBHOOK_CUSTOM_SECRET=
```

`WAHA_SESSION_WEBHOOK.example.json` adalah template payload untuk form/API
tersebut. Setelah QR dipindai, status session harus `WORKING` sebelum kill
switch API diubah menjadi `WHATSAPP_ENABLED=true`.

Saat mengaktifkan production, isi URL instance SumoPod, API key, nama sesi,
engine yang benar-benar digunakan, dan HMAC webhook. API akan fail-fast bila
`WHATSAPP_ENABLED=true` tetapi konfigurasi wajib belum tersedia atau base URL
production bukan HTTPS. Aplikasi tidak membuat, menghapus, me-restart, atau
men-scan sesi WAHA; operasi pairing QR dilakukan operator melalui SumoPod.

Konfigurasikan webhook sesi SumoPod/WAHA ke:

```text
https://api.sipengsui.id/whatsapp/webhook
```

WAHA mengirim event `message`, `message.ack`, dan `session.status` dengan
`X-Webhook-Request-Id`, `X-Webhook-Timestamp`, `X-Webhook-Hmac`, serta
`X-Webhook-Hmac-Algorithm: sha512`. Aplikasi memverifikasi HMAC SHA-512 dari
raw body, timestamp, request ID, ukuran body, dan content type sebelum
persistence. Hanya event `message` dari chat langsung `@c.us` yang diproses;
grup, status, channel, pesan `fromMe`, dan source `api` diabaikan. Jika
SumoPod belum mendukung HMAC, fallback sementara memakai `X-Webhook-Secret`
dan tetap mewajibkan timestamp/request ID; health menandainya
`CUSTOM_SECRET_NOT_PRODUCTION_READY` dan jaringan sumber wajib dibatasi oleh
firewall/reverse proxy sebelum dipertimbangkan untuk uji terbatas.

Event valid disimpan sebagai inbox idempoten lalu diproses asynchronous.
Pengiriman selalu melalui database outbox dan adapter `WahaWhatsAppProvider`;
controller atau workflow tidak pernah memanggil WAHA secara langsung.

Alur pengguna:

1. Pengguna membuka Profil SIPENGSUI dan membuat pairing code.
2. Pengguna mengirim `PAIR <code>` dari nomor WhatsApp yang ingin ditautkan.
3. Setelah tertaut, pengguna mengirim `MULAI NOTIFIKASI`, membaca penjelasan,
   lalu mengirim `SETUJU NOTIFIKASI`.
4. Pengguna dapat mengirim `STATUS` atau `STATUS <nomor>` untuk data miliknya
   sendiri. Nomor yang tidak dimiliki menghasilkan pesan generik.
5. `BERHENTI` mencabut seluruh consent pesan keluar dan `DELETE /whatsapp/me`
   memutus tautan akun.

Notifikasi transaksional masuk database outbox hanya untuk identity aktif,
terverifikasi, dan consent yang masih aktif. Dispatcher melakukan health check
sesi `WORKING`, menahan claim saat sesi non-`WORKING`, reachout timelock, atau
message capping, lalu memakai claim lease, retry exponential backoff dengan
jitter, pacing, pemeriksaan stale schedule, dan status ACK monoton. Reminder
`WHATSAPP_EXPOSE_REMINDERS_ENABLED` tetap `false` secara default. Summary
operasional tersedia di `GET /whatsapp/admin/summary` untuk pemilik permission
`users.manage`; health internal tidak menampilkan secret atau payload.

Jangan menaruh API key WAHA, HMAC key, nomor lengkap, QR/session data, isi
payload provider, atau dokumen privat di log, checkpoint, commit, atau issue
tracker. Gunakan secret manager pada production.

## Seed database (deploy pertama)

Set sekali pada deploy pertama:

```bash
# di .env
RUN_SEED=true
```

lalu restart API:

```bash
docker compose up -d --build api
```

Setelah seed selesai, kembalikan `RUN_SEED=false` agar tidak berjalan ulang tiap restart.

> Seed membuat user admin + permissions awal. Kredensial admin bisa dilihat di `prisma/seed.ts`.

## Operasional

```bash
docker compose ps                # status
docker compose logs -f api       # log API
docker compose logs -f db        # log DB
docker compose down              # stop (data tersimpan di volume)
docker compose down -v           # stop + hapus volume (HATI-HATI: hapus data)
docker compose pull              # update image postgres
```

Volume:
- `sipengsui-api_db-data` — data PostgreSQL
- `sipengsui-api_uploads-data` — file upload publik/legacy (`/app/uploads`: GIS maps, news, disaster reports)
- `sipengsui-api_rekomtek-storage-data` — storage privat checklist Rekomtek (`/app/storage/rekomtek-berkas`)

Update versi baru:

```bash
git pull
docker compose up -d --build
```

### Build image manual (tanpa compose)

```bash
docker build -t sipengsui-api .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/sipengsui?schema=public" \
  -e JWT_SECRET="ganti-dengan-secret-panjang" \
  -v sipengsui-uploads:/app/uploads \
  sipengsui-api
```

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `error during connect... docker daemon is not running` | Start Docker Desktop / service docker |
| `env file ... not found` | Pastikan memakai `compose.yaml` (bukan yang mereferensikan `.env.docker`); file ini self-contained |
| API restart terus (`db` belum siap) | Pastikan healthcheck db hijau: `docker compose ps` |
| `PrismaClientInitializationError` (query engine) | Image production sudah include `openssl`; pastikan `DATABASE_URL` benar |
| Upload checklist berstatus `Pending Check` | Konfigurasikan `REKOMTEK_ANTIVIRUS_COMMAND` dengan executable ClamAV/scanner dan pastikan volume `/app/storage` tersedia |
| File privat checklist tidak ditemukan | Pastikan volume `rekomtek-storage-data` terpasang dan cek `docker compose exec api ls /app/storage/rekomtek-berkas` |
| Upload 404 di `/uploads/...` | Pastikan file legacy tersimpan: `docker compose exec api ls /app/uploads`; static serve memakai `process.cwd()/uploads` |
| Migration error "table already exists" | Database sudah pernah di-migrate; jangan `down -v` kecuali sengaja reset |
