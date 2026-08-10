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
| `.env.docker.example` | Template variabel environment (opsional, untuk referensi) |

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
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | kosong | SMTP untuk email verifikasi (kosong = dev mode, email di-log) |
| `APP_URL` | `http://localhost:3001` | URL web untuk link verifikasi |
| `RECAPTCHA_SECRET_KEY` / `RECAPTCHA_SITE_KEY` | kosong | reCAPTCHA v2 (kosong = dilewati) |
| `GEMINI_API_KEY` | kosong | Chatbot AI |
| `RUN_SEED` | `false` | `true` sekali pada deploy pertama |

Daftar lengkap: lihat `.env.docker.example`.

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
- `sipengsui-api_uploads-data` — file upload (`/app/uploads`: GIS maps, rekomtek berkas, disaster reports)

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
| Upload 404 di `/uploads/...` | Pastikan file tersimpan: `docker compose exec api ls /app/uploads`; static serve memakai `process.cwd()/uploads` |
| Migration error "table already exists" | Database sudah pernah di-migrate; jangan `down -v` kecuali sengaja reset |
