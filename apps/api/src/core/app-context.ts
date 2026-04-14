import type { FakeJudgeQueue } from "../infra/fake-judge-queue.js";
import type { InMemoryStore } from "../infra/in-memory-store.js";

export interface AppContext {
  store: InMemoryStore;
  judgeQueue: FakeJudgeQueue;
}
