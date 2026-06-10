import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";
import { generatePassword, hashPassword } from "../../core/password.js";

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

    const password = generatePassword();
    const candidate = await context.store.createCandidate(body, hashPassword(password));

    return {
      candidate,
      password
    };
  });

  app.delete("/admin/candidates/:candidateId", async (request, reply) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = z.object({ candidateId: z.string() }).parse(request.params);

    const [hasAssignments, hasSubmissions] = await Promise.all([
      context.store.hasAnyAssignmentForCandidate(params.candidateId),
      context.store.hasAnySubmissionByCandidate(params.candidateId)
    ]);

    if (hasAssignments || hasSubmissions) {
      throw new AppError(400, "candidate_in_use", "Cannot delete candidate because they have assignments or submissions", {
        hasAssignments,
        hasSubmissions
      });
    }

    const deleted = await context.store.deleteCandidate(params.candidateId);

    if (!deleted) {
      throw new AppError(404, "candidate_not_found", "Candidate not found");
    }

    return reply.status(204).send();
  });
}
