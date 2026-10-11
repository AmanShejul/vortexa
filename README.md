# Vortexa / CodeQuest AI

This project is a guided Python learning workspace built around canonical mission prompts, a deterministic mentor, and Judge0-backed execution. Phase 3 adds Supabase persistence for learner records, mission attempts, completion records, and mistake history.

## Prerequisites

- Node.js 20+
- npm
- A Supabase project
- A Judge0-compatible execution endpoint

## Supabase project setup

1. Create a Supabase project.
2. Apply all migrations in `supabase/migrations/` in order, including `002_server_owned_progress.sql`. This migration removes browser writes to attempts, completions and mistake summaries, retaining authenticated owner-scoped reads while reserving writes for the server-only `service_role`.
3. Enable email auth in Supabase Authentication if you want password sign-in and sign-up.
4. Keep the server-side keys in local environment variables only.

## Required environment variables

Copy `.env.example` to `.env.local` and replace placeholders:

- `SUPABASE_URL`: project URL
- `SUPABASE_ANON_KEY`: anon key for server-side auth APIs
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key for server-side writes; never expose it via `NEXT_PUBLIC_*`
- `JUDGE0_API_URL`: **required for code execution**; base URL from a Judge0-compatible provider or self-hosted deployment. The app appends `/submissions`.
- `JUDGE0_API_KEY`: optional Judge0 API key
- `JUDGE0_AUTH_HEADER`, `JUDGE0_AUTH_PREFIX`: optional auth header overrides
- `JUDGE0_PYTHON_LANGUAGE_ID`: optional Python language ID (defaults to `71`, Judge0 CE Python 3.8.1)
- `MENTOR_EVIDENCE_SECRET`: optional server-only random secret of at least 32 bytes. Set the same value on all production instances so signed mentor evidence works across requests and restarts. If unset, a cryptographically random process-local key is used; local single-process development works, but outstanding evidence expires on restart and multi-instance deployments may reject a token issued by another instance. Never expose this variable with a `NEXT_PUBLIC_*` name.

Get the endpoint URL and any required key from the Judge0 service provider or deployment administrator. Copy `.env.example` to `.env.local`, replace the Judge0 placeholders with those values, then restart `npm run dev`. The example URL is intentionally non-functional; without `JUDGE0_API_URL`, Run Code and Submit Mission return a configuration error and no execution is attempted. The default auth header is `X-Auth-Token`; set `JUDGE0_AUTH_HEADER` and `JUDGE0_AUTH_PREFIX` to the values required by your compatible service.

## Applying SQL migrations

```bash
# From the project root
# Use the Supabase CLI if available:

supabase db push
```

Or paste the SQL from each migration in numeric order into the Supabase SQL editor.

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
- Run and Submit requests are bounded to 128 KiB total and 64 KiB of source, with an eight-second per-test limit and a 30-second execution deadline. Judge0 is configured with resource caps and network access disabled where the provider supports those fields; the actual isolation guarantees depend on the selected Judge0 deployment.
- Judge0 terminal statuses are used to separate accepted output, wrong answers, compilation errors, time limits, runtime failures, and provider/internal errors. Judge0 alone cannot prove whether every runtime failure was caused by learner code or a provider runtime defect; the application classifies documented runtime statuses as learner runtime errors and keeps provider HTTP failures, polling failures, malformed responses, and internal statuses out of learner mistake records.
- The run route uses an in-memory sliding-window limit (5 requests per minute per verified learner; 20 per minute in one shared anonymous bucket). This is process-local and is not globally consistent across serverless instances or restarts. Configure an upstream/shared rate limiter at deployment for production-wide abuse protection; this application does not claim the local limiter provides that protection.
