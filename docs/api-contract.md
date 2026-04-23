# API 呼叫文件

這份文件是給前端與整合用的，不是後端實作說明。

## 目前後端模式

- 資料層：PostgreSQL
- 判題：in-process fake judge
- 驗證方式：`Authorization: Bearer <token>`
- demo login 會直接回傳 `token = user.id`

目前的目的，是先讓前端可以穩定串接。現在 persistence 已經進 PostgreSQL；之後把 fake judge 換成 Redis + worker 時，盡量不改 API surface。

## Base URL

- 本機：`http://localhost:3000`

## Demo 帳號

- Candidate: `alice.candidate@example.com`
- Interviewer: `bob.interviewer@example.com`
- Problem Admin: `cindy.problem_admin@example.com`

## Auth 規則

1. 先呼叫 `POST /auth/login`
2. 拿到 response 裡的 `token`
3. 之後把 token 放進 header：

```http
Authorization: Bearer <token>
```

## 錯誤格式

所有錯誤都會回這個格式：

```json
{
  "error": {
    "code": "problem_not_found",
    "message": "Problem does not exist"
  }
}
```

## Endpoint 一覽

### 公用

- `GET /`
- `GET /healthz`
- `POST /auth/login`
- `GET /auth/me`

### Candidate

- `GET /me/assignments`
- `GET /me/problems/:problemId`
- `POST /me/submissions`
- `GET /me/submissions/:submissionId`

### Interviewer / Problem Admin

- `GET /admin/problems`

### Problem Admin

- `POST /admin/problems`

### Interviewer

- `GET /admin/candidates`
- `POST /admin/candidates`
- `POST /admin/assignments`
- `GET /admin/candidates/:candidateId/results`

## 主要 Request / Response

### `POST /auth/login`

Request:

```json
{
  "email": "alice.candidate@example.com"
}
```

### `GET /admin/candidates`

用途：

- 讓 interviewer 取得 candidate 清單
- 前端之後可以拿這份資料做 assignment form 下拉選單

Response:

```json
[
  {
    "id": "candidate_alice",
    "name": "Alice Candidate",
    "email": "alice.candidate@example.com",
    "role": "candidate"
  }
]
```

### `POST /admin/candidates`

用途：

- interviewer 建立新的 candidate 帳號

Request:

```json
{
  "name": "David Candidate",
  "email": "david.candidate@example.com"
}
```

Response:

```json
{
  "candidate": {
    "id": "candidate_xxx",
    "name": "David Candidate",
    "email": "david.candidate@example.com",
    "role": "candidate"
  }
}
```

Response:

```json
{
  "token": "candidate_alice",
  "user": {
    "id": "candidate_alice",
    "name": "Alice Candidate",
    "email": "alice.candidate@example.com",
    "role": "candidate"
  }
}
```

### `GET /auth/me`

Header:

```http
Authorization: Bearer candidate_alice
```

Response:

```json
{
  "id": "candidate_alice",
  "name": "Alice Candidate",
  "email": "alice.candidate@example.com",
  "role": "candidate"
}
```

### `GET /me/assignments`

用途：

- 讓 candidate 拿到自己被分配的題目列表

Response:

```json
[
  {
    "id": "assignment_alice_two_sum",
    "candidateId": "candidate_alice",
    "problemId": "problem_two_sum",
    "problemTitle": "Two Sum",
    "difficulty": "easy",
    "assignedAt": "2026-04-14T00:00:00.000Z",
    "latestSubmissionStatus": null
  }
]
```

### `GET /me/problems/:problemId`

用途：

- candidate 讀自己被指派的題目內容

Response:

```json
{
  "id": "problem_two_sum",
  "title": "Two Sum",
  "difficulty": "easy",
  "timeLimitMs": 1000,
  "memoryLimitKb": 65536,
  "supportedLanguages": ["python", "cpp"],
  "description": "Given an array of integers and a target value, return the indices of the two numbers that add up to the target.",
  "sampleInput": "nums = [2, 7, 11, 15], target = 9",
  "sampleOutput": "[0, 1]"
}
```

### `POST /me/submissions`

Request:

```json
{
  "problemId": "problem_two_sum",
  "language": "python",
  "sourceCode": "print(42)"
}
```

Response:

```json
{
  "submissionId": "submission_123",
  "status": "queued"
}
```

### `GET /me/submissions/:submissionId`

用途：

- 輪詢 submission 狀態
- 看判題結果

Response:

```json
{
  "id": "submission_123",
  "candidateId": "candidate_alice",
  "problemId": "problem_two_sum",
  "language": "python",
  "status": "finished",
  "sourceCode": "print(42)",
  "score": 100,
  "createdAt": "2026-04-14T12:00:00.000Z",
  "updatedAt": "2026-04-14T12:00:01.000Z",
  "result": {
    "submissionId": "submission_123",
    "status": "finished",
    "score": 100,
    "cases": [
      {
        "testCaseId": "case_two_sum_hidden_1",
        "passed": true,
        "executionTimeMs": 20,
        "memoryKb": 1024
      }
    ]
  }
}
```

### `GET /admin/problems`

用途：

- 讓 interviewer / problem admin 讀題目列表

### `POST /admin/problems`

用途：

- problem admin 建立題目

Request:

```json
{
  "title": "FizzBuzz",
  "description": "Return fizz buzz sequence.",
  "difficulty": "easy",
  "timeLimitMs": 1000,
  "memoryLimitKb": 65536,
  "supportedLanguages": ["python", "cpp"],
  "sampleInput": "5",
  "sampleOutput": "1 2 fizz 4 buzz",
  "hiddenTestCases": [
    {
      "input": "3",
      "expectedOutput": "1 2 fizz"
    }
  ]
}
```

### `POST /admin/assignments`

用途：

- interviewer 指派題目給 candidate

Request:

```json
{
  "candidateId": "candidate_alice",
  "problemId": "problem_two_sum"
}
```

### `GET /admin/candidates/:candidateId/results`

用途：

- interviewer 查某位 candidate 的 submission 結果

## Fake Judge 行為

目前判題是假的，但行為固定，前端可以先照這個設計 UI：

- `sourceCode` 包含 `compile_error`：回 `failed`
- `sourceCode` 包含 `runtime_error`：回 `failed`
- `sourceCode` 包含 `wrong_answer`：回 `finished`，但 `score = 0`
- 其他情況：回 `finished`，`score = 100`

狀態大致會這樣變：

- `queued`
- `running`
- `finished` 或 `failed`

## 推薦前端先串的流程

### Candidate flow

1. `POST /auth/login`
2. `GET /me/assignments`
3. `GET /me/problems/:problemId`
4. `POST /me/submissions`
5. 輪詢 `GET /me/submissions/:submissionId`

### Admin flow

1. `POST /auth/login`
2. `GET /admin/problems`
3. `POST /admin/problems`
4. `POST /admin/assignments`
5. `GET /admin/candidates/:candidateId/results`

## 補充

- server 重啟後，資料會回到 seed 狀態
- 目前還沒有真正的資料庫
- 目前 token 只是 demo token，不是真正 JWT
- worker payload 的 canonical shape 仍以 `packages/contracts/src/index.ts` 為準
