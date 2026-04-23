import type { JudgeQueue } from "../infra/judge-queue.js";
import type { AppStore } from "../infra/store.js";

export interface AppContext {
  store: AppStore;
  judgeQueue: JudgeQueue;
}
