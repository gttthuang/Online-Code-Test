[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

An online coding exam system scaffold with a working backend MVP and a frontend MVP for candidate, interviewer, and problem admin flows.

## Current Status

- `apps/api`: Fastify + TypeScript backend
- `apps/web`: React + Vite + TypeScript frontend
- `apps/judge-worker`: TypeScript judge worker
- `packages/contracts`: shared DTOs and enums
- data layer: PostgreSQL
- schema management: SQL migrations + seed data
- judge flow: Redis queue + separate worker process
- execution: Docker-isolated `python` / `cpp` runners with timeout
- frontend routing: role-based routes for candidate, interviewer, and problem admin workspaces

This means the app is ready for UI iteration and API integration work. PostgreSQL, Redis, and the worker are connected; sandboxing is currently Docker-based rather than a hardened production judge environment.

Local observability is also available through `GET /internal/stats`, which returns current submission status counts and judge failure breakdowns.

## Quick Start

Host prerequisites:

- Docker / Docker Desktop

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run migrate --workspace @oct/api
npm run dev:api
npm run dev:worker
npm run dev:web
```

The first worker run may spend extra time pulling sandbox images.
`npm run dev:api` also auto-runs migrations and seed data on startup, but running `migrate` once up front makes the schema state easier to verify.

- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`

After login, the frontend redirects each role to its own route:

- Candidate: `/candidate`
- Interviewer: `/interviewer`
- Problem Admin: `/problem-admin`

Demo emails are documented in [Local Development](./docs/local-development.md).

## Verification

```bash
npm run ci:verify
```

For a local Docker-based GitHub Actions check, use:

```bash
act push -j verify --bind
```

## Docs

- [API Contract](./docs/api-contract.md)
- [Architecture Notes](./docs/architecture.md)
- [Local Development](./docs/local-development.md)
- [Team Handoff (Chinese)](./docs/team-handoff-zh.md)

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
