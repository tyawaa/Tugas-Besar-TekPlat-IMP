# Tugas-Besar-TekPlat-IMP

IoTBridge MVP built with Next.js App Router.

## Development

```bash
pnpm install
pnpm dev
```

## Production Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for Vercel deployment, PostgreSQL storage, and ESP32 integration steps.

## Backend Architecture

Backend API routes keep HTTP parsing and response handling close to Next.js. Business rules live in service classes, for example telemetry ingestion is handled by `lib/services/telemetry-service.ts`. Data access goes through `lib/server-data-store.ts`, which selects PostgreSQL when `DATABASE_URL` or `POSTGRES_URL` is configured and falls back to local JSON/Redis for development.

PostgreSQL schema changes are tracked through SQL migrations in `database/migrations/`. Run migrations with:

```bash
pnpm db:migrate
```
