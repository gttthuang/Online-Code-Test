FROM node:22-slim

WORKDIR /app

COPY package*.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV API_PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "apps/api/src/index.ts"]
