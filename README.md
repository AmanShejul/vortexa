# Vortexa / CodeQuest AI

This project is a guided Python learning workspace built around a canonical mission catalog, a deterministic rule-based mentor, local Pyodide execution, and optional Judge0-backed trusted grading. Supabase-backed accounts and saved progress are optional.

## Prerequisites

- Node.js 20+
- npm
- A Supabase project (optional for local practice)
- A Judge0-compatible execution endpoint (optional; required only for live Python execution)

## Mission catalog and evaluation

The canonical catalog in `src/lib/missions.ts` contains 18 authored missions. Each mission has a stable ID/slug, topic, constraints, examples, starter code, and non-solution hint metadata. The execution contract is discriminated by format:

- `function` invokes the configured Python function with JSON-compatible test arguments and compares its returned value.
- `stdin_stdout` supplies text through standard input and compares the program's captured standard output exactly.

Public tests are returned by `GET /api/missions/tests` for local browser execution. Private cases stay in the server-only test catalog and are used only for a configured Live Judge0 Submit. Run checks public cases; Submit checks the full suite on Judge0, while Local Python Submit remains explicitly public-tests-only. Mission drafts under `missions/drafts/` and `Pankaj mission/drafts/` are not automatically promoted into the canonical catalog.

## Supabase project setup

1. Create a Supabase project.
2. Apply all migrations in `supabase/migrations/` in order, including `002_server_owned_progress.sql`. This migration removes browser writes to attempts, completions and mistake summaries, retaining authenticated owner-scoped reads while reserving writes for the server-only `service_role`.
3. Enable email auth in Supabase Authentication if you want password sign-in and sign-up.
4. Keep the server-side keys in local environment variables only.

## Required environment variables

Copy `.env.example` to `.env.local` and replace placeholders:

- `SUPABASE_URL`: project URL
- `SUPABASE_ANON_KEY`: anon key for server-side auth APIs
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the same project URL and anon/publishable key for browser sign-in. These are public client values; never put a service-role key in a `NEXT_PUBLIC_*` variable.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key for server-side writes; never expose it via `NEXT_PUBLIC_*`
- `JUDGE0_API_URL`: optional for Local Python; required only for Live Judge0 execution. Base URL from a Judge0-compatible provider or self-hosted deployment. The app appends `/submissions`.
- `NEXT_PUBLIC_LOCAL_PYTHON_TIMEOUT_MS`: optional local Pyodide execution timeout in milliseconds (default 10000; clamped between 1000 and 30000).
- `JUDGE0_API_KEY`: optional Judge0 API key
- `JUDGE0_AUTH_HEADER`, `JUDGE0_AUTH_PREFIX`: optional auth header overrides
- `JUDGE0_PYTHON_LANGUAGE_ID`: optional Python language ID (defaults to `71`, Judge0 CE Python 3.8.1)
- `MENTOR_EVIDENCE_SECRET`: optional server-only random secret of at least 32 bytes. Set the same value on all production instances so signed mentor evidence works across requests and restarts. If unset, a cryptographically random process-local key is used; local single-process development works, but outstanding evidence expires on restart and multi-instance deployments may reject a token issued by another instance. Never expose this variable with a `NEXT_PUBLIC_*` name.

Get the endpoint URL and any required key from the Judge0 service provider or deployment administrator. Copy `.env.example` to `.env.local`, replace the Judge0 placeholders with those values, then restart `npm run dev` if Live Judge0 execution is needed. The arena starts in **Local Python** mode and executes actual Python with Pyodide in a Web Worker. The local runner supports the catalog's function and stdin/stdout formats with Python standard-library-compatible code. Arbitrary third-party packages, native extensions, and secure hidden-test grading are not provided by this browser runtime. Local Run and Submit check only public examples; Submit is explicitly marked public-tests-only and cannot complete or save a mission. Choose **Live Judge0** for trusted server-side full-suite execution. Without `JUDGE0_API_URL`, Live Judge0 shows an actionable configuration message and never reports false success. The mentor is deterministic and rule-based; no LLM provider is called. The default auth header is `X-Auth-Token`; set `JUDGE0_AUTH_HEADER` and `JUDGE0_AUTH_PREFIX` to the values required by your compatible service.

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

- In Local Python mode, confirm actual Python executes in the browser worker and checks only public cases.
- In Live Judge0 mode with Supabase configured, a persisted attempt is created for an authenticated learner.
- A mission completion row is upserted only when a trusted Live Judge0 Submit result shows all required tests passed.
- Dashboard metrics come from persisted data and show empty states when no data is available.

## Security notes

- Learner ownership is enforced from the authenticated user identity.
- Client-supplied IDs are not trusted for writes.
- Full source snapshots are intentionally not stored; only attempt metadata and classification data are persisted.
- Hidden tests, privileged execution output, and provider internals are never exposed to learner-facing records.
- Run and Submit requests are bounded to 128 KiB total and 64 KiB of source, with an eight-second per-test limit and a 30-second execution deadline. Judge0 is configured with resource caps and network access disabled where the provider supports those fields; the actual isolation guarantees depend on the selected Judge0 deployment.
- Judge0 terminal statuses are used to separate accepted output, wrong answers, compilation errors, time limits, runtime failures, and provider/internal errors. Judge0 alone cannot prove whether every runtime failure was caused by learner code or a provider runtime defect; the application classifies documented runtime statuses as learner runtime errors and keeps provider HTTP failures, polling failures, malformed responses, and internal statuses out of learner mistake records.
- The run route uses an in-memory sliding-window limit (5 requests per minute per verified learner; 20 per minute in one shared anonymous bucket). This is process-local and is not globally consistent across serverless instances or restarts. Configure an upstream/shared rate limiter at deployment for production-wide abuse protection; this application does not claim the local limiter provides that protection.
- The first local run downloads the version-pinned Pyodide runtime and WebAssembly/standard-library assets from `https://cdn.jsdelivr.net/pyodide/v0.29.5/full/`; initial network access is required unless those assets are already cached. Browser deployments must permit this CDN under their content security policy. Runtime load errors expose retry and Live Judge0 choices rather than claiming a successful execution.
- Local mode is genuine Python execution, but the browser worker is not a server-side security boundary or trusted grading path. It is terminated on timeout; browser CPU and memory limits vary. Only public test inputs/expected values are supplied by the public-test endpoint. No hidden tests or server credentials are sent to Pyodide. Use Live Judge0 when trusted grading or persistent progress is needed.
