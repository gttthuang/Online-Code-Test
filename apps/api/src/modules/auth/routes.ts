import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { AppError } from "../../core/errors.js";
import { requireUser } from "../../core/auth.js";
import { verifyPassword } from "../../core/password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
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
}
