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

## Payment Production Notes

- Use PostgreSQL for production payment safety. JSON/Redis fallback storage is suitable for demo/development, but it cannot enforce the partial unique index that prevents more than one active `PENDING` order per access request. Payment routes reject production runtime storage without PostgreSQL unless `IOTBRIDGE_ALLOW_UNSAFE_PAYMENT_STORAGE=true` is explicitly set for demo-only deployments.
- Before applying migration `007_payment_attempts_and_statuses.sql` to existing production data, run the duplicate `PENDING` diagnostic query in that migration and resolve duplicates manually.
- Owner approve/reject, request cancellation local state, admin payout/refund actions, and Midtrans webhook/status local sync use PostgreSQL transactions for local DB updates and audit logs. Midtrans API calls remain external side effects and should be reconciled if they fail mid-flow.
- Admins can manually reconcile old pending payments with `POST /api/payments/midtrans-reconcile`. Send `{ "dryRun": true }` to inspect old `PENDING` orders without mutation. A scheduled reconciliation job and production monitoring alerts are still recommended for real deployments.
- Refunds are manual tracking in this MVP: `REFUND_REQUIRED` means an admin must process the refund outside the app, and `REFUNDED` means the admin manually marked it complete. The Midtrans Refund API is not implemented.
- To implement Midtrans Refund API honestly, add payout/refund lifecycle states such as `REFUND_REQUESTED` and `REFUND_FAILED`, refund metadata columns for request id, amount, reason, status, requested/completed timestamps, and a safe response summary, then add an admin backend action that only marks `REFUNDED` after Midtrans confirms completion.
