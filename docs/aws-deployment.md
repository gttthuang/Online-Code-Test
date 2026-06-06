# AWS Deployment

這份文件描述 repo 內目前建議的 AWS 部署方式。

目標是：

- Frontend: `S3 + CloudFront`
- API: `Elastic Beanstalk`
- Database: `RDS PostgreSQL`
- Queue: `ElastiCache Redis`
- Judge Worker: `ECS on EC2`

這樣的拆法符合目前程式的技術限制：

- `apps/api` 適合用受管 web platform 跑
- `apps/judge-worker` 目前真的需要呼叫 Docker sandbox，所以不能直接丟到 Lambda / Fargate
- 只有 worker 保留在可掛載 Docker socket 的節點池上，不是整套系統都丟到單台 EC2

## 最短操作路徑

如果你只是要把一套 `dev` 環境打起來，照這個順序：

```bash
cp infra/aws/deploy.env.example infra/aws/deploy.env
```

確認：

```bash
APP_NAME=online-code-test
STAGE=dev
AWS_REGION=ap-northeast-1
```

然後直接跑：

```bash
bash infra/aws/bootstrap.sh
bash infra/aws/deploy.sh
```

如果 GitHub repository secrets / variables 已填好，現在也支援：

- `main` 上的 `CI` 成功後自動觸發 `Deploy AWS`
- 也可以在 GitHub Actions 頁面手動觸發 `Deploy AWS`
- deploy workflow 設了 concurrency，同一個 branch 只保留最新部署，舊的 in-progress deploy 會被取消

腳本會自動處理：

- ECR
- RDS
- ElastiCache
- ECS worker
- Elastic Beanstalk API
- S3 + CloudFront frontend
- DB password secret
- operations token secret
- CloudWatch log streaming 與 RDS / Redis / ECS alarms

其中 DB 密碼預設不需要手填。腳本會優先用 Secrets Manager，secret name 預設是：

```bash
${APP_NAME}/${STAGE}/postgres/master-password
```

`OPS_TOKEN` 也不需要手填，預設 secret name 是：

```bash
${APP_NAME}/${STAGE}/api/ops-token
```

## 檔案入口

- script: `infra/aws/bootstrap.sh`
- script: `infra/aws/deploy.sh`
- script: `infra/aws/status.sh`
- config example: `infra/aws/deploy.env.example`
- templates:
  - `infra/aws/templates/foundation.yaml`
  - `infra/aws/templates/data.yaml`
  - `infra/aws/templates/edge.yaml`
  - `infra/aws/templates/worker.yaml`

## 第一次設定

先複製一份部署設定：

```bash
cp infra/aws/deploy.env.example infra/aws/deploy.env
```

至少要填：

```bash
APP_NAME=online-code-test
STAGE=dev
AWS_REGION=ap-northeast-1
```

其他值可以先用預設。

現在預設不需要手動填 `DB_PASSWORD`：

- 如果 `DB_PASSWORD` 留空，腳本會先找 Secrets Manager 裡的既有 secret
- 找不到就自動產生一組密碼
- 然後把它存到 Secrets Manager，預設 secret name 是：

```bash
${APP_NAME}/${STAGE}/postgres/master-password
```

如果你想覆蓋這個名稱，可以另外填：

```bash
DB_PASSWORD_SECRET_NAME=your/custom/secret/name
```

如果你不想把密碼直接放在 `deploy.env`，也可以改成放 AWS SSM Parameter，然後只填 parameter name：

```bash
DB_PASSWORD_SSM_PARAMETER=/online-code-test/prod/db/password
REDIS_PASSWORD_SSM_PARAMETER=/online-code-test/prod/redis/password
```

腳本邏輯是：

- DB:
  - 先讀直接給的 `DB_PASSWORD`
  - 否則讀 Secrets Manager 的 `DB_PASSWORD_SECRET_NAME`
  - 再不然讀 `DB_PASSWORD_SSM_PARAMETER`
  - 都沒有就自動產生並寫入 Secrets Manager
- Redis:
  - 先讀直接給的 `REDIS_PASSWORD`
  - 如果沒給，再讀 `REDIS_PASSWORD_SSM_PARAMETER`

## 一鍵部署

第一次建 AWS 基礎設施：

```bash
bash infra/aws/bootstrap.sh
```

