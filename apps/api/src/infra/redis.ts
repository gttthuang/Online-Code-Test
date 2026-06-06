import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { JudgeJob } from "@oct/contracts";

import { judgeQueueName } from "./judge-queue.js";

type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: boolean;
};

export function createRedisConnection(config: RedisConfig) {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    tls: config.tls
      ? {
          rejectUnauthorized: false,
          servername: config.host
        }
      : undefined,
    connectTimeout: 10_000,
    maxRetriesPerRequest: null
  });
}

export function createJudgeQueue(config: RedisConfig) {
  return new Queue<JudgeJob>(judgeQueueName, {
    connection: createRedisConnection(config) as never
  });
}
