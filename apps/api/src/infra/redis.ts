import { Redis } from "ioredis";
import { Queue } from "bullmq";
import type { JudgeJob } from "@oct/contracts";

import { judgeQueueName } from "./judge-queue.js";

type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
};

export function createRedisConnection(config: RedisConfig) {
  const isLocal = config.host === 'localhost' || config.host === '127.0.0.1';

  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    // 只有在非本地開發環境才啟用 TLS
    tls: isLocal ? undefined : {
      rejectUnauthorized: false,
      servername: config.host
    },
    connectTimeout: 10000,
    maxRetriesPerRequest: null
  });
}
export function createJudgeQueue(config: RedisConfig) {
  // return new Queue<JudgeJob>(judgeQueueName, {
  //   connection: createRedisConnection(config)
  // });
  return new Queue<JudgeJob>(`{${judgeQueueName}}`, {
    connection: createRedisConnection(config)
  });
}

