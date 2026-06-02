import {Queue} from "bullmq";
import {Redis} from "ioredis";

import type {JudgeJob} from "@oct/contracts";

import {judgeQueueName} from "./judge-queue.js";

type RedisConfig = {
  host: string; port : number;
  password?: string; db : number;
  tls?: boolean;
};

export function createRedisConnection(config: RedisConfig) {
  return new Redis({
    host : config.host,
    port : config.port,
    password : config.password,
    db : config.db,
    tls : config.tls ? {rejectUnauthorized : false, servername : config.host}
                     : undefined,
    connectTimeout : 10000,
    maxRetriesPerRequest : null
  });
}

export function createJudgeQueue(config: RedisConfig):
    Queue<JudgeJob, any, string> {
  // 在 new Queue 這裡也補齊三個泛型參數 <JudgeJob, any, string>
  return new Queue<JudgeJob, any, string>(
      judgeQueueName, {connection : createRedisConnection(config) as any});
}
// export function createJudgeQueue(config: RedisConfig) {
//   return new Queue<JudgeJob>(judgeQueueName, {
//     connection: createRedisConnection(config)
// //   });
// }
