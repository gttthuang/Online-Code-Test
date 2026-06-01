[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

An online coding interview system with a working React frontend, Fastify API, PostgreSQL persistence, Redis-backed judge queue, Docker-isolated worker, and AWS deployment scripts.

## Current Status

- `apps/api`: Fastify + TypeScript backend
- `apps/web`: React + Vite + TypeScript frontend
- `apps/judge-worker`: TypeScript judge worker
- `packages/contracts`: shared DTOs and enums
- data layer: PostgreSQL
- schema management: SQL migrations + seed data
- judge flow: Redis queue + separate worker process
- execution: Docker-isolated `python` / `cpp` runners with timeout
- frontend routing: role-based routes for candidate, interviewer, and admin workspaces

The app supports candidate submissions, custom stdin runs, interviewer private notes/rubric, admin problem authoring, user management, and AWS deployment. Sandboxing is currently Docker-based rather than a fully hardened production judge environment.

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
- Admin: `/problem-admin`

Demo emails are documented in [Local Development](./docs/local-development.md).

## Verification

```bash
npm run ci:verify
```

For a local Docker-based GitHub Actions check, use:

```bash
act push -j verify --bind
```

## AWS Quick Deploy

Prepare config:

```bash
cp infra/aws/deploy.env.example infra/aws/deploy.env
```

At minimum, confirm:

```bash
APP_NAME=online-code-test
STAGE=dev
AWS_REGION=ap-northeast-1
```

You do not need to manually set `DB_PASSWORD` by default. The scripts will:

- reuse an existing Secrets Manager secret if it exists
- otherwise generate one automatically
- store it at `${APP_NAME}/${STAGE}/postgres/master-password`

Deploy:

```bash
bash infra/aws/bootstrap.sh
bash infra/aws/deploy.sh
```

Full details: [AWS Deployment](./docs/aws-deployment.md)

## Docs

- [API Contract](./docs/api-contract.md)
- [Architecture Notes](./docs/architecture.md)
- [Local Development](./docs/local-development.md)
- [AWS Deployment](./docs/aws-deployment.md)
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
