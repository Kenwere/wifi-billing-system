# WiFi Hotspot Billing and Management System

Next.js full-stack SaaS platform for hotspot billing, MikroTik router operations, captive portal access, session tracking, and analytics.

## Stack

- Backend/API: Next.js Route Handlers (Node runtime), TypeScript
- Frontend: Next.js App Router + React
- Storage: Firebase Firestore (`app_state/singleton`) with JSON file fallback (`data/db.json`) for local development
- Auth: JWT (HTTP-only cookie + bearer support), RBAC
- Router integration: MikroTik service abstraction (`lib/mikrotik.ts`)

## Features Implemented

- Admin authentication and role-based permissions (`super_admin`, `admin`, `operator`, `support`)
- Admin user management
- Multi-router management with per-router payment destination settings
- One-click MikroTik setup endpoint (`/api/routers/:id/setup`)
- WiFi package CRUD + activate/deactivate
- Captive portal flow
- Payment checkout flow with real M-Pesa STK initiation and callback endpoints
- Session management (active/expired/disconnected) with auto-expiry enforcement
- Immediate disconnection API for manual admin cutoff
- Payment logs
- Voucher generation + redemption
- Dashboard analytics:
  - Daily/weekly/monthly/yearly earnings
  - Active/expired sessions
  - Total users today
  - Total revenue
  - Top user ranking
- SaaS subscription lock enforcement:
  - 14-day trial
  - Locking access when unpaid
  - Projected monthly fee calculation

## Initial Setup

- Register your first admin from `/admin` using **New admin? Register**.
- No default admin credentials are seeded in production-safe startup.

## Local Run

```bash
npm install
npm run dev
```

- Home: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin`
- Portal: `http://localhost:3000/portal/<routerId>`

## Environment Variables

Create `.env.local`:

```env
JWT_SECRET=change_this_secret
MIKROTIK_LIVE_MODE=false
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=YOUR_CONSUMER_KEY
MPESA_CONSUMER_SECRET=YOUR_CONSUMER_SECRET
MPESA_SHORTCODE=174379
MPESA_PASSKEY=YOUR_PASSKEY
MPESA_CALLBACK_URL=https://YOUR_DOMAIN/api/payments/mpesa/callback
MPESA_SIMULATE=false
```

- `MIKROTIK_LIVE_MODE=false` keeps router actions in safe simulation mode.
- Set `MIKROTIK_LIVE_MODE=true` and implement real RouterOS API calls in `lib/mikrotik.ts`.
- If Firebase env vars are set, the app uses Firestore.
- If Firebase env vars are missing, the app automatically falls back to `data/db.json`.
- Set `MPESA_SIMULATE=true` for local testing without hitting Safaricom APIs.

## Firebase Setup

1. Create a Firebase project.
2. Enable Firestore Database.
3. Create a service account key (Firebase Console -> Project Settings -> Service accounts).
4. Put `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in `.env.local`.
5. The app auto-creates/uses Firestore document: `app_state/singleton`.

## API Surface (Core)

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST|PATCH /api/admin-users`
- `GET|POST|PATCH|DELETE /api/packages`
- `GET|POST|PATCH /api/routers`
- `POST /api/routers/:id/setup`
- `POST /api/payments/checkout`
- `GET /api/payments/logs`
- `POST /api/payments/mpesa/stk-push`
- `POST /api/payments/mpesa/callback`
- `GET /api/sessions`
- `POST /api/sessions/:id/disconnect`
- `GET|POST /api/vouchers`
- `POST /api/vouchers/redeem`
- `GET /api/analytics/overview`
- `GET /api/portal/status`

## Production Integration Notes

- Add webhook signature/allowlist validation for M-Pesa callback endpoint.
- Add Paystack package-payment initialization + verification/webhook handling before enabling Paystack for user package checkout.
- Replace `lib/mikrotik.ts` stubs with RouterOS API command execution.
- Enforce HTTPS-only deployment and secure secrets management.
