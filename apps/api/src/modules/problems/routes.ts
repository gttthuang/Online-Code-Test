import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { languages, problemDifficulties } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const problemIdParamsSchema = z.object({
  problemId: z.string().min(1)
});

const createProblemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(problemDifficulties),
  timeLimitMs: z.number().int().positive(),
  memoryLimitKb: z.number().int().positive(),
  supportedLanguages: z.array(z.enum(languages)).min(1),
  sampleInput: z.string(),
  sampleOutput: z.string(),
  hiddenTestCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string()
      })
    )
    .optional()
});

export async function registerProblemRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/me/problems/:problemId", async (request) => {
    const user = requireUser(request, context);
    requireRole(user, ["candidate"]);

    const params = problemIdParamsSchema.parse(request.params);

    if (!context.store.isProblemAssigned(user.id, params.problemId)) {
      throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
    }

    const problem = context.store.getProblemDetail(params.problemId);

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return problem;
  });

  app.get("/admin/problems", async (request) => {
    const user = requireUser(request, context);
    requireRole(user, ["interviewer", "problem_admin"]);

    return context.store.listProblems();
  });

  app.post("/admin/problems", async (request) => {
    const user = requireUser(request, context);
    requireRole(user, ["problem_admin"]);

    const body = createProblemSchema.parse(request.body);

    return {
      problem: context.store.createProblem(body, user.id)
    };
  });
}
