# 本機執行與驗證

這份文件說明本機要怎麼啟動完整系統，以及 CI 前要怎麼自我檢查。

## 前置需求

- Node.js `22+`
- Docker / Docker Desktop
- npm

## 第一次安裝

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run migrate --workspace @oct/api
```

## 啟動完整系統

開三個 terminal：

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

本機網址：

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- Health check: `http://localhost:3000/healthz`
- Stats: `http://localhost:3000/internal/stats`

第一次啟動 worker 時，Docker 可能會先拉 `python` / `gcc` sandbox images。

## Demo 帳號

登入頁不再顯示角色選擇器。測試時請直接輸入下面任一 email：

- Candidate: `alice.candidate@example.com`
- Interviewer: `bob.interviewer@example.com`
- Problem Admin: `cindy.problem_admin@example.com`

登入後前端會依 role 自動導向對應頁面。

## 前端路由

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

如果登入角色不符合路由需求，前端會導回該角色自己的 workspace。

## 本機驗證

建議在 push 前至少跑：

```bash
npm run typecheck
POSTGRES_PORT=5433 npm run test:api
npm run build:web
```

如果本機 PostgreSQL 使用 docker compose，API 測試通常要用 `POSTGRES_PORT=5433`，因為 compose 會把 container 內的 `5432` 映射到 host 的 `5433`。

## CI 驗證

GitHub Actions 會跑：

```bash
npm run ci:verify
```

這包含：

- TypeScript typecheck
- API integration tests
- Web production build

本機如果有安裝 `act`，可以用：

```bash
act push -j verify --bind
```

`act` 會使用 Docker 模擬 GitHub Actions。第一次跑可能會下載 runner image，時間會比較久。
這個專案的 judge tests 會在測試中啟動 Docker sandbox，因此本機用 `act` 時需要加 `--bind`，讓 job container 內產生的 judge 暫存檔能被 Docker daemon 掛載。
跑完 `act --bind` 後，如果本機啟動 Vite 遇到 Rollup native package 錯誤，先跑一次 `npm install` 把 macOS 的 optional dependency 補回來。

## 常見問題

### Sign in 沒反應

先確認 API 是否真的跑在這個專案：

```bash
curl http://localhost:3000/healthz
```

回應應該包含：

- `storageMode: "postgres"`
- `queueMode: "redis-bullmq"`

### Submission 一直 queued

確認 Redis 和 worker 都有啟動：

```bash
docker compose -f infra/docker-compose.yml up -d redis
npm run dev:worker
```

### Web build 缺 Rollup native package

CI workflow 會額外補裝 Linux 的 Rollup native package。若本機遇到類似問題，先重新安裝 dependencies：

```bash
rm -rf node_modules
npm ci
```
