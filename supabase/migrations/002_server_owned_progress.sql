-- Progress records are trusted server output. Browser roles may read their
-- own records, but only the server-only service_role may write them.

drop policy if exists "Learners can insert only their own attempts" on public.mission_attempts;
drop policy if exists "Learners can update only their own attempts" on public.mission_attempts;
drop policy if exists "Learners can insert only their own completions" on public.mission_completions;
drop policy if exists "Learners can insert only their own mistake summaries" on public.learner_mistakes;
drop policy if exists "Learners can update only their own mistake summaries" on public.learner_mistakes;

revoke all privileges on table
  public.mission_attempts,
  public.mission_completions,
  public.learner_mistakes
from public, anon, authenticated;

grant select on table
  public.mission_attempts,
  public.mission_completions,
  public.learner_mistakes
to authenticated;

grant select, insert, update, delete on table
  public.mission_attempts,
  public.mission_completions,
  public.learner_mistakes
to service_role;
