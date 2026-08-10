#!/bin/sh
set -e

echo "[entrypoint] Menjalankan prisma migrate deploy..."
npx prisma migrate deploy

# Jalankan seed hanya jika env RUN_SEED=true (sekali saja untuk data awal)
if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] Menjalankan seed database..."
  npx prisma db seed
fi

echo "[entrypoint] Memulai SIPENGSUI API..."
exec node dist/src/main
