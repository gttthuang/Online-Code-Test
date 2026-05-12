import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
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
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const params = problemIdParamsSchema.parse(request.params);

    if (!(await context.store.isProblemAssigned(user.id, params.problemId))) {
      throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
    }

    const problem = await context.store.getProblemDetail(params.problemId);

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return problem;
  });

  app.get("/admin/problems", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer", "problem_admin"]);

    return context.store.listProblems();
  });

  app.post("/admin/problems", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["problem_admin"]);

    const body = await parseCreateProblemRequest(request);

    return {
      problem: await context.store.createProblem(body, user.id)
    };
  });

  app.delete("/admin/problems/:problemId", async (request, reply) => {
    const user = await requireUser(request, context);
    requireRole(user, ["problem_admin"]);

    const params = problemIdParamsSchema.parse(request.params);

    const [hasAssignment, hasSubmission] = await Promise.all([
      context.store.hasAnyAssignment(params.problemId),
      context.store.hasAnySubmission(params.problemId)
    ]);

    if (hasAssignment || hasSubmission) {
      throw new AppError(400, "problem_in_use", "Cannot delete problem in use");
    }

    const deleted = await context.store.deleteProblem(params.problemId);

    if (!deleted) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return reply.status(204).send();
  });

  app.get("/admin/problems/:problemId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["problem_admin", "interviewer"]);

    const params = problemIdParamsSchema.parse(request.params);

    const problem = await context.store.getProblemDetail(params.problemId);

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return problem;
  });
}

async function parseCreateProblemRequest(request: FastifyRequest) {
  if (!request.isMultipart()) {
    return createProblemSchema.parse(request.body);
  }

  const fields = new Map<string, string>();

  for await (const part of request.parts()) {
    if (part.type === "field") {
      fields.set(part.fieldname, String(part.value));
      continue;
    }

    const content = (await part.toBuffer()).toString("utf8");
    fields.set(part.fieldname, content);
  }

  const hiddenTestCases: Array<{ input: string; expectedOutput: string }> = [];

  for (let index = 0; ; index += 1) {
    const input = fields.get(`testcases[${index}][input]`);
    const output = fields.get(`testcases[${index}][output]`);

    if (!input && !output) {
      break;
    }

    if (!input || !output) {
      throw new AppError(400, "invalid_testcase_upload", "Each testcase must include both input and output");
    }

    hiddenTestCases.push({
      input,
      expectedOutput: output
    });
  }

  return createProblemSchema.parse({
    title: fields.get("title"),
    description: fields.get("description"),
    difficulty: fields.get("difficulty"),
    timeLimitMs: Number(fields.get("timeLimitMs")),
    memoryLimitKb: Number(fields.get("memoryLimitKb")),
    supportedLanguages: JSON.parse(fields.get("supportedLanguages") ?? "[]"),
    sampleInput: fields.get("sampleInput"),
    sampleOutput: fields.get("sampleOutput"),
    hiddenTestCases
  });
}
