create extension if not exists pgcrypto;

create table if not exists public.learners (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  mission_id text not null,
  mode text not null check (mode in ('run', 'submit')),
  execution_status text not null check (execution_status in ('passed', 'wrong_answer', 'syntax_error', 'runtime_error', 'timeout', 'infrastructure_error')),
  passed_tests integer not null default 0,
  total_tests integer not null default 0,
  hint_level integer,
  mistake_category text,
  created_at timestamptz not null default now(),
  completed boolean not null default false
);

create table if not exists public.mission_completions (
  learner_id uuid not null references public.learners(id) on delete cascade,
  mission_id text not null,
  attempt_id uuid null references public.mission_attempts(id) on delete set null,
  completed_at timestamptz not null default now(),
  passed_tests integer not null default 0,
  total_tests integer not null default 0,
  primary key (learner_id, mission_id)
);

create table if not exists public.learner_mistakes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  mission_id text not null,
  category text not null,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  unique (learner_id, mission_id, category)
);

create index if not exists mission_attempts_learner_idx on public.mission_attempts (learner_id, created_at desc);
create index if not exists mission_attempts_mission_idx on public.mission_attempts (mission_id, created_at desc);
create index if not exists mission_completions_learner_idx on public.mission_completions (learner_id, completed_at desc);
create index if not exists learner_mistakes_summary_idx on public.learner_mistakes (learner_id, occurrence_count desc);

alter table public.learners enable row level security;
alter table public.mission_attempts enable row level security;
alter table public.mission_completions enable row level security;
alter table public.learner_mistakes enable row level security;

create policy "Learners can read only their own profile" on public.learners
  for select using (auth.uid() = id);

create policy "Learners can update only their own profile" on public.learners
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Learners can insert their own profile" on public.learners
  for insert with check (auth.uid() = id);

create policy "Learners can read only their own attempts" on public.mission_attempts
  for select using (auth.uid() = learner_id);

create policy "Learners can insert only their own attempts" on public.mission_attempts
  for insert with check (auth.uid() = learner_id);

create policy "Learners can update only their own attempts" on public.mission_attempts
  for update using (auth.uid() = learner_id) with check (auth.uid() = learner_id);

create policy "Learners can read only their own completions" on public.mission_completions
  for select using (auth.uid() = learner_id);

create policy "Learners can insert only their own completions" on public.mission_completions
  for insert with check (auth.uid() = learner_id);

create policy "Learners can read only their own mistake summaries" on public.learner_mistakes
  for select using (auth.uid() = learner_id);

create policy "Learners can insert only their own mistake summaries" on public.learner_mistakes
  for insert with check (auth.uid() = learner_id);

create policy "Learners can update only their own mistake summaries" on public.learner_mistakes
  for update using (auth.uid() = learner_id) with check (auth.uid() = learner_id);

create or replace function public.handle_new_learner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.learners (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.learners.display_name),
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_learner();
