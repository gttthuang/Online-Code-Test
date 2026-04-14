import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const candidateIdParamsSchema = z.object({
  candidateId: z.string().min(1)
});

export async function registerResultRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/admin/candidates/:candidateId/results", async (request) => {
    const user = requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = candidateIdParamsSchema.parse(request.params);
    const result = context.store.listCandidateResults(params.candidateId);

    if (!result) {
      throw new AppError(404, "candidate_not_found", "Candidate does not exist");
    }

    return result;
  });
}
