# Deployment SIPENGSUI API dengan Docker

## Prasyarat

- Docker Engine + Docker Compose terinstall dan daemon berjalan.
  Cek: `docker info` (Linux) / Docker Desktop (Windows/macOS).
- Port `3000` (API) dan `5432` (Postgres, internal) bebas.

## Struktur

| File | Fungsi |
|---|---|
| `Dockerfile` | Multi-stage build (node:22-alpine): build NestJS → production image |
| `docker-entrypoint.sh` | Menjalankan `prisma migrate deploy`, seed opsional, lalu start app |
| `docker-compose.yml` | Orchestrasi `api` + `db` (PostgreSQL 16) + volume (db, uploads) |
| `.env.docker.example` | Template environment untuk container |

## Setup

### 1. Siapkan environment

```bash
cp .env.docker.example .env.docker
```

Lalu edit `.env.docker`:

- **Wajib**: ganti `JWT_SECRET` dengan string acak panjang (mis. `openssl rand -hex 32`)
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — kredensial database (ubah di production)
- `CORS_ORIGIN` — URL frontend
- `MAIL_*` — SMTP untuk email verifikasi (kosongkan di dev)
- `GEMINI_API_KEY` — untuk fitur chatbot
- `RECAPTCHA_*` — jika reCAPTCHA aktif

> `.env.docker` berisi secret dan tidak di-commit (sudah di .gitignore).

### 2. Build & jalankan

```bash
docker compose up -d --build
```

- `db` menjalankan healthcheck `pg_isready` — API menunggu DB siap.
- Entrypoint API otomatis menjalankan semua migration (`prisma migrate deploy`).

Cek log:

```bash
docker compose logs -f api
```

Swagger API: `http://localhost:3000/api`

### 3. Seed database (deploy pertama)

Set sekali pada deploy pertama:

```bash
# di .env.docker
RUN_SEED=true
```

lalu restart API:

```bash
docker compose up -d --build api
```

Setelah seed selesai, kembalikan `RUN_SEED=false` agar tidak berjalan ulang tiap restart.

> Seed membuat user admin + permissions awal. Kredensial admin bisa dilihat di `prisma/seed.ts`.

### 4. Operasional

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

### 5. Deploy ke server (VPS)

Di server:

```bash
git clone https://github.com/albaroktaha/sipengsui-api.git
cd sipengsui-api
cp .env.docker.example .env.docker
# edit .env.docker (JWT_SECRET, POSTGRES_PASSWORD, CORS_ORIGIN, MAIL_*, dll)
docker compose up -d --build
```

Update versi baru:

```bash
git pull
docker compose up -d --build
```

### Build image manual (tanpa compose)

```bash
docker build -t sipengsui-api .
docker run --rm -p 3000:3000 \
  --env-file .env.docker \
  -e DATABASE_URL="postgresql://user:pass@host:5432/sipengsui?schema=public" \
  -v sipengsui-uploads:/app/uploads \
  sipengsui-api
```

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `error during connect... docker daemon is not running` | Start Docker Desktop / service docker |
| API restart terus (`db` belum siap) | Pastikan healthcheck db hijau: `docker compose ps` |
| `PrismaClientInitializationError` (query engine) | Image production sudah include `openssl`; pastikan `DATABASE_URL` benar |
| Upload 404 di `/uploads/...` | Pastikan file tersimpan: `docker compose exec api ls /app/uploads`; static serve memakai `process.cwd()/uploads` |
| Migration error "table already exists" | Database sudah pernah di-migrate; jangan `down -v` kecuali sengaja reset |
