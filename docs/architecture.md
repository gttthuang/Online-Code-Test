# 系統架構說明

這份文件描述的是「目前實際存在的架構」，不是最後目標架構。

## 目前架構

```text
Browser
  -> apps/web (React + Vite, localhost:5173)
  -> proxy /auth /me /admin /live /healthz /internal/stats
  -> apps/api (Fastify, localhost:3000)
      -> PostgreSQL
      -> Redis
  -> apps/judge-worker (BullMQ worker)
      -> Redis
      -> PostgreSQL
```

## 目前各層責任

### `apps/web`

負責：

- login
- 依角色導向不同 workspace route
- candidate submission flow、custom stdin terminal、submission history
- interviewer candidate management、assignment、live room、replay、notes / rubric
- admin problem authoring、batch testcase import、user management、submission review
- 輪詢 submission / custom run 結果

目前狀態：

- 已有正式前端 route 分流
- `/login` 不再直接顯示 demo account selector
- candidate / interviewer / admin 進入各自 route

目前前端主要 route：

- `/login`
- `/candidate`
- `/candidate/assignments`
- `/candidate/problems/:problemId`
- `/interviewer`
- `/interviewer/candidates`
- `/interviewer/results`
- `/problem-admin`
- `/problem-admin/new`
- `/problem-admin/problems`
- `/problem-admin/problems/:problemId/preview`
- `/problem-admin/submissions`
- `/problem-admin/users`

### `apps/api`

負責：

- demo login
- role check
- assignment APIs
- problem APIs
- submission APIs
- custom run APIs
- live room WebSocket / replay APIs
- result APIs
- local observability stats endpoint

目前狀態：

- route surface 已經固定到前端可以直接串
- token 目前只是 demo token，不是真 JWT
- `GET /internal/stats` 會回 PostgreSQL 聚合出的 submission / failure counters

### `packages/contracts`

負責：

- 前後端共用型別
- role enum
- submission status
- DTO / payload shape

這一層的目的是降低前後端串接時的欄位漂移。

## 目前不是什麼

目前這版：

- 不是正式雲端部署架構
- 不是正式 sandbox judge

## 目前的資料層

目前資料已經改成 PostgreSQL 持久化：

- 連線與 DB helper：`apps/api/src/infra/postgres.ts`
- migration runner：`apps/api/src/infra/postgres-migrate.ts`
- migration files：`apps/api/migrations/*.sql`
- seed：`apps/api/src/infra/postgres-seed.ts`
- app bootstrap：`apps/api/src/infra/postgres-init.ts`
- repository：`apps/api/src/infra/postgres-store.ts`
- seed data 來源：`apps/api/src/infra/seed.ts`

所以現在：

- backend 重啟後資料不會消失
- 新增的 problem / assignment / submission / result 都會寫進 DB
- 本地預設使用 `localhost:5433` 對接 docker compose 裡的 PostgreSQL，避免撞到本機自己的 `5432`

## 目前的判題流程

目前正式 submission 與 custom stdin run 都會先寫進 PostgreSQL，接著由 API enqueue 到 Redis，再由獨立的 `apps/judge-worker` 消費並處理：

- API 只負責建立 `queued` submission
- API 會建立 `queued` custom run
- API 會 enqueue Redis job，job 會標示 `submission` 或 `custom_run`
- worker 會 consume Redis job 並 claim queued item
- worker 會把 item 更新成 `running`
- worker 會在短生命週期 Docker sandbox 內編譯 / 執行
- 正式 submission 會讀 hidden test cases，逐筆比對輸出
- custom run 會回傳 stdout / stderr / error
- worker 會回寫 `finished` 或 `failed`

目前 worker 已經有第一版 Docker sandbox execution：

- 有 compile / run / timeout
- 有 hidden testcase output compare
- 有 Docker container isolation
- 有 `--network none`
- 有 CPU / memory / pids limit
- 還沒有更嚴格的 seccomp / filesystem hardening
- worker log 現在是 JSON 結構化格式，方便 demo 與本機 debug

## 下一階段目標架構

真正要往下做時，建議演進成：

```text
Browser
  -> Frontend
  -> API
      -> PostgreSQL
      -> Redis
  -> Judge Worker
      -> sandbox / runtime
```

## 建議替換順序

1. 再補更嚴格的 sandbox / filesystem / seccomp 策略
2. 再做 deployment / observability / scaling
3. 視需要把 Redis queue 擴成更完整的 retry / dead-letter / queue dashboard
