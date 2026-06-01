create table if not exists live_room_snapshots (
  candidate_id text not null references users(id) on delete cascade,
  problem_id text not null references problems(id) on delete cascade,
  language text not null,
  source_code text not null,
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (candidate_id, problem_id)
);

create table if not exists live_room_events (
  id text primary key,
  candidate_id text not null references users(id) on delete cascade,
  problem_id text not null references problems(id) on delete cascade,
  actor_id text references users(id) on delete set null,
  actor_role text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_room_events_room_created_at
  on live_room_events(candidate_id, problem_id, created_at);
