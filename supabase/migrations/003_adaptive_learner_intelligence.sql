-- Trusted analytics fields are written only by the server service role. The
-- learner can read only rows belonging to their own auth identity through the
-- existing server-owned progress grants.
alter table if exists public.mission_attempts
  add column if not exists submission_id text,
  add column if not exists execution_source text not null default 'live' check (execution_source in ('local', 'live')),
  add column if not exists mistake_concept text,
  add column if not exists mistake_confidence text check (mistake_confidence in ('high', 'medium', 'low')),
  add column if not exists mistake_evidence jsonb not null default '[]'::jsonb;

create unique index if not exists mission_attempts_submission_idx
  on public.mission_attempts (learner_id, submission_id)
  where submission_id is not null;

alter table if exists public.learner_mistakes
  add column if not exists concept text,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

create index if not exists mission_attempts_analytics_idx
  on public.mission_attempts (learner_id, mistake_category, created_at desc);
