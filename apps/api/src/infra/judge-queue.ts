import type { JudgeJob } from "@oct/contracts";

export interface JudgeQueue {
  enqueue(job: JudgeJob): Promise<void>;
}

export class DatabaseJudgeQueue implements JudgeQueue {
  async enqueue(_job: JudgeJob) {
    // The API only persists queued submissions.
    // A separate judge worker polls PostgreSQL and processes them.
  }
}
