import type { FastifyRequest } from "fastify";
import type { AuthUser, UserRole } from "@oct/contracts";

import type { AppContext } from "./app-context.js";
import { AppError } from "./errors.js";

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function getCurrentUser(request: FastifyRequest, context: AppContext): AuthUser | null {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  return context.store.getUserById(token);
}

export function requireUser(request: FastifyRequest, context: AppContext): AuthUser {
  const user = getCurrentUser(request, context);

  if (!user) {
    throw new AppError(401, "unauthorized", "A valid Bearer token is required");
  }

  return user;
}

export function requireRole(user: AuthUser, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new AppError(403, "forbidden", "You do not have permission to access this resource");
  }
}
