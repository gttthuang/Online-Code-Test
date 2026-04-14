[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

Lightweight bootstrap template for a team of five building an online coding exam system.

## Why this template exists

This repo is intentionally thin. It fixes the boundaries that usually cause PR conflicts early:

- `apps/api`: auth, problem management, submissions, results
- `apps/judge-worker`: queue consumer, sandbox runner, compile and execute pipeline
- `apps/web`: candidate and admin UI
- `packages/contracts`: shared enums and payload shapes
- `infra`: local dependencies such as PostgreSQL and Redis
- `docs`: contracts, ownership, and the first delivery path

The template does not lock the team into a heavy framework yet. The main goal is to agree on module ownership and the first integration path:

`web -> api -> db -> queue -> worker -> db -> web`

## Suggested team split

- Member 1: `apps/api` auth, roles, candidate assignment
- Member 2: `apps/api` problems and hidden test cases
- Member 3: `apps/api` submissions, results, queue producer
- Member 4: `apps/judge-worker` sandbox, language runtime, judge execution
- Member 5: `apps/web`, `infra`, CI, E2E, observability

## First bootstrap milestone

1. Bring up PostgreSQL and Redis with Docker Compose.
2. Implement `POST /submissions` to store a queued submission.
3. Push a fake judge job to Redis.
4. Let the worker mark the submission as `finished` after a delay.
5. Poll submission status from the web app.

If this flow works, the team can expand modules in parallel without redesigning the whole repo.

## Repo Layout

```text
.
├── apps
│   ├── api
│   ├── judge-worker
│   └── web
├── docs
├── infra
├── packages
│   └── contracts
├── package.json
└── tsconfig.base.json
```
