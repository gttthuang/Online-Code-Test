import type { FakeJudgeQueue } from "../infra/fake-judge-queue.js";
import type { AppStore } from "../infra/store.js";

export interface AppContext {
  store: AppStore;
  judgeQueue: FakeJudgeQueue;
}
