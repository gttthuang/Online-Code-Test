import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const createAssignmentSchema = z.object({
  candidateId: z.string().min(1),
  problemId: z.string().min(1)
});

export async function registerAssignmentRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/me/assignments", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    return context.store.listAssignmentsForCandidate(user.id);
  });

  app.post("/admin/assignments", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const body = createAssignmentSchema.parse(request.body);
    const candidate = await context.store.getUserById(body.candidateId);
    const problem = await context.store.getProblem(body.problemId);

    if (!candidate || candidate.role !== "candidate") {
      throw new AppError(404, "candidate_not_found", "Candidate does not exist");
    }

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    if (await context.store.hasAssignment(body.candidateId, body.problemId)) {
      throw new AppError(409, "assignment_exists", "This problem is already assigned to the candidate");
    }

    return {
      assignment: await context.store.createAssignment(body.candidateId, body.problemId, user.id)
    };
  });
}
