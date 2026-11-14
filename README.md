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

## Privacy policy and terms of use pages
Each app has an editable privacy policy and terms of use (dashboard → app card → **Privacy & terms**).
- **Workflow:** fill in details, tick what the app really does, *Generate from template*, edit, *Save draft*, then *Save and publish*. Drafts never change the public page. Each publish creates a numbered version in `apps/{appId}/legalDocs/{type}/history`.
- **Public URLs (no sign-in):** `/legal/{appId}/privacy` and `/legal/{appId}/terms`. Use the privacy URL in Google Play Console → App content → Privacy policy. Only published text is served.
- **Publish guard:** templates include `[REVIEW: …]` notes where only you know the facts (retention period, SDK list, child-directed apps). Publishing is blocked until they are resolved.
- **Play checklist:** the privacy tab lists published state, contact email, account-deletion URL for apps with accounts, and a manual reminder to match your Data safety form.
- **Not legal advice.** Templates are generic starting points. Have apps that handle children's data, payments, or sensitive data reviewed by a qualified professional.
- Optional env var `NEXT_PUBLIC_SITE_URL` sets the base URL stored as the app's `privacyPolicyUrl`.
- No Firestore rule changes are needed: documents are read and written only by server routes.
