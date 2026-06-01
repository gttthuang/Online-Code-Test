create table if not exists interview_reviews (
  id text primary key,
  candidate_id text not null references users(id),
  problem_id text not null references problems(id),
  interviewer_id text not null references users(id),
  notes text not null default '',
  problem_solving smallint not null check (problem_solving between 1 and 5),
  code_quality smallint not null check (code_quality between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  testing_debugging smallint not null check (testing_debugging between 1 and 5),
  recommendation text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (candidate_id, problem_id, interviewer_id)
);

create index if not exists idx_interview_reviews_candidate_id on interview_reviews(candidate_id);
create index if not exists idx_interview_reviews_interviewer_id on interview_reviews(interviewer_id);
create index if not exists idx_interview_reviews_problem_id on interview_reviews(problem_id);
