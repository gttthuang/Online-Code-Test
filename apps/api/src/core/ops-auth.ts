import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { AppError } from "./errors.js";

export function requireOpsAccess(request: FastifyRequest, opsToken?: string) {
  if (!opsToken) {
    return;
  }

  const authorization = request.headers.authorization;
  const providedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!tokensEqual(providedToken, opsToken)) {
    throw new AppError(401, "ops_unauthorized", "A valid operations Bearer token is required");
  }
}

function tokensEqual(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);
}
