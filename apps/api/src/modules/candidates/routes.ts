import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const createCandidateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email()
});

export async function registerCandidateRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/admin/candidates", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    return context.store.listCandidates();
  });

  app.post("/admin/candidates", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const body = createCandidateSchema.parse(request.body);
    const existingUser = await context.store.findUserByEmail(body.email);

    if (existingUser) {
      throw new AppError(409, "candidate_email_exists", "This email is already in use");
    }

    return {
      candidate: await context.store.createCandidate(body)
    };
  });
}
