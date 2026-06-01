create table if not exists custom_runs (
  id text primary key,
  candidate_id text not null references users(id) on delete cascade,
  problem_id text not null references problems(id) on delete cascade,
  requested_by text not null references users(id) on delete cascade,
  language text not null,
  source_code text not null,
  stdin text not null,
  status text not null check (status in ('queued', 'running', 'finished', 'failed')),
  stdout text,
  stderr text,
  error_type text check (error_type is null or error_type in ('compile_error', 'runtime_error', 'time_limit_exceeded', 'sandbox_error', 'system_error')),
  error_message text,
  execution_time_ms integer,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_custom_runs_candidate_problem_created_at
  on custom_runs(candidate_id, problem_id, created_at desc);
