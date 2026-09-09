#!/bin/sh
set -e

has_clamav_database() {
  for database in /var/lib/clamav/*.cvd /var/lib/clamav/*.cld; do
    if [ -f "$database" ]; then
      return 0
    fi
  done
  return 1
}

prepare_antivirus() {
  scanner="${REKOMTEK_ANTIVIRUS_COMMAND:-}"
  if [ -z "$scanner" ]; then
    if [ "${NODE_ENV:-}" = "production" ]; then
      echo "[entrypoint] ERROR: REKOMTEK_ANTIVIRUS_COMMAND wajib di production." >&2
      exit 1
    fi
    echo "[entrypoint] Antivirus tidak dikonfigurasi; upload akan berstatus Pending Check."
    return
  fi

  if ! command -v "$scanner" >/dev/null 2>&1; then
    echo "[entrypoint] ERROR: executable antivirus tidak ditemukan: $scanner" >&2
    exit 1
  fi

  if [ "$(basename "$scanner")" != "clamscan" ]; then
    echo "[entrypoint] Scanner eksternal siap: $scanner"
    return
  fi

  mkdir -p /var/lib/clamav
  chown -R clamav:clamav /var/lib/clamav
  echo "[entrypoint] Memperbarui database signature ClamAV..."
  if ! freshclam --quiet; then
    if ! has_clamav_database; then
      echo "[entrypoint] ERROR: Tidak ada database signature ClamAV yang dapat digunakan." >&2
      exit 1
    fi
    echo "[entrypoint] PERINGATAN: update signature gagal; memakai database persisten yang tersedia." >&2
  fi

  if [ "${CLAMAV_FRESHCLAM_DAEMON:-true}" = "true" ]; then
    echo "[entrypoint] Menjalankan updater signature ClamAV berkala."
    freshclam --daemon --foreground \
      --checks="${CLAMAV_FRESHCLAM_CHECKS:-12}" --stdout &
  fi
}

prepare_antivirus

echo "[entrypoint] Menjalankan prisma migrate deploy..."
npx prisma migrate deploy

# Jalankan seed hanya jika env RUN_SEED=true (sekali saja untuk data awal)
if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] Menjalankan seed database..."
  npx prisma db seed
fi

echo "[entrypoint] Memulai SIPENGSUI API..."
exec node dist/src/main
