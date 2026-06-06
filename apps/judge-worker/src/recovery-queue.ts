import { randomUUID } from "node:crypto";

import {
  getJudgeJobId,
  judgeQueueJobOptions,
  type JudgeJob
} from "@oct/contracts";

export function getRecoveryJobOptions(job: JudgeJob, recoveryId: string = randomUUID()) {
  return {
    jobId: `${getJudgeJobId(job)}-recovery-${recoveryId}`,
    ...judgeQueueJobOptions
  };
}
