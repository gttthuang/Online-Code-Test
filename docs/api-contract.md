# API Contract Draft

These routes are intentionally minimal. They exist to stabilize team boundaries early.

## Health

- `GET /healthz`

## Auth

- `POST /auth/login`
- `GET /auth/me`

## Candidate

- `GET /me/assignments`
- `GET /me/problems/:problemId`
- `POST /me/submissions`
- `GET /me/submissions/:submissionId`

## Admin

- `POST /admin/problems`
- `GET /admin/problems`
- `POST /admin/assignments`
- `GET /admin/candidates/:candidateId/results`

## Minimal DTOs

### `POST /me/submissions`

Request:

```json
{
  "problemId": "problem_123",
  "language": "python",
  "sourceCode": "print('hello')"
}
```

Response:

```json
{
  "submissionId": "submission_123",
  "status": "queued"
}
```

### Worker job payload

See `packages/contracts/src/index.ts` for the canonical fields. The worker should not invent a second payload format.
