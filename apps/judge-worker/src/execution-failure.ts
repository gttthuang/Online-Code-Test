import type { JudgeFailureType } from "@oct/contracts";

export class ExecutionFailure extends Error {
  constructor(
    readonly type: JudgeFailureType,
    message: string
  ) {
    super(message);
  }
}
