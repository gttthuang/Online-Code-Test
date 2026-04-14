import Fastify from "fastify";

import { toErrorResponse } from "./core/errors.js";

export function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.get("/", async () => ({
    service: "online-code-test-api",
    status: "ok",
    healthcheck: "/healthz",
    routes: [
      "GET /",
      "GET /healthz"
    ]
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "api"
  }));

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    reply.status(statusCode).send(body);
  });

  return app;
}
