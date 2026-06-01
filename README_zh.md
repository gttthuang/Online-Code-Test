[English](./README.md) | [中文](./README_zh.md)

# Online Code Test

這個 repo 是一套可本機開發、可部署到 AWS 的線上 coding interview 系統。

## 目前狀態

- `apps/api`：Fastify + TypeScript 後端
- `apps/web`：React + Vite + TypeScript 前端
- `apps/judge-worker`：TypeScript 判題 worker
- `packages/contracts`：前後端共用 DTO / enum
- 資料層：PostgreSQL
- schema 管理：SQL migrations + seed data
- 判題流程：Redis queue + 獨立 worker process
- 執行方式：Docker 隔離的 `python` / `cpp` runner + timeout
- 前端路由：依角色分成 candidate、interviewer、admin workspace

也就是說，目前已經可以：

- login
- candidate 看 assignment / 題目 / custom stdin terminal / submission history
- interviewer 建 candidate / assignment、查 submission history、寫 notes / rubric、用 terminal 跑程式片段
- admin 建題、批次匯入測資、preview、archive / force delete、管理 users、查看全站 submissions
- worker 會在背景消化 queued submissions
- API 可透過 `/internal/stats` 看目前 submission 狀態與 failure breakdown

目前仍然需要後續強化：

- 更完整的 production-grade sandbox 隔離
- 正式 auth / JWT / RBAC policy hardening

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
- Admin：`/problem-admin`

Demo 帳號、路由、CI 與常見問題請看 [本機執行與驗證](./docs/local-development.md)。

## 驗證

```bash
npm run ci:verify
```

如果本機有安裝 `act`，也可以用 Docker 模擬 GitHub Actions：

```bash
act push -j verify --bind
```

## AWS 快速部署

先準備：

```bash
cp infra/aws/deploy.env.example infra/aws/deploy.env
```

最少只要確認：

```bash
APP_NAME=online-code-test
STAGE=dev
AWS_REGION=ap-northeast-1
```

現在預設不需要手動填 `DB_PASSWORD`。腳本會自動：

- 先找 Secrets Manager 既有 secret
- 找不到就自動產生
- 存到 `${APP_NAME}/${STAGE}/postgres/master-password`

部署指令：

```bash
bash infra/aws/bootstrap.sh
bash infra/aws/deploy.sh
```

部署完成後可用：

- frontend: CloudFront URL
- api health: `http://<beanstalk-cname>/healthz`

完整說明見 [AWS 部署說明](./docs/aws-deployment.md)。

## 文件入口

- [API 呼叫文件](./docs/api-contract.md)
- [系統架構說明](./docs/architecture.md)
- [本機執行與驗證](./docs/local-development.md)
- [AWS 部署說明](./docs/aws-deployment.md)
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
