[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

這個 repo 現在不是只有 template，而是已經有一版可跑的前後端 MVP。

## 目前狀態

- `apps/api`：Fastify + TypeScript 後端
- `apps/web`：React + Vite + TypeScript 前端
- `packages/contracts`：前後端共用 DTO / enum
- 資料層：PostgreSQL
- 判題流程：in-process fake judge

也就是說，目前已經可以：

- login
- candidate 看 assignment / 題目 / 送 submission / 輪詢結果
- interviewer 建 assignment / 查 candidate results
- problem admin 建題 / 看題目列表

但目前還沒有：

- 真正的 Redis queue
- 真正的 worker / sandbox

## 本機啟動

```bash
npm ci
npm run dev:api
npm run dev:web
```

- 前端：`http://localhost:5173`
- 後端：`http://localhost:3000`

## 文件入口

- [API 呼叫文件](./docs/api-contract.md)
- [系統架構說明](./docs/architecture.md)
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
