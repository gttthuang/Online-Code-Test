import Fastify from "fastify";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";

import { registerAssignmentRoutes } from "./modules/assignments/routes.js";
import { registerCandidateRoutes } from "./modules/candidates/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerLiveRoomRoutes } from "./modules/live-room/routes.js";
import { registerProblemRoutes } from "./modules/problems/routes.js";
import { registerResultRoutes } from "./modules/results/routes.js";
import { registerReviewRoutes } from "./modules/reviews/routes.js";
import { registerSubmissionRoutes } from "./modules/submissions/routes.js";
import { registerUserRoutes } from "./modules/users/routes.js";
import { toErrorResponse } from "./core/errors.js";
import { config } from "./config.js";
import { createRedisJudgeQueue } from "./infra/judge-queue.js";
import { createPostgresPool, ensurePostgresDatabase, pingPostgres } from "./infra/postgres.js";
import { initializePostgres } from "./infra/postgres-init.js";
import { PostgresStore } from "./infra/postgres-store.js";
import { createJudgeQueue } from "./infra/redis.js";
import type { JudgeQueue } from "./infra/judge-queue.js";

type BuildAppOptions = {
  postgres?: typeof config.postgres;
  logger?: boolean;
  judgeQueue?: JudgeQueue;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const postgresConfig = options.postgres ?? config.postgres;
  const app = Fastify({
    logger: options.logger ?? true
  });

  await ensurePostgresDatabase(postgresConfig);
  const postgresPool = createPostgresPool(postgresConfig);
  await initializePostgres(postgresPool);

  const store = new PostgresStore(postgresPool);
  const judgeQueue =
    options.judgeQueue ??
    createRedisJudgeQueue(createJudgeQueue(config.redis));
  const context = { store, judgeQueue };

  app.addHook("onClose", async () => {
    if (judgeQueue.close) {
      await judgeQueue.close();
    }
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
      "GET /internal/stats",
      "GET /me/assignments",
      "GET /me/problems/:problemId",
      "GET /me/submissions",
      "POST /me/submissions",
      "GET /me/submissions/:submissionId",
      "GET /admin/candidates",
      "POST /admin/candidates",
      "DELETE /admin/candidates/:candidateId",
      "GET /admin/users",
      "POST /admin/users",
      "DELETE /admin/users/:userId",
      "POST /admin/problems",
      "GET /admin/problems",
      "GET /admin/problems/:problemId/impact",
      "PATCH /admin/problems/:problemId/archive",
      "DELETE /admin/problems/:problemId",
      "POST /admin/assignments",
      "GET /admin/candidates/:candidateId/results",
      "GET /admin/candidates/:candidateId/submissions",
      "GET /admin/candidates/:candidateId/reviews",
      "PUT /admin/candidates/:candidateId/reviews/:problemId",
      "DELETE /admin/candidates/:candidateId/reviews/:problemId",
      "GET /admin/submissions",
      "POST /admin/submissions/preview",
      "GET /admin/submissions/:submissionId",
      "WS /live/rooms"
    ]
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "api",
    storageMode: "postgres",
    queueMode: "redis-bullmq",
    postgres: {
      configuredHost: postgresConfig.host,
      configuredDatabase: postgresConfig.database,
      status: await pingPostgres(postgresPool)
        .then(() => "reachable")
        .catch(() => "unreachable")
    },
    redis: {
      configuredHost: config.redis.host,
      configuredDb: config.redis.db
    }
  }));

  app.get("/internal/stats", async () => ({
    service: "api",
    generatedAt: new Date().toISOString(),
    queueMode: "redis-bullmq",
    storageMode: "postgres",
    stats: await store.getInternalStats()
  }));

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    reply.status(statusCode).send(body);
  });
  await app.register(websocket, {
    options: {
      maxPayload: 128 * 1024
    }
  });
  await app.register(multipart);
  registerAuthRoutes(app, context);
  registerCandidateRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerLiveRoomRoutes(app, context);
  registerProblemRoutes(app, context);
  registerSubmissionRoutes(app, context);
  registerResultRoutes(app, context);
  registerReviewRoutes(app, context);
  registerUserRoutes(app, context);

  return app;
}
