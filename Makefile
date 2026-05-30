# --- 設定環境與變數 ---
.PHONY: setup deploy-web deploy-api

setup:
	@echo "===> 安裝 NPM 依賴..."
	npm ci
	@echo "===> 檢查環境變數檔案..."
	@if [ ! -f .env ]; then \
		echo "===> 偵測到 .env 不存在，正在從範本生成..."; \
		cp .env.example .env; \
		echo "✅ .env 已建立，請務必編輯該檔案填入正確的設定！"; \
	else \
		echo "✅ .env 已存在，跳過生成。"; \
	fi
	@if command -v docker > /dev/null; then \
		echo "===> 啟動 Docker 容器..."; \
		docker compose -f infra/docker-compose.yml up -d; \
	else \
		echo "⚠️  警告: 未檢測到 Docker，請手動確保 Redis 和 Postgres 已啟動！"; \
	fi

# 在 Makefile 最上方定義
S3_BUCKET = online-code-test-web-2026-513386726380-ap-southeast-2-an

deploy-web:
	@echo "===> 建置前端..."
	npm run build:web
	@echo "===> 上傳至 S3..."
	aws s3 sync apps/web/dist s3://$(S3_BUCKET) --delete

# # 部署後端 API/Worker
# deploy-api:
# 	@echo "===> 建置 Docker Image..."
# 	docker build -t my-app-image .
# 	@echo "===> 推送至 ECR..."
# 	aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 你的帳號.dkr.ecr.ap-southeast-2.amazonaws.com
# 	docker tag my-app-image:latest 你的帳號.dkr.ecr.ap-southeast-2.amazonaws.com/my-app:latest
# 	docker push 你的帳號.dkr.ecr.ap-southeast-2.amazonaws.com/my-app:latest
# 	@echo "===> 更新服務..."
# 	aws ecs update-service --cluster 你的集群 --service 你的服務 --force-new-deployment