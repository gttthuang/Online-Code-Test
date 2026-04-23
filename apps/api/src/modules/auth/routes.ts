import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { AppError } from "../../core/errors.js";
import { requireUser } from "../../core/auth.js";

const loginSchema = z.object({
  email: z.string().email()
});

export async function registerAuthRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const user = await context.store.findUserByEmail(body.email);

    if (!user) {
      throw new AppError(401, "invalid_credentials", "Unknown email for demo login");
    }

    return {
      token: user.id,
      user
    };
  });

  app.get("/auth/me", async (request) => {
    return requireUser(request, context);
  });
}
