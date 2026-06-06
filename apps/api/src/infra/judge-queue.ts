import { Queue } from "bullmq";
import {
  getJudgeJobId,
  judgeQueueJobOptions,
  type JudgeJob
} from "@oct/contracts";

export interface JudgeQueue {
  enqueue(job: JudgeJob): Promise<void>;
  close?(): Promise<void>;
}

export class RedisJudgeQueue implements JudgeQueue {
  constructor(private readonly queue: Queue<JudgeJob>) {}

  async enqueue(job: JudgeJob) {
    await this.queue.add("judge-submission", job, {
      jobId: getJudgeJobId(job),
      ...judgeQueueJobOptions
    });
  }

  async close() {
    await this.queue.close();
  }
}

export function createRedisJudgeQueue(queue: Queue<JudgeJob>) {
  return new RedisJudgeQueue(queue);
}

export { judgeQueueName } from "@oct/contracts";
