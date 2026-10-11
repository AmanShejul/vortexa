# Vortexa / CodeQuest AI

This project is a guided Python learning workspace built around canonical mission prompts, a deterministic mentor, and Judge0-backed execution. Phase 3 adds Supabase persistence for learner records, mission attempts, completion records, and mistake history.

## Prerequisites

- Node.js 20+
- npm
- A Supabase project
- A Judge0-compatible execution endpoint

## Supabase project setup

1. Create a Supabase project.
2. Open the SQL Editor and run the migration at `supabase/migrations/001_phase3_persistence.sql`.
3. Enable email auth in Supabase Authentication if you want password sign-in and sign-up.
4. Keep the server-side keys in local environment variables only.

## Required environment variables

Copy `.env.example` to `.env.local` and replace placeholders:

- `SUPABASE_URL`: project URL
- `SUPABASE_ANON_KEY`: anon key for server-side auth APIs
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key for server-side writes; never expose it via `NEXT_PUBLIC_*`
- `JUDGE0_API_URL`: Judge0 base URL
- `JUDGE0_API_KEY`: optional Judge0 API key
- `JUDGE0_AUTH_HEADER`, `JUDGE0_AUTH_PREFIX`: optional auth header overrides

## Applying SQL migrations

```bash
# From the project root
# Use the Supabase CLI if available:

supabase db push
```

Or paste the SQL from `supabase/migrations/001_phase3_persistence.sql` into the Supabase SQL editor.

## First account

Create your first account through the Supabase Auth UI or the minimal API routes:

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`

You should then include the access token in the Authorization header as `Bearer <token>` for protected routes.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open the app and verify:

- `http://localhost:3000/missions`
- `http://localhost:3000/dashboard`
- `http://localhost:3000/arena/sum-of-two-numbers`

## Verification checklist

- Run code in the arena and confirm the execution result is returned from `/api/run`.
- A persisted attempt record is created when the learner is authenticated and Supabase is configured.
- A mission completion row is upserted only when a trusted server-side result shows all tests passed.
- Dashboard metrics come from persisted data and show empty states when no data is available.

## Security notes

- Learner ownership is enforced from the authenticated user identity.
- Client-supplied IDs are not trusted for writes.
- Full source snapshots are intentionally not stored; only attempt metadata and classification data are persisted.
- Hidden tests, privileged execution output, and provider internals are never exposed to learner-facing records.
