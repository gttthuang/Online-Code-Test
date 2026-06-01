import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { languages, problemDifficulties } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";
import { problemValidation } from "../../core/validation.js";
import { assertCandidateExamCanAccessProblem } from "../assignments/exam-access.js";

const problemIdParamsSchema = z.object({
  problemId: z.string().min(1)
});

const deleteProblemQuerySchema = z.object({
  force: z.union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true")
});

const archiveProblemSchema = z.object({
  archived: z.boolean()
});

const hiddenTestCaseSchema = z.object({
  input: z.string().max(problemValidation.testCaseTextMaxChars),
  expectedOutput: z.string().max(problemValidation.testCaseTextMaxChars)
});

const createProblemSchema = z.object({
  title: z.string().trim()
    .min(problemValidation.title.min)
    .max(problemValidation.title.max),
  description: z.string().trim()
    .min(problemValidation.description.min)
    .max(problemValidation.description.max),
  difficulty: z.enum(problemDifficulties),
  timeLimitMs: z.number().int()
    .min(problemValidation.timeLimitMs.min)
    .max(problemValidation.timeLimitMs.max),
  memoryLimitKb: z.number().int()
    .min(problemValidation.memoryLimitKb.min)
    .max(problemValidation.memoryLimitKb.max),
  supportedLanguages: z.array(z.enum(languages))
    .min(1)
    .max(languages.length),
  sampleInput: z.string().max(problemValidation.sampleTextMaxChars),
  sampleOutput: z.string().max(problemValidation.sampleTextMaxChars),
  hiddenTestCases: z.array(hiddenTestCaseSchema)
    .min(problemValidation.hiddenTestCaseCount.min)
    .max(problemValidation.hiddenTestCaseCount.max)
}).superRefine((value, ctx) => {
  if (new Set(value.supportedLanguages).size !== value.supportedLanguages.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "supportedLanguages must not contain duplicates",
      path: ["supportedLanguages"]
    });
  }
});

export async function registerProblemRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/me/problems/:problemId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const params = problemIdParamsSchema.parse(request.params);

    await assertCandidateExamCanAccessProblem(context, user.id, params.problemId);

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
    const query = deleteProblemQuerySchema.parse(request.query);
    const impact = await context.store.getProblemLifecycleImpact(params.problemId);

    if (!impact) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    if (!impact.canDeleteWithoutForce && !query.force) {
      throw new AppError(
        400,
        "problem_in_use",
        "Cannot delete problem because it is assigned or has candidate submissions",
        impact
      );
    }

    const deleted = await context.store.deleteProblem(params.problemId, {
      force: query.force
    });

    if (!deleted) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return reply.status(204).send();
  });

  app.get("/admin/problems/:problemId/impact", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["problem_admin"]);

    const params = problemIdParamsSchema.parse(request.params);
    const impact = await context.store.getProblemLifecycleImpact(params.problemId);

    if (!impact) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return impact;
  });

  app.patch("/admin/problems/:problemId/archive", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["problem_admin"]);

    const params = problemIdParamsSchema.parse(request.params);
    const body = archiveProblemSchema.parse(request.body);
    const problem = await context.store.archiveProblem(params.problemId, body.archived);

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    return {
      problem
    };
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

  let supportedLanguages: unknown;

  try {
    supportedLanguages = JSON.parse(fields.get("supportedLanguages") ?? "[]");
  } catch {
    throw new AppError(400, "invalid_supported_languages", "supportedLanguages must be valid JSON");
  }

  const hiddenTestCases: Array<{ input: string; expectedOutput: string }> = [];

  for (let index = 0; ; index += 1) {
    const input = fields.get(`testcases[${index}][input]`);
    const output = fields.get(`testcases[${index}][output]`);

    if (!input && !output) {
      break;
    }

    if (!input || !output) {
      throw new AppError(400, "invalid_testcase_upload", "Each testcase must include both input and output", {
        index,
        missingInput: !input,
        missingOutput: !output
      });
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
    supportedLanguages,
    sampleInput: fields.get("sampleInput"),
    sampleOutput: fields.get("sampleOutput"),
    hiddenTestCases
  });
}
