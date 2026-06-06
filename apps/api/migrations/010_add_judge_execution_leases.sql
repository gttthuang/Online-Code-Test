alter table submissions
  add column if not exists judge_attempt_id text;

alter table custom_runs
  add column if not exists judge_attempt_id text;

create index if not exists idx_submissions_status_updated_at
  on submissions(status, updated_at);

create index if not exists idx_custom_runs_status_updated_at
  on custom_runs(status, updated_at);
