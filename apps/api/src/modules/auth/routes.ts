import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { MIN_PASSWORD_LENGTH } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { AppError } from "../../core/errors.js";
import { requireUser } from "../../core/auth.js";
import { hashPassword, verifyPassword } from "../../core/password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH)
});

export async function registerAuthRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const credential = await context.store.findUserCredentialByEmail(body.email);

    if (!credential || !verifyPassword(body.password, credential.passwordHash)) {
      throw new AppError(401, "invalid_credentials", "Incorrect email or password");
    }

    return {
      token: credential.user.id,
      user: credential.user
    };
  });

  app.get("/auth/me", async (request) => {
    return requireUser(request, context);
  });

  app.post("/me/password", async (request, reply) => {
    const user = await requireUser(request, context);
    const body = changePasswordSchema.parse(request.body);

    const credential = await context.store.getUserCredentialById(user.id);

    if (!credential || !verifyPassword(body.currentPassword, credential.passwordHash)) {
      throw new AppError(401, "invalid_credentials", "Current password is incorrect");
    }

    await context.store.updateUserPassword(user.id, hashPassword(body.newPassword));

    return reply.status(204).send();
  });
}
