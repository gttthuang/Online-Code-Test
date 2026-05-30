# 1. 建置階段 (Builder)
FROM node:22-slim AS builder
WORKDIR /app

# 安裝依賴 (包含開發用的 TypeScript)
COPY package*.json ./
# 如果你有 root 的 package.json，這裡會幫你裝好所有 dependencies
RUN npm ci

# 複製原始碼並建置
COPY . .
RUN npm run build

# 2. 執行階段 (Production)
FROM node:22-slim
WORKDIR /app

# 安裝 PM2 用來管理多個行程 (API 和 Worker)
RUN npm install -g pm2

# 只從 builder 複製需要的檔案 (減少 Image 大小)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
# 如果你的程式啟動時需要設定檔，記得也複製過來
COPY --from=builder /app/apps/api/config ./apps/api/config

# 設定啟動指令：使用 PM2 同時啟動 API 與 Worker
# 我們需要一個 processes.json 檔案 (見下方說明)
COPY processes.json .

CMD ["pm2-runtime", "processes.json"]