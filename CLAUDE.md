# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sipengsui v2.0** is a hydrology observation data management system for Indonesia's water resources monitoring. It manages rainfall (ARR) and water level (AWLR) station data with Excel import capabilities.

Two sub-projects in this monorepo:
- **`sipengsui-api`** — NestJS 11 backend with Prisma ORM + PostgreSQL
- **`sipengsui-web`** — Next.js 16 frontend (currently default boilerplate only)

## API Commands

```bash
# Run in D:\Inovasi\sipengsui-v2.0\sipengsui-api

# Development (watch mode)
npm run start:dev

# Production build & start
npm run build
npm run start:prod

# Prisma
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run pending migrations
npm run prisma:seed        # Seed database (tsx prisma/seed.ts)

# Testing
npm run test               # Unit tests
npm run test:watch         # Watch mode
npm run test:cov           # Coverage
npm run test:e2e           # E2E tests

# Lint & Format
npm run lint
npm run format

# Debug
npm run start:debug
```

## Web Commands

```bash
# Run in D:\Inovasi\sipengsui-v2.0\sipengsui-web

npm run dev       # Next.js dev server (default port 3000)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
```

## Architecture

### NestJS Backend Structure

```
sipengsui-api/src/
├── main.ts                         # Bootstrap: Swagger + ValidationPipe on port 3000
├── app.module.ts                   # Root module — registers all feature modules
├── prisma/
│   ├── prisma.module.ts            # Global Prisma module (exported to all modules)
│   └── prisma.service.ts           # Extends PrismaClient, connects on module init
├── auth/                           # JWT authentication
│   ├── jwt.strategy.ts             # Passport JWT strategy (Bearer token)
│   ├── guards/jwt-auth.guard.ts    # Route guard
│   ├── auth.service.ts             # Register (bcrypt hash) + Login (JWT sign)
│   └── dto/                        # LoginDto, RegisterDto
├── users/                          # User CRUD, findByEmail, findUserRole
├── river-regions/                  # Wilayah Sungai (WS) — CRUD
├── watersheds/                     # Daerah Aliran Sungai (DAS) — CRUD
├── rivers/                         # Sungai — hierarchical (parent/child via self-relation)
├── stations/                       # Stasiun ARR/AWLR — CRUD
├── observations/                   # Data hidrologi (CRUD + pagination)
├── imports/                        # Excel import pipeline (the most complex module)
│   ├── parsers/                    # Factory pattern: base → ARR/AWLR parsers
│   ├── validators/                 # Per-type validators (arr, awlr, station, rainfall, date)
│   ├── services/                   # Pipeline: upload → preview → parse → validate → save
│   └── helpers/                    # ExcelHelper (xlsx read), ImportTypeHelper (auto-detect)
├── import-histories/               # Import audit trail
├── dashboard/                      # Aggregate counts (river regions, stations, observations, etc.)
└── analytics/                      # Placeholder module
```

### Import Pipeline (most complex flow)

1. **Upload** (`POST /imports/upload`) — file received as multipart via `multer` memory storage
2. **Preview** (`ImportPreviewService.preview`) — reads Excel with `xlsx`, detects ARR/AWLR type, parses rows, validates
3. **Draft** — validated data saved as `ImportDraft` (JSON) with 1-hour expiry
4. **Confirm** (`POST /imports/confirm`) — draft ID submitted → observations saved to DB + import history recorded

### Controllers: standard RESTful pattern

Every module follows CRUD, but observations use a custom endpoint set:
| Endpoint | Method | Description |
|---|---|---|
| `/observations` | GET | Paginated list with filters (stationId, date range, keyword, source) |
| `/observations` | POST | Create manual observation |
| `/observations/latest` | GET | Last 20 observations |
| `/observations/station/:stationId` | GET | By station |
| `/observations/:id` | GET/PATCH/DELETE | Single observation CRUD |

### Validation Pattern

All DTOs use `class-validator` + `class-transformer`. Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` strips unknown fields.

### Prisma Schema Highlights

- **`Station`** — enum `StationType` (`ARR` | `AWLR`), linked to `Watershed` and optional `River`
- **`Observation`** — compound unique `[stationId, observationDate]`, indexed on station + date
- **`ObservationDetail`** — sub-hourly readings (water level + discharge per time)
- **`ImportDraft`** — ephemeral (1-hour expiry), stores parsed JSON rows + metadata
- **Enums**: `RoleType`, `StationType`, `ObservationSource`, `ImportType`
- **Roles**: `SUPER_ADMIN` | `ADMIN` | `PETUGAS` | `PIMPINAN` | `USER`

### Key Environment Variables (.env)

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/sipengsui_tester?schema=public"
JWT_SECRET="sipengsui-super-secret"
JWT_EXPIRES_IN="7d"
PORT=3000
```

## Code Conventions

- **NestJS modular architecture** — each feature is a self-contained module with controller, service, module file
- **Swagger decorators** — `@ApiTags`, `@ApiOperation({ summary: '...' })` on all endpoints
- **Indonesian-language summaries** in Swagger decorators (`@ApiOperation({ summary: 'Tambah observation manual' })`)
- **Error messages** in Indonesian (`'Station tidak ditemukan'`, `'Observation tidak ditemukan'`)
- **Prisma transaction** `$transaction([findMany, count])` for paginated queries
- **Naming**: kebab-case for files, PascalCase for classes, camelCase for methods/variables
- **Service → Controller dependency**: services are stateless, injected via constructor DI
- **DTO files** co-located with their module (not in a shared folder)
- **No `baseUrl`** in tsconfig — imports use relative paths (`../../prisma/prisma.service`)