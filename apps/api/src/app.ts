import Fastify from "fastify";

import { registerAssignmentRoutes } from "./modules/assignments/routes.js";
import { registerCandidateRoutes } from "./modules/candidates/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerProblemRoutes } from "./modules/problems/routes.js";
import { registerResultRoutes } from "./modules/results/routes.js";
import { registerSubmissionRoutes } from "./modules/submissions/routes.js";
import { toErrorResponse } from "./core/errors.js";
import { config } from "./config.js";
import { DatabaseJudgeQueue } from "./infra/judge-queue.js";
import { createPostgresPool, ensurePostgresDatabase, pingPostgres } from "./infra/postgres.js";
import { initializePostgres } from "./infra/postgres-init.js";
import { PostgresStore } from "./infra/postgres-store.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await ensurePostgresDatabase(config.postgres);
  const postgresPool = createPostgresPool(config.postgres);
  await initializePostgres(postgresPool);

  const store = new PostgresStore(postgresPool);
  const judgeQueue = new DatabaseJudgeQueue();
  const context = { store, judgeQueue };

  app.addHook("onClose", async () => {
    await postgresPool.end();
  });

  app.get("/", async () => ({
    service: "online-code-test-api",
    status: "ok",
    docs: {
      apiContractFile: "docs/api-contract.md",
      teamHandoffFile: "docs/team-handoff-zh.md"
    },
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
      "GET /admin/candidates",
      "POST /admin/candidates",
      "POST /admin/problems",
      "GET /admin/problems",
      "POST /admin/assignments",
      "GET /admin/candidates/:candidateId/results"
    ]
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "api",
    storageMode: "postgres",
    queueMode: "database-polling",
    postgres: {
      configuredHost: config.postgres.host,
      configuredDatabase: config.postgres.database,
      status: await pingPostgres(postgresPool)
        .then(() => "reachable")
        .catch(() => "unreachable")
    }
  }));

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    reply.status(statusCode).send(body);
  });

  registerAuthRoutes(app, context);
  registerCandidateRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerProblemRoutes(app, context);
  registerSubmissionRoutes(app, context);
  registerResultRoutes(app, context);

  return app;
}
