# API Module Ownership

Create one folder per module when implementation starts:

- `auth`
- `users`
- `assignments`
- `problems`
- `test-cases`
- `submissions`
- `results`

Keep shared DTOs in `packages/contracts` instead of redefining them inside each module.
