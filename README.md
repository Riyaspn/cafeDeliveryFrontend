# CafeQR Delivery Frontend

Next.js 14 customer-facing delivery ordering app for CafeQR.

## Infrastructure

| Service | Technology | Purpose |
|---|---|---|
| **Database** | PostgreSQL 16 (Docker) | Primary data store — all reads/writes |
| **Cache / OTP** | Redis 7 (Docker) | OTP TTL, rate limiting, session tokens |
| **Message Queue** | RabbitMQ 3.13 (Docker) | Async order events, notification jobs |
| **Realtime** | Supabase Realtime | Live order status on tracking page only |
| **Email** | Gmail API (OAuth2) | OTP email, order confirmation, receipts |
| **Push** | Firebase FCM | Push notifications (customer, restaurant, agent) |
| **Hosting** | Vercel / VPS | Next.js frontend deployment |

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with real values

# 3. Start Docker services
docker compose up -d

# 4. Run DB migrations
node scripts/db-migrate.js

# 5. Start Next.js dev server
npm run dev

# 6. Start notification worker (separate terminal)
node workers/notificationWorker.js
```

## Gmail OAuth2 Setup (one-time)

```bash
# Run the token helper script — follow the printed instructions
node scripts/gmail-get-token.js
```

Requires: Gmail API enabled, OAuth2 credentials created in [Google Cloud Console](https://console.cloud.google.com).

## DB Migrations

SQL files in `db/migrations/` are run in alphabetical order.
- `001_delivery_tables.sql` — creates all delivery-specific tables
- `002_triggers.sql` — updated_at triggers, pg_notify, views

They are also auto-mounted into the PostgreSQL Docker container at `docker-entrypoint-initdb.d/` so they run automatically on first `docker compose up`.

## RabbitMQ Management UI

Available at `http://localhost:15672` when running locally. Default credentials from `.env.local`.
