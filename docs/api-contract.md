# API 呼叫文件

這份文件是給前端與整合用的，不是後端實作說明。

## 目前後端模式

- 資料層：PostgreSQL
- 判題：獨立 judge worker，透過 Redis queue + BullMQ 處理 queued submission
- 執行：worker 會用短生命週期 Docker container 跑 `python` / `cpp`，並用題目的 `timeLimitMs` 做 timeout
- 驗證方式：`Authorization: Bearer <token>`
- demo login 會直接回傳 `token = user.id`

目前的目的，是先讓前端可以穩定串接。現在 persistence 已經進 PostgreSQL，worker 也已經獨立，且能真的執行 `python` / `cpp` submission；之後就算繼續強化 Redis retry 策略或 Docker sandbox，也盡量不改 API surface。

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
    "message": "Problem does not exist",
    "details": {
      "optional": "不同錯誤會帶不同細節"
    }
  }
}
```

Validation error 會在 `details.fieldErrors` 內列出欄位錯誤；前端應該把這些細節顯示給使用者，而不是只顯示 `Request validation failed`。

## Endpoint 一覽

### 公用

- `GET /`
- `GET /healthz`
- `GET /internal/stats`
- `POST /auth/login`
- `GET /auth/me`

### Candidate

- `GET /me/assignments`
- `GET /me/problems/:problemId`
- `GET /me/submissions`
- `POST /me/submissions`
- `GET /me/submissions/:submissionId`

### Interviewer / Problem Admin

- `GET /admin/problems`

### Problem Admin

- `POST /admin/problems`
- `DELETE /admin/problems/:problemId`
- `GET /admin/users`
- `POST /admin/users`
- `DELETE /admin/users/:userId`
- `POST /admin/submissions/preview`
- `GET /admin/submissions/:submissionId`

### Interviewer

- `GET /admin/candidates`
- `POST /admin/candidates`
- `DELETE /admin/candidates/:candidateId`
- `POST /admin/assignments`
- `GET /admin/candidates/:candidateId/results`
- `GET /admin/candidates/:candidateId/submissions`

### Admin Submission Review

- `GET /admin/submissions`
- `GET /admin/submissions/:submissionId`

## 主要 Request / Response

### `POST /auth/login`

Request:

```json
{
  "email": "alice.candidate@example.com"
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

### `GET /admin/users`

用途：

- problem admin 查看所有帳號與角色
- UI 用這個列表確認目前有哪些 candidate / interviewer / problem admin

Response:

```json
[
  {
    "id": "interviewer_bob",
    "name": "Bob Interviewer",
    "email": "bob.interviewer@example.com",
    "role": "interviewer"
  }
]
```

### `POST /admin/users`

用途：

- problem admin 建立任意角色帳號
- role 只能是 `candidate`、`interviewer`、`problem_admin`

Request:

```json
{
  "name": "Dana Interviewer",
  "email": "dana.interviewer@example.com",
  "role": "interviewer"
}
```

Response:

```json
{
  "user": {
    "id": "interviewer_xxx",
    "name": "Dana Interviewer",
    "email": "dana.interviewer@example.com",
    "role": "interviewer"
  }
}
```

### `DELETE /admin/users/:userId`

用途：

- problem admin 刪除還沒有被題目、assignment、submission 引用的帳號
- 不能刪除目前登入中的自己

常見失敗：

- `user_self_delete_forbidden`: 不能刪自己
- `user_in_use`: 該 user 已被 assignment / problem / submission 引用，不能直接刪

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

### `GET /internal/stats`

用途：

- 本機 demo / debug 用的最小 observability endpoint
- 看目前 submission 狀態分布、judge failure breakdown、基本資料量

Response:

```json
{
  "service": "api",
  "generatedAt": "2026-05-15T12:00:00.000Z",
  "queueMode": "redis-bullmq",
  "storageMode": "postgres",
  "stats": {
    "totals": {
      "candidates": 2,
      "problems": 2,
      "assignments": 2,
      "submissions": 5
    },
    "submissionsByStatus": {
      "queued": 0,
      "running": 0,
      "finished": 3,
      "failed": 2
    },
    "failuresByType": {
      "compile_error": 1,
      "runtime_error": 0,
      "time_limit_exceeded": 1,
      "sandbox_error": 0,
      "system_error": 0
    },
    "judgeCases": {
      "total": 6,
      "averageExecutionTimeMs": 8
    }
  }
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

Validation:

- `sourceCode` 不可為空白
- `sourceCode` 最多 `100000` 字元

Response:

```json
{
  "submissionId": "submission_123",
  "status": "queued"
}
```

### `GET /me/submissions`

用途：

- candidate 查看自己的 submission history
- 每筆都包含當時提交的 source code snapshot 和 testcase-level result

Response:

```json
[
  {
    "id": "submission_123",
    "candidateId": "candidate_alice",
    "candidateName": "Alice Candidate",
    "candidateEmail": "alice.candidate@example.com",
    "candidateRole": "candidate",
    "problemId": "problem_reverse_string",
    "problemTitle": "Reverse String",
    "language": "python",
    "status": "finished",
    "sourceCode": "print(input()[::-1])",
    "score": 100,
    "passedCases": 1,
    "totalCases": 1,
    "createdAt": "2026-04-14T12:00:00.000Z",
    "updatedAt": "2026-04-14T12:00:01.000Z",
    "result": {
      "submissionId": "submission_123",
      "status": "finished",
      "score": 100,
      "cases": [
        {
          "testCaseId": "case_reverse_hidden_1",
          "passed": true,
          "executionTimeMs": 20,
          "memoryKb": 1024
        }
      ]
    }
  }
]
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

失敗時會多回：

```json
{
  "result": {
    "submissionId": "submission_123",
    "status": "failed",
    "score": 0,
    "cases": [],
    "errorType": "compile_error",
    "errorMessage": "SyntaxError: invalid syntax"
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

Validation:

- `title`: 1 到 120 字元
- `description`: 1 到 20000 字元
- `timeLimitMs`: 1 到 10000
- `memoryLimitKb`: 1 到 1048576
- `supportedLanguages`: 至少 1 種，且不可重複
- `sampleInput` / `sampleOutput`: 各最多 8000 字元
- `hiddenTestCases`: 1 到 50 筆
- 每筆 hidden testcase 的 `input` / `expectedOutput`: 各最多 16000 字元

### `DELETE /admin/problems/:problemId`

用途：

- problem admin 刪除未被使用的題目
- 如果題目已被 assignment 指派，或已有 candidate submission，會被拒絕
- problem admin 自己在 preview 產生的 submission 不會阻止刪除

常見失敗：

```json
{
  "error": {
    "code": "problem_in_use",
    "message": "Cannot delete problem because it is assigned or has candidate submissions",
    "details": {
      "hasAssignments": true,
      "hasCandidateSubmissions": false
    }
  }
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

### `GET /admin/candidates/:candidateId/submissions`

用途：

- interviewer / admin 查看某位 candidate 的完整 submission history
- 包含 source code snapshot、score、testcase pass/fail、錯誤訊息
- interviewer 只能透過 candidate history 查看正式 candidate submissions，不能查看 admin preview runs

Response:

```json
{
  "candidate": {
    "id": "candidate_alice",
    "name": "Alice Candidate",
    "email": "alice.candidate@example.com",
    "role": "candidate"
  },
  "submissions": []
}
```

### `GET /admin/submissions`

用途：

- admin 查看全站 submission history
- 可用 query string 篩選：`candidateId`、`problemId`

### `GET /admin/submissions/:submissionId`

用途：

- admin 查看任意 submission detail
- interviewer 只能查看正式 candidate submission detail

## Judge 結果分類

目前 worker 會回傳固定的失敗分類，前端可以直接照 `result.errorType` 顯示：

- `compile_error`
- `runtime_error`
- `time_limit_exceeded`
- `sandbox_error`
- `system_error`

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
4. `GET /admin/users`
5. `POST /admin/users`
6. `POST /admin/assignments`
7. `GET /admin/candidates/:candidateId/results`

## 補充

- server 重啟後不會丟資料，因為目前已經是 PostgreSQL persistence
- 目前 token 只是 demo token，不是真正 JWT
- worker payload / result 的 canonical shape 以 `packages/contracts/src/index.ts` 為準
