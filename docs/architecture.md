# 系統架構說明

這份文件描述的是「目前實際存在的架構」，不是最後目標架構。

## 目前架構

```text
Browser
  -> apps/web (React + Vite, localhost:5173)
  -> proxy /auth /me /admin /healthz
  -> apps/api (Fastify, localhost:3000)
      -> InMemoryStore
      -> FakeJudgeQueue
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

- 不是正式資料庫架構
- 不是正式 queue + worker 架構
- 不是正式雲端部署架構
- 不是正式 sandbox judge

## 目前的資料層

目前資料都放在 API process 的記憶體裡：

- seed data 來源：`apps/api/src/infra/seed.ts`
- runtime data：`apps/api/src/infra/in-memory-store.ts`

所以只要 backend 重啟：

- 新增的 problem 會消失
- 新增的 assignment 會消失
- submission 與 result 會消失

## 目前的判題流程

目前判題不是透過真正的 worker，而是在 API process 內用假的 queue 模擬：

- 檔案：`apps/api/src/infra/fake-judge-queue.ts`

狀態流程：

- `queued`
- `running`
- `finished` 或 `failed`

前端可以先依這個狀態流做 UI。

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

1. 先把 `InMemoryStore` 換成 PostgreSQL repository
2. 再把 `FakeJudgeQueue` 換成 Redis queue
3. 把 judge execution 移到 `apps/judge-worker`
4. 最後再做 sandbox / resource limit / deployment
