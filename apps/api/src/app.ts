import Fastify from "fastify";
import multipart from "@fastify/multipart";

import { registerAssignmentRoutes } from "./modules/assignments/routes.js";
import { registerCandidateRoutes } from "./modules/candidates/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCustomRunRoutes } from "./modules/custom-runs/routes.js";
import { registerProblemRoutes } from "./modules/problems/routes.js";
import { registerResultRoutes } from "./modules/results/routes.js";
import { registerReviewRoutes } from "./modules/reviews/routes.js";
import { registerSubmissionRoutes } from "./modules/submissions/routes.js";
import { registerUserRoutes } from "./modules/users/routes.js";
import { toErrorResponse } from "./core/errors.js";
import { requireOpsAccess } from "./core/ops-auth.js";
import { config } from "./config.js";
import { createRedisJudgeQueue } from "./infra/judge-queue.js";
import { createPostgresPool, ensurePostgresDatabase, pingPostgres } from "./infra/postgres.js";
import { initializePostgres } from "./infra/postgres-init.js";
import { PostgresStore } from "./infra/postgres-store.js";
import { createJudgeQueue } from "./infra/redis.js";
import type { JudgeQueue } from "./infra/judge-queue.js";
import { ApiMetrics } from "./observability.js";
import {
  apiRouteDefinitions,
  apiRouteKey,
  assertApiRouteContract,
  createOpenApiDocument
} from "./api-contract.js";

type BuildAppOptions = {
  postgres?: typeof config.postgres;
  logger?: boolean;
  judgeQueue?: JudgeQueue;
  opsToken?: string;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const postgresConfig = options.postgres ?? config.postgres;
  const app = Fastify({
    logger: options.logger ?? true
  });
  const metrics = new ApiMetrics();
  const requestStartTimes = new WeakMap<object, bigint>();
  const opsToken = options.opsToken ?? config.opsToken;
  const registeredRoutes = new Set<string>();

  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];

    for (const method of methods) {
      if (method !== "HEAD" && method !== "OPTIONS") {
        registeredRoutes.add(apiRouteKey(method, routeOptions.url));
      }
    }
  });
  app.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, process.hrtime.bigint());
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartTimes.get(request);

    if (startedAt === undefined) {
      return;
    }

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    metrics.observeHttpRequest(
      request.routeOptions.url ?? "unmatched",
      request.method,
      reply.statusCode,
      durationSeconds
    );
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
    readiness: "/readyz",
    metrics: "/metrics",
    openapi: "/openapi.json",
    demoAccounts: {
      candidate: "alice.candidate@example.com",
      interviewer: "bob.interviewer@example.com",
      problemAdmin: "cindy.problem_admin@example.com"
    },
    routes: apiRouteDefinitions.map(({ method, path }) => apiRouteKey(method, path))
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "api"
  }));

  app.get("/readyz", async (_request, reply) => {
    const [postgresResult, redisResult] = await Promise.allSettled([
      pingPostgres(postgresPool),
      judgeQueue.ping?.() ?? Promise.resolve()
    ]);
    const ready = postgresResult.status === "fulfilled" && redisResult.status === "fulfilled";

    return reply
      .header("cache-control", "no-store")
      .status(ready ? 200 : 503)
      .send({
        status: ready ? "ready" : "unavailable",
        service: "api",
        dependencies: {
          postgres: postgresResult.status === "fulfilled" ? "reachable" : "unreachable",
          redis: redisResult.status === "fulfilled" ? "reachable" : "unreachable"
        }
      });
  });

  app.get("/internal/stats", async (request, reply) => {
    requireOpsAccess(request, opsToken);

    return reply
      .header("cache-control", "no-store")
      .send({
        service: "api",
        generatedAt: new Date().toISOString(),
        queueMode: "redis-bullmq",
        storageMode: "postgres",
        stats: await store.getInternalStats()
      });
  });

  app.get("/metrics", async (request, reply) => {
    requireOpsAccess(request, opsToken);

    return reply
      .header("cache-control", "no-store")
      .header("content-type", metrics.contentType)
      .send(await metrics.render(await store.getInternalStats()));
  });

  app.get("/openapi.json", async (_request, reply) => reply
    .header("cache-control", "no-store")
    .send(createOpenApiDocument()));

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    reply.status(statusCode).send(body);
  });
  await app.register(multipart);
  registerAuthRoutes(app, context);
  registerCandidateRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerCustomRunRoutes(app, context);
  registerProblemRoutes(app, context);
  registerSubmissionRoutes(app, context);
  registerResultRoutes(app, context);
  registerReviewRoutes(app, context);
  registerUserRoutes(app, context);
  assertApiRouteContract(registeredRoutes);

  return app;
}
