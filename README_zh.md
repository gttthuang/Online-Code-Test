[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

這個 repo 現在不是只有 template，而是已經有一版可跑的前後端 MVP。

## 目前狀態

- `apps/api`：Fastify + TypeScript 後端
- `apps/web`：React + Vite + TypeScript 前端
- `apps/judge-worker`：TypeScript 判題 worker
- `packages/contracts`：前後端共用 DTO / enum
- 資料層：PostgreSQL
- schema 管理：SQL migrations + seed data
- 判題流程：Redis queue + 獨立 worker process
- 執行方式：Docker 隔離的 `python` / `cpp` runner + timeout
- 前端路由：依角色分成 candidate、interviewer、problem admin workspace

也就是說，目前已經可以：

- login
- candidate 看 assignment / 題目 / 送 submission / 輪詢結果
- interviewer 建 assignment / 查 candidate results
- problem admin 建題 / 看題目列表
- worker 會在背景消化 queued submissions
- API 可透過 `/internal/stats` 看目前 submission 狀態與 failure breakdown

但目前還沒有：

- 更完整的 production-grade sandbox 隔離

## 本機啟動

主機環境需要先有：

- Docker / Docker Desktop

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run migrate --workspace @oct/api
npm run dev:api
npm run dev:worker
npm run dev:web
```

第一次啟動 worker 時，可能會先花一些時間拉 sandbox images。
`npm run dev:api` 也會在啟動時自動補跑 migration 與 seed，但建議第一次先手動跑一次 `migrate`，比較容易確認 schema 狀態。

- 前端：`http://localhost:5173`
- 後端：`http://localhost:3000`

登入後會依角色自動導向：

- Candidate：`/candidate`
- Interviewer：`/interviewer`
- Problem Admin：`/problem-admin`

Demo 帳號、路由、CI 與常見問題請看 [本機執行與驗證](./docs/local-development.md)。

## 驗證

```bash
npm run ci:verify
```

如果本機有安裝 `act`，也可以用 Docker 模擬 GitHub Actions：

```bash
act push -j verify --bind
```

## 文件入口

- [API 呼叫文件](./docs/api-contract.md)
- [系統架構說明](./docs/architecture.md)
- [本機執行與驗證](./docs/local-development.md)
- [目前頁面進度與前端分工](./docs/team-handoff-zh.md)

## Repo 結構

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
