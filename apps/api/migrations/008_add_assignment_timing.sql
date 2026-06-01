alter table assignments
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists started_at timestamptz;

do $$
begin
  alter table assignments
    add constraint assignments_duration_minutes_check
    check (duration_minutes between 1 and 480);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists idx_assignments_candidate_problem_unique
  on assignments(candidate_id, problem_id);
