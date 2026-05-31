# ==========================================
# --- 環境變數與設定 ---
# ==========================================
.PHONY: setup deploy-web deploy-api-ec2 help

# 使用 := 確保變數立即展開，避免末尾隱藏空格
EC2_USER    := ubuntu
EC2_HOST    := 52.64.4.224
APP_DIR     := /home/ubuntu/Online-Code-Test
S3_BUCKET   := online-code-test-web-2026-513386726380-ap-southeast-2-an

# 預設指令：顯示說明文件
.DEFAULT_GOAL := help

help:
	@echo "=========================================================================="
	@echo "                      Online Code Test 部署自動化腳本                      "
	@echo "=========================================================================="
	@echo "可用指令:"
	@echo "  make setup            - 本地環境初始化（安裝依賴、檢查 .env、啟動 Docker）"
	@echo "  make deploy-web       - 前端建置並部署至 AWS S3"
	@echo "  make deploy-api-ec2   - 後端專案同步、遠端建置、資料庫遷移並透過 PM2 重啟"
	@echo "=========================================================================="

# ==========================================
# --- 本地開發環境初始化 ---
# ==========================================
setup:
	@echo "===> [1/3] 安裝本地 NPM 依賴..."
	npm ci

	@echo "===> [2/3] 檢查環境變數檔案..."
	@if [ ! -f .env ]; then \
		echo "⚠️ 偵測到 .env 不存在，正在從範本生成..."; \
		cp .env.example .env; \
		echo "✅ .env 已建立，請務必編輯該檔案填入正確的設定！"; \
	else \
		echo "✅ .env 已存在，跳過生成。"; \
	fi

	@echo "===> [3/3] 檢查並啟動 Docker 容器..."
	@if command -v docker > /dev/null; then \
		docker compose -f infra/docker-compose.yml up -d; \
		echo "✅ Docker 容器已在背景啟動。"; \
	else \
		echo "⚠️ 警告: 未檢測到 Docker，請手動確保 Redis 和 Postgres 已啟動！"; \
	fi

# ==========================================
# --- 1. 前端部署（本地執行，上傳 S3） ---
# ==========================================
deploy-web:
	@echo "===> [1/2] 本地建置前端專案..."
	npm run build:web
	@echo "===> [2/2] 同步前端靜態檔案至 AWS S3..."
	aws s3 sync apps/web/dist s3://$(S3_BUCKET) --delete
	@echo "✨ 前端部署完成！"

