# 前端串接指南

這份文件比 `api-contract.md` 更偏實作流程，目標是讓前端可以直接開工。

## 先知道這幾件事

- API base URL：`http://localhost:3000`
- 所有需要登入的 API 都要帶：

```http
Authorization: Bearer <token>
```

- token 來自 `POST /auth/login`
- 目前 token 其實就是 `user.id`
- 目前資料是 seed data，server 重開會重置

## 建議先做的前端頁面

### Candidate

- login page
- assignment list page
- problem detail page
- code editor / submission page
- submission result page

### Admin

- login page
- problem list page
- create problem page
- assignment page
- candidate results page

## Candidate 串接步驟

### 1. login

呼叫：

- `POST /auth/login`

body：

```json
{
  "email": "alice.candidate@example.com"
}
```

拿到：

- `token`
- `user`

建議前端先把 `token` 存在 memory 或 localStorage。

### 2. 讀 assignment list

呼叫：

- `GET /me/assignments`

用途：

- 顯示 candidate 被分配到哪些題目
- 每題目前最新 submission 狀態是什麼

### 3. 讀 problem detail

呼叫：

- `GET /me/problems/:problemId`

用途：

- 顯示題目內容
- 顯示 sample input / output
- 顯示支援語言

### 4. 建立 submission

呼叫：

- `POST /me/submissions`

body：

```json
{
  "problemId": "problem_two_sum",
  "language": "python",
  "sourceCode": "print(42)"
}
```

拿到：

- `submissionId`
- `status`

### 5. 輪詢結果

呼叫：

- `GET /me/submissions/:submissionId`

建議做法：

- 每 `1` 秒輪詢一次
- 當 `status` 是 `finished` 或 `failed` 時停止

要顯示的欄位：

- `status`
- `score`
- `result.errorMessage`
- `result.cases`

## Admin 串接步驟

### Interviewer

可做：

- `GET /admin/problems`
- `POST /admin/assignments`
- `GET /admin/candidates/:candidateId/results`

demo login email：

- `bob.interviewer@example.com`

### Problem Admin

可做：

- `POST /admin/problems`
- `GET /admin/problems`

demo login email：

- `cindy.problem_admin@example.com`

## 最小前端測試腳本

如果只是想快速驗證 fetch 能不能打通，可以照這樣做：

```ts
const baseUrl = "http://localhost:3000";

const loginResponse = await fetch(`${baseUrl}/auth/login`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: "alice.candidate@example.com"
  })
});

const { token } = await loginResponse.json();

const assignmentsResponse = await fetch(`${baseUrl}/me/assignments`, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

const assignments = await assignmentsResponse.json();
```

## UI 上先不用想太多的地方

這一版可以先不處理：

- 真正的 JWT refresh
- websocket
- 真正的 sandbox 狀態顯示
- 真正的多人併發結果
- 真正的 hidden testcase 明細

先把流程頁做通比較重要。

## Fake Judge 測試技巧

你可以透過 `sourceCode` 故意塞關鍵字，模擬不同結果：

- `"compile_error"` -> `failed`
- `"runtime_error"` -> `failed`
- `"wrong_answer"` -> `finished` 但 `score = 0`
- 其他內容 -> `finished` 且 `score = 100`

這樣前端可以很快把：

- loading state
- success state
- failure state
- wrong answer state

都做出來。

## 如果前端串不通，先檢查

1. API server 有沒有啟動
2. header 有沒有帶 `Authorization`
3. token 是不是登入回來的值
4. role 對不對
5. candidate 是否真的被指派到該 problem
6. body 欄位名稱是否跟 `api-contract.md` 一致
