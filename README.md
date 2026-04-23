[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

An online coding exam system scaffold with a working backend MVP and a frontend MVP for candidate, interviewer, and problem admin flows.

## Current Status

- `apps/api`: Fastify + TypeScript backend
- `apps/web`: React + Vite + TypeScript frontend
- `packages/contracts`: shared DTOs and enums
- data layer: PostgreSQL
- judge flow: in-process fake judge

This means the app is ready for UI iteration and API integration work. PostgreSQL is already connected; Redis and a real worker are not in place yet.

## Quick Start

```bash
npm ci
npm run dev:api
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
