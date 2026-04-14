[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

這是一個給五人小組使用的輕量 bootstrap template，用來開發線上程式測驗系統。

## 為什麼要先有這個 template

這個 repo 刻意保持輕薄，目的是先固定最容易造成 PR 衝突的邊界：

- `apps/api`: 登入驗證、題目管理、submission、results
- `apps/judge-worker`: queue consumer、sandbox runner、compile 與 execute pipeline
- `apps/web`: candidate 與 admin UI
- `packages/contracts`: 共享 enum 與 payload 型別
- `infra`: PostgreSQL、Redis 等本地依賴
- `docs`: contract、ownership 與第一條主流程說明

這個 template 還不會把團隊綁死在很重的 framework 上。現階段重點是先對齊模組責任和第一條整合路徑：

`web -> api -> db -> queue -> worker -> db -> web`

## 建議分工

- 組員 1: `apps/api` 的 auth、roles、candidate assignment
- 組員 2: `apps/api` 的 problems 與 hidden test cases
- 組員 3: `apps/api` 的 submissions、results、queue producer
- 組員 4: `apps/judge-worker` 的 sandbox、language runtime、judge execution
- 組員 5: `apps/web`、`infra`、CI、E2E、observability

## 第一個 bootstrap 里程碑

1. 用 Docker Compose 啟動 PostgreSQL 與 Redis。
2. 實作 `POST /submissions`，先把 submission 存成 `queued`。
3. 把假的 judge job 推進 Redis。
4. 讓 worker 延遲幾秒後把 submission 改成 `finished`。
5. 前端輪詢 submission 狀態並顯示結果。

只要這條流程先打通，後面每個人就能在自己的模組上並行擴充，不需要一直重設整個架構。

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
