[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

An online coding exam system scaffold with a working backend MVP and a frontend MVP for candidate, interviewer, and problem admin flows.

## Current Status

- `apps/api`: Fastify + TypeScript backend
- `apps/web`: React + Vite + TypeScript frontend
- `apps/judge-worker`: TypeScript judge worker
- `packages/contracts`: shared DTOs and enums
- data layer: PostgreSQL
- judge flow: PostgreSQL-backed queue + separate worker process

This means the app is ready for UI iteration and API integration work. PostgreSQL and a basic worker are connected; Redis and sandboxed execution are not in place yet.

## Quick Start

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d postgres
npm run dev:api
npm run dev:worker
npm run dev:web
```

- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`

## Docs

- [API Contract](./docs/api-contract.md)
- [Architecture Notes](./docs/architecture.md)
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
