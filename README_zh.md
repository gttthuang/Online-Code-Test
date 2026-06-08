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
- interviewer 建 candidate / assignment、查 submission history、寫 notes / rubric、用 terminal 跑程式片段、管理 users
- admin 建題、批次匯入測資、preview、archive / force delete、查看全站 submissions
- worker 會在背景消化 queued submissions
- API 提供 `/healthz` liveness、`/readyz` dependency readiness、`/metrics` Prometheus 指標與 `/internal/stats` judge 統計

目前仍然需要後續強化：

- 更完整的 production-grade sandbox 隔離
- 正式 auth / JWT / RBAC policy hardening

## 本機啟動

主機環境需要先有：

- Node.js `22.13+` LTS（可先執行 `nvm use`，會讀取 repo 內的 `.nvmrc`）
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

先確認 PostgreSQL 已啟動：

```bash
docker compose -f infra/docker-compose.yml up -d postgres
npm run ci:verify
```

這會執行所有 workspace typecheck、前後端 coverage gate、完整的「建立帳號到實際
Docker 判題與 review」system test、production build 與基礎設施檢查。

API 的機器可讀 route / role contract 位於 `http://localhost:3000/openapi.json`。
若實際 Fastify route 沒有同步進 contract，API 啟動與 CI 會直接失敗。

如果本機有安裝 `act`，也可以用 Docker 模擬 GitHub Actions：

```bash
act push -j static-analysis
act push -j backend --bind
act push -j frontend
act push -j infrastructure
```

`Quality gate` 會彙整以上四個 job，建議把它設成 branch protection 的 required check。

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

部署腳本也會自動產生 operations token，存到
`${APP_NAME}/${STAGE}/api/ops-token`，用來保護 `/metrics` 與 `/internal/stats`。

部署指令：

```bash
bash infra/aws/bootstrap.sh
bash infra/aws/deploy.sh
```

部署完成後可用：

- frontend: CloudFront URL
- api liveness: `http://<beanstalk-cname>/healthz`
- api readiness: `http://<beanstalk-cname>/readyz`

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
