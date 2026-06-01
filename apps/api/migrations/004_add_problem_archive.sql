alter table problems
  add column if not exists archived_at timestamptz;

create index if not exists idx_problems_archived_at on problems(archived_at);