# ==========================================
# --- 2. 後端部署（自動化部署至 EC2） ---
# ==========================================
# ==========================================
# --- 2. 後端部署（自動化部署至 EC2） ---
# ==========================================
deploy-api-ec2:
	@echo "===> [1/4] 同步程式碼至遠端 EC2 (排除前端與暫存檔)..."
	rsync -avz --delete \
		--exclude 'node_modules' \
		--exclude '.env' \
		--exclude 'apps/web' \
		--exclude 'dist' \
		--exclude '.git' \
		./ $(EC2_USER)@$(EC2_HOST):$(APP_DIR)/
    
	@echo "===> [1.5/4] 檢查並確保遠端 EC2 的 Docker 容器正在運行..."
	ssh $(EC2_USER)@$(EC2_HOST) "bash -c ' \
		cd $(APP_DIR) && \
		if [ ! -f .env ]; then cp .env.example .env && echo \"⚠️ 已自動生成遠端預設 .env，請記得確認內部設定！\"; fi && \
		echo \"👉 檢查遠端 Docker 狀態...\" && \
		docker compose -f infra/docker-compose.yml up -d'"
    
	@echo "===> [2/4] 在 EC2 上安裝依賴與建置後端專案..."
	ssh $(EC2_USER)@$(EC2_HOST) "bash -c 'set -e; \
		cd $(APP_DIR) && \
		npm ci --prefer-offline && \
		npm run build --workspace @oct/api && \
		npm run build --workspace @oct/judge-worker'"
    
	@echo "===> [2.5/4] 同步遷移檔案與環境變數至產出目錄..."
	ssh $(EC2_USER)@$(EC2_HOST) "bash -c 'set -e; \
		# 1. 確保 API 執行時找得到 migrations 的物理路徑 \
		mkdir -p $(APP_DIR)/apps/api/dist/api/migrations; \
		cp -rf $(APP_DIR)/apps/api/migrations/* $(APP_DIR)/apps/api/dist/api/migrations/ 2>/dev/null || true; \
		# 2. 順便補上可能需要的環境變數檔案 \
		cp $(APP_DIR)/.env $(APP_DIR)/apps/api/dist/api/.env 2>/dev/null || true'"
    
	@echo "===> [3/4] 執行資料庫遷移 (Database Migration)..."
	ssh $(EC2_USER)@$(EC2_HOST) "cd $(APP_DIR) && \
		POSTGRES_HOST='online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com' \
		POSTGRES_PORT='5432' \
		POSTGRES_DB='online_code_test' \
		POSTGRES_USER='postgres' \
		POSTGRES_PASSWORD='cloud-native21' \
		POSTGRES_SSL='true' \
		DATABASE_URL='postgresql://postgres:cloud-native21@online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com:5432/online_code_test?sslmode=require' \
		npm run migrate --workspace @oct/api"
    
	@echo "===> [4/4] 使用 PM2 安全重啟服務..."
	# 確保 EC2 本地使用者有權限呼叫 Docker 沙盒
	ssh $(EC2_USER)@$(EC2_HOST) "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true"
	
	# 1. 啟動/重啟後端 API 服務
	ssh $(EC2_USER)@$(EC2_HOST) "cd $(APP_DIR)/apps/api && \
		POSTGRES_HOST='online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com' \
		POSTGRES_PORT='5432' \
		POSTGRES_DB='online_code_test' \
		POSTGRES_USER='postgres' \
		POSTGRES_PASSWORD='cloud-native21' \
		POSTGRES_SSL='true' \
		DATABASE_URL='postgresql://postgres:cloud-native21@online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com:5432/online_code_test?sslmode=require' \
		REDIS_HOST='127.0.0.1' \
		pm2 reload oct-api --update-env || \
		POSTGRES_HOST='online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com' \
		POSTGRES_PORT='5432' \
		POSTGRES_DB='online_code_test' \
		POSTGRES_USER='postgres' \
		POSTGRES_PASSWORD='cloud-native21' \
		POSTGRES_SSL='true' \
		DATABASE_URL='postgresql://postgres:cloud-native21@online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com:5432/online_code_test?sslmode=require' \
		REDIS_HOST='127.0.0.1' \
		pm2 start dist/api/src/index.js --name oct-api --update-env"

	# 2. 啟動/重啟評測機 Worker 服務 (精準定位到真正擁有主入口 index.js 的 dist 目錄)
	ssh $(EC2_USER)@$(EC2_HOST) "cd $(APP_DIR)/apps/judge-worker/dist && \
		POSTGRES_HOST='online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com' \
		POSTGRES_PORT='5432' \
		POSTGRES_DB='online_code_test' \
		POSTGRES_USER='postgres' \
		POSTGRES_PASSWORD='cloud-native21' \
		POSTGRES_SSL='true' \
		DATABASE_URL='postgresql://postgres:cloud-native21@online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com:5432/online_code_test?sslmode=require' \
		REDIS_HOST='127.0.0.1' \
		pm2 reload oct-worker --update-env || \
		POSTGRES_HOST='online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com' \
		POSTGRES_PORT='5432' \
		POSTGRES_DB='online_code_test' \
		POSTGRES_USER='postgres' \
		POSTGRES_PASSWORD='cloud-native21' \
		POSTGRES_SSL='true' \
		DATABASE_URL='postgresql://postgres:cloud-native21@online-code-test-db.cxsequieeq4b.ap-southeast-2.rds.amazonaws.com:5432/online_code_test?sslmode=require' \
		REDIS_HOST='127.0.0.1' \
		pm2 start index.js --name oct-worker --update-env"
    
	@echo "✨ 後端 API 與 Worker 部署且重啟成功！"