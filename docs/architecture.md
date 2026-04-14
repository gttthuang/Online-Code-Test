# Architecture Notes

## Core services

### `apps/api`

Owns:

- authentication and role checks
- problem CRUD
- hidden test case metadata
- submission creation
- result query APIs
- queue publishing

Should not own:

- code compilation
- untrusted code execution
- sandbox resource isolation

### `apps/judge-worker`

Owns:

- pulling jobs from the queue
- fetching source code and test cases
- compile and run pipeline per language
- timeout, memory, process, and network controls
- writing judge result back to the database

Should not own:

- login
- problem management UI concerns
- public API routing

### `apps/web`

Owns:

- candidate exam flow
- admin dashboard
- polling or live result updates
- API client and role-based navigation

Should not own:

- business rules duplicated from API
- judge logic

## Shared contracts

`packages/contracts` is the only place for shared enums and payload shapes. This is the main anti-conflict boundary.

Start with these:

- roles
- submission statuses
- judge job payload
- judge result payload

## Current scaffold implementation

The current backend scaffold intentionally uses development adapters:

- `apps/api` uses an in-memory repository instead of PostgreSQL
- judge execution is simulated by an in-process fake queue instead of Redis + worker

This keeps the route surface stable while the team starts frontend work. The next backend iteration should swap these adapters for:

- PostgreSQL-backed repositories
- Redis-backed queue
- separate `apps/judge-worker` consumer

## First real integration path

Build this path before adding advanced features:

1. candidate creates a submission
2. api stores submission with `queued`
3. api publishes a judge job
4. worker picks the job and writes a fake result
5. web polls and displays the final state

Once this path works, each owner can expand their module independently.
