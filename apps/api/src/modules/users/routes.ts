import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { roles } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const userIdParamsSchema = z.object({
  userId: z.string().min(1)
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  role: z.enum(roles)
});

export async function registerUserRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/admin/users", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    return context.store.listUsers();
  });

  app.post("/admin/users", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const body = createUserSchema.parse(request.body);
    const existingUser = await context.store.findUserByEmail(body.email);

    if (existingUser) {
      throw new AppError(409, "user_email_exists", "This email is already in use", {
        email: body.email
      });
    }

    return {
      user: await context.store.createUser(body)
    };
  });

  app.delete("/admin/users/:userId", async (request, reply) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = userIdParamsSchema.parse(request.params);

    if (params.userId === user.id) {
      throw new AppError(400, "user_self_delete_forbidden", "You cannot delete your own active account");
    }

    if (await context.store.hasUserReferences(params.userId)) {
      throw new AppError(
        400,
        "user_in_use",
        "Cannot delete user because assignments, problems, or submissions still reference this account"
      );
    }

    const deleted = await context.store.deleteUser(params.userId);

    if (!deleted) {
      throw new AppError(404, "user_not_found", "User not found");
    }

    return reply.status(204).send();
  });
}