完整部署或更新：

```bash
bash infra/aws/deploy.sh
```

看目前 stack / environment 狀態：

```bash
bash infra/aws/status.sh
```

部署後做 end-to-end smoke test：

```bash
bash infra/aws/smoke-test.sh
```

## 這個腳本會做什麼

`bash infra/aws/deploy.sh` 會依序：

1. 建立或更新 foundation stack
2. 建立或更新 data stack
3. 建立或更新 ECR image
4. 建立或更新 Elastic Beanstalk API environment，讓 API 先跑 migrations
5. 建立或更新 ECS worker stack
6. 建立或更新 CloudFront + frontend bucket
7. build web 並上傳到 S3
8. 對 CloudFront 做 invalidation

`bash infra/aws/smoke-test.sh` 會從 CloudFront 驗證 `/healthz`、透過 `/readyz`
確認 PostgreSQL / Redis、帶 operations token 抓 `/metrics`，再建立一筆 candidate
custom run 並輪詢到 worker 實際執行完成。GitHub Actions 的 Deploy AWS workflow
也會在部署後自動跑同一支 script。

## 建立出的 AWS 資源

- CloudFormation stacks
  - `${APP_NAME}-${STAGE}-foundation`
  - `${APP_NAME}-${STAGE}-data`
  - `${APP_NAME}-${STAGE}-worker`
  - `${APP_NAME}-${STAGE}-edge`
- Elastic Beanstalk
  - application: `${APP_NAME}-${STAGE}-api`
  - environment: `${APP_NAME}-${STAGE}-api-env`

## GitHub Actions 設定

如果要讓另一個人不碰本機 AWS CLI、直接按 GitHub Actions deploy，建議這樣設：

### Secrets

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

如果你想手動指定 DB 密碼，才需要放：

- `DB_PASSWORD`
- `OPS_TOKEN`（不填會由腳本自動產生）

如果你改成由 AWS SSM 管密碼，也可以改放：

- `DB_PASSWORD_SSM_PARAMETER`
- `REDIS_PASSWORD_SSM_PARAMETER`

如果你要指定 Secrets Manager 名稱，也可以放：

- `DB_PASSWORD_SECRET_NAME`
- `OPS_TOKEN_SECRET_NAME`

### Variables

- `APP_NAME`
- `STAGE`
- `AWS_REGION`
- `DB_NAME`
- `DB_USERNAME`
- `DB_INSTANCE_CLASS`
- `REDIS_NODE_TYPE`
- `REDIS_TLS`
- `WORKER_INSTANCE_TYPE`
- `WORKER_DESIRED_CAPACITY`
- `WORKER_MAX_SIZE`
- `JUDGE_QUEUE_CONCURRENCY`

### 建議

最簡單的第一版：

- secret 只放真正敏感值
- 其他一律放 GitHub Variables
- repo 本機開發時才使用 `infra/aws/deploy.env`

這樣 teammate setup 最少，只需要填 GitHub repository settings。

## 注意事項

- 這套腳本預設抓 default VPC 和 default subnets。
- `RDS` / `ElastiCache` 會放在同一個 VPC 內，由 VPC CIDR 允許 API / worker 存取。
- `Elastic Beanstalk` 目前是單一 API image，不負責跑 judge worker。
- `CloudFront` 會把 API、health、metrics 與 OpenAPI 路徑轉送到 API origin，其餘路徑回 frontend。
- Elastic Beanstalk 使用 `/readyz` 做 load balancer health check，並把 platform / container logs 串到 CloudWatch Logs，保留 14 天。
- data stack 會建立 RDS 高 CPU / 低空間與 Redis 高 CPU / eviction alarms。
- worker stack 會建立 ECS service 高 CPU / 高記憶體 alarms。
- alarms 目前未綁通知目的地；production 可再把 SNS / PagerDuty ARN 接上。
- frontend build 目前預設走 same-origin，相容於 CloudFront path-based routing。

## 目前仍然是第一版

這版的重點是：

- 可重跑
- 不再依賴手動 SSH + PM2
- 不再把整套系統都塞進單一 EC2

之後還值得補的項目：

- CloudFront custom domain + ACM
- ECS worker auto scaling policy
- AWS Managed Prometheus 或其他長期 metrics scraper
