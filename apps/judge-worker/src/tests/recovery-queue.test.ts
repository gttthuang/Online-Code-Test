import assert from "node:assert/strict";
import test from "node:test";

import { getRecoveryJobOptions } from "../recovery-queue.js";

test("recovery jobs use unique ids while preserving retry policy", () => {
  const options = getRecoveryJobOptions(
    { kind: "submission", submissionId: "submission-1" },
    "recovery-1"
  );

  assert.equal(
    options.jobId,
    "submission-submission-1-recovery-recovery-1"
  );
  assert.equal(options.attempts, 3);
  assert.deepEqual(options.backoff, {
    type: "exponential",
    delay: 1_000
  });
});
