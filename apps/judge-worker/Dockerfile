FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/judge-worker/package.json ./apps/judge-worker/

RUN npm ci --ignore-scripts

COPY packages/contracts ./packages/contracts
COPY apps/judge-worker ./apps/judge-worker

ENV NODE_ENV=production
ENV JUDGE_SANDBOX_WORK_ROOT=/var/lib/oct-judge-work

CMD ["node", "--import", "tsx", "apps/judge-worker/src/index.ts"]
