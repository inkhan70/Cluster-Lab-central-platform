# Cluster Lab Central Platform
Central admin dashboard for registering and managing multiple independent apps (Next.js 14 + Firebase Auth + Firestore).

## Status (MVP)
Implemented: Google sign-in, server-side role checks, app registry (list/create/enable/disable), audit log, Firestore rules, CI.
**Not implemented yet (do not assume they work):** AdMob reporting, analytics charts, support/payment reporting, privacy-policy editor, data export, health monitoring, per-app settings pages, role management UI, 3D styling polish.

## Setup
1. Create a Firebase project; enable Google sign-in and Firestore.
2. `cp .env.example .env.local` and fill values (service-account values are server-only).
3. `firebase deploy --only firestore:rules` (or paste `firestore.rules`).
4. Create the first admin manually in the console: document `admins/<your-uid>` with `{ "role": "owner" }`.
5. `npm install && npm run dev`. Seed apps (see `lib/seed.ts`) by POSTing each to `/api/apps`; package IDs stay null until you verify them.
6. Deploy to Vercel or Firebase-compatible Node hosting; set the same env vars there.

## Architecture
- `lib/server.ts`: verifies the Firebase ID token, then loads the role from `admins/{uid}` (never trusts client claims).
- API routes validate input with zod and write an `auditLogs` entry for each mutation.
- Firestore: `apps/{appId}`, `admins/{uid}`, `auditLogs/{id}`. Clients cannot write; the Admin SDK handles writes.
- Per-app data must live under `apps/{appId}/...` so isolation can be enforced by path. Payments: `PAYMENTS_ENABLED=false` by default; no provider is wired.
- Roles: owner (all + audit), admin (apps read/write), viewer (read).

## Onboarding a new app
POST `/api/apps` with `{appId, name, platform, packageId|null}`. New apps start disabled.

## Security and backup
Never commit `.env*` or service-account files. Rotate keys if leaked. Enable Firestore scheduled backups/PITR in Google Cloud.
