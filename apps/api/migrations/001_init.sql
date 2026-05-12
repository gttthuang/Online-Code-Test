create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null
);

create table if not exists problems (
  id text primary key,
  title text not null,
  description text not null,
  difficulty text not null,
  time_limit_ms integer not null,
  memory_limit_kb integer not null,
  supported_languages text[] not null,
  sample_input text not null,
  sample_output text not null,
  created_by text not null references users(id)
);

create table if not exists test_cases (
  id text primary key,
  problem_id text not null references problems(id) on delete cascade,
  input text not null,
  expected_output text not null,
  is_hidden boolean not null default true
);

create table if not exists assignments (
  id text primary key,
  candidate_id text not null references users(id),
  problem_id text not null references problems(id),
  assigned_by text not null references users(id),
  assigned_at timestamptz not null
);

create table if not exists submissions (
  id text primary key,
  candidate_id text not null references users(id),
  problem_id text not null references problems(id),
  language text not null,
  source_code text not null,
  status text not null,
  score integer,
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists submission_case_results (
  submission_id text not null references submissions(id) on delete cascade,
  test_case_id text not null,
  passed boolean not null,
  execution_time_ms integer not null,
  memory_kb integer not null,
  primary key (submission_id, test_case_id)
);

create index if not exists idx_test_cases_problem_id on test_cases(problem_id);
create index if not exists idx_assignments_candidate_id on assignments(candidate_id);
create index if not exists idx_assignments_problem_id on assignments(problem_id);
create index if not exists idx_submissions_candidate_id on submissions(candidate_id);
create index if not exists idx_submissions_problem_id on submissions(problem_id);
create index if not exists idx_submissions_status_created_at on submissions(status, created_at);
