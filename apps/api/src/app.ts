import Fastify from "fastify";

import { registerAssignmentRoutes } from "./modules/assignments/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerProblemRoutes } from "./modules/problems/routes.js";
import { registerResultRoutes } from "./modules/results/routes.js";
import { registerSubmissionRoutes } from "./modules/submissions/routes.js";
import { toErrorResponse } from "./core/errors.js";
import { FakeJudgeQueue } from "./infra/fake-judge-queue.js";
import { InMemoryStore } from "./infra/in-memory-store.js";

export function buildApp() {
  const app = Fastify({
    logger: true
  });

  const store = new InMemoryStore();
  const judgeQueue = new FakeJudgeQueue(store);
  const context = { store, judgeQueue };

  app.get("/", async () => ({
    service: "online-code-test-api",
    status: "ok",
    healthcheck: "/healthz",
    demoAccounts: {
      candidate: "alice.candidate@example.com",
      interviewer: "bob.interviewer@example.com",
      problemAdmin: "cindy.problem_admin@example.com"
    },
    routes: [
      "POST /auth/login",
      "GET /auth/me",
      "GET /me/assignments",
      "GET /me/problems/:problemId",
      "POST /me/submissions",
      "GET /me/submissions/:submissionId",
      "POST /admin/problems",
      "GET /admin/problems",
      "POST /admin/assignments",
      "GET /admin/candidates/:candidateId/results"
    ]
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "api",
    storageMode: "in-memory",
    queueMode: "fake-judge"
  }));

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    reply.status(statusCode).send(body);
  });

  registerAuthRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerProblemRoutes(app, context);
  registerSubmissionRoutes(app, context);
  registerResultRoutes(app, context);

  return app;
}
