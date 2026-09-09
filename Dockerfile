# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source + prisma schema
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
COPY test ./test

# Generate Prisma client & build
RUN npx prisma generate
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV REKOMTEK_ANTIVIRUS_COMMAND=clamscan
ENV REKOMTEK_ANTIVIRUS_TIMEOUT_MS=120000
ENV CLAMAV_FRESHCLAM_CHECKS=12
ENV CLAMAV_FRESHCLAM_DAEMON=true

# Prisma membutuhkan OpenSSL. Rekomtek memakai ClamAV untuk memindai file
# privat sebelum artefak dapat difinalkan.
RUN apk add --no-cache openssl clamav-scanner freshclam \
    && mkdir -p /var/lib/clamav \
    && chown -R clamav:clamav /var/lib/clamav

# Install production deps (prisma CLI included so `migrate deploy` works at runtime)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output + migrations
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Generate Prisma client for the production deps
RUN npx prisma generate

# Entrypoint: migrate deploy (+ optional seed) then start the app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Uploads live on a volume; dir must exist for static serving
RUN mkdir -p /app/uploads

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
