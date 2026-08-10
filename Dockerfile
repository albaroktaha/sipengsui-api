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

# Prisma needs openssl at runtime
RUN apk add --no-cache openssl

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma CLI is needed to run migrations (keep only the CLI + engine, not the client libs)
RUN npx prisma generate

# Copy built output
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Create uploads dir for multer
RUN mkdir -p /app/uploads

EXPOSE 3000

# Run migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
