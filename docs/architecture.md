# 系統架構說明

這份文件描述的是「目前實際存在的架構」，不是最後目標架構。

## 目前架構

```text
Browser
  -> apps/web (React + Vite, localhost:5173)
  -> proxy /auth /me /admin /healthz
  -> apps/api (Fastify, localhost:3000)
      -> PostgreSQL
  -> apps/judge-worker (polling worker)
      -> PostgreSQL
```

## 目前各層責任

### `apps/web`

負責：

- login
- 角色切換後的前端 workspace
- candidate submission flow
- interviewer / problem admin 的最小操作面
- 輪詢 submission 結果

目前狀態：

- 已有 MVP
- 還不是正式多頁 routing 架構
- 目前是單一 app 內依角色切換 view

### `apps/api`

負責：

- demo login
- role check
- assignment APIs
- problem APIs
- submission APIs
- result APIs

目前狀態：

- 已有 MVP
- route surface 已經固定到前端可以直接串
- token 目前只是 demo token，不是真 JWT

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
- schema/init/seed：`apps/api/src/infra/postgres-init.ts`
- repository：`apps/api/src/infra/postgres-store.ts`
- seed data 來源：`apps/api/src/infra/seed.ts`

所以現在：

- backend 重啟後資料不會消失
- 新增的 problem / assignment / submission / result 都會寫進 DB
- 本地預設使用 `localhost:5433` 對接 docker compose 裡的 PostgreSQL，避免撞到本機自己的 `5432`

## 目前的判題流程

目前 submission 會先寫進 PostgreSQL，接著由獨立的 `apps/judge-worker` 輪詢並處理：

- API 只負責建立 `queued` submission
- worker 會 claim queued job
- worker 會把 submission 更新成 `running`
- worker 會用本機 `python3` / `g++` 執行 submission
- worker 會讀 hidden test cases，逐筆比對輸出
- worker 會回寫 `finished` 或 `failed`

目前 worker 已經有第一版真實執行能力，但還不是 sandbox execution：

- 有 compile / run / timeout
- 有 hidden testcase output compare
- 沒有 container isolation
- 沒有 network isolation
- 沒有 memory / process limit

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

1. 先把 database polling 換成 Redis queue
2. 再補 sandbox / resource limit
3. 再做 deployment / observability / scaling
