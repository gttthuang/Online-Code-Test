import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { languages } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";
import { submissionValidation } from "../../core/validation.js";
import { assertCandidateExamCanAccessProblem } from "../assignments/exam-access.js";

const customRunFields = {
  problemId: z.string().min(1),
  language: z.enum(languages),
  sourceCode: z.string().min(1).max(submissionValidation.sourceCodeMax),
  stdin: z.string().max(64_000)
};

const customRunSchema = z.object(customRunFields).superRefine(validateSourceCode);

const adminCustomRunSchema = z.object({
  ...customRunFields,
  candidateId: z.string().min(1)
}).superRefine(validateSourceCode);

const runIdParamsSchema = z.object({
  runId: z.string().min(1)
});

function validateSourceCode(value: { sourceCode: string }, ctx: z.RefinementCtx) {
  if (value.sourceCode.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceCode must not be blank",
      path: ["sourceCode"]
    });
  }
}

export async function registerCustomRunRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/me/custom-runs", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const body = customRunSchema.parse(request.body);
    await assertCanRunProblem(context, user.id, body.problemId, body.language);
    await assertCandidateExamCanAccessProblem(context, user.id, body.problemId);

    const run = await context.store.createCustomRun({
      candidateId: user.id,
      problemId: body.problemId,
      requestedBy: user.id,
      run: body
    });

    await context.judgeQueue.enqueue({
      kind: "custom_run",
      runId: run.id
    });

    return {
      runId: run.id,
      status: run.status
    };
  });

  app.get("/me/custom-runs/:runId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const params = runIdParamsSchema.parse(request.params);
    const run = await context.store.getCustomRun(params.runId);

    if (run?.candidateId !== user.id) {
      throw new AppError(404, "custom_run_not_found", "Custom run does not exist");
    }

    return run;
  });

  app.post("/admin/custom-runs", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer", "problem_admin"]);

    const { candidateId: requestedCandidateId, ...runPayload } = adminCustomRunSchema.parse(request.body);
    const candidateId = user.role === "problem_admin" ? user.id : requestedCandidateId;

    if (user.role === "problem_admin") {
      await assertProblemSupportsLanguage(context, runPayload.problemId, runPayload.language);
    } else {
      await assertCanViewCandidateProblem(context, user, requestedCandidateId, runPayload.problemId);
      await assertCanRunProblem(context, requestedCandidateId, runPayload.problemId, runPayload.language);
    }

    const run = await context.store.createCustomRun({
      candidateId,
      problemId: runPayload.problemId,
      requestedBy: user.id,
      run: runPayload
    });

    await context.judgeQueue.enqueue({
      kind: "custom_run",
      runId: run.id
    });

    return {
      runId: run.id,
      status: run.status
    };
  });

  app.get("/admin/custom-runs/:runId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer", "problem_admin"]);

    const params = runIdParamsSchema.parse(request.params);
    const run = await context.store.getCustomRun(params.runId);

    if (!run) {
      throw new AppError(404, "custom_run_not_found", "Custom run does not exist");
    }

    if (user.role !== "problem_admin") {
      await assertCanViewCandidateProblem(context, user, run.candidateId, run.problemId);
    }

    return run;
  });
}

async function assertProblemSupportsLanguage(
  context: AppContext,
  problemId: string,
  language: string
) {
  const problem = await context.store.getProblem(problemId);

  if (!problem) {
    throw new AppError(404, "problem_not_found", "Problem does not exist");
  }

  if (!problem.supportedLanguages.includes(language as typeof problem.supportedLanguages[number])) {
    throw new AppError(400, "language_not_supported", "Problem does not support this language");
  }
}

async function assertCanRunProblem(
  context: AppContext,
  candidateId: string,
  problemId: string,
  language: string
) {
  const problem = await context.store.getProblem(problemId);

  if (!problem) {
    throw new AppError(404, "problem_not_found", "Problem does not exist");
  }

  if (!(await context.store.isProblemAssigned(candidateId, problemId))) {
    throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
  }

  if (!problem.supportedLanguages.includes(language as typeof problem.supportedLanguages[number])) {
    throw new AppError(400, "language_not_supported", "Problem does not support this language");
  }
}

async function assertCanViewCandidateProblem(
  context: AppContext,
  user: Awaited<ReturnType<typeof requireUser>>,
  candidateId: string,
  problemId: string
) {
  const candidate = await context.store.getUserById(candidateId);

  if (candidate?.role !== "candidate") {
    throw new AppError(404, "candidate_not_found", "Candidate does not exist");
  }

  if (!(await context.store.isProblemAssigned(candidateId, problemId))) {
    throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
  }

  if (user.role === "problem_admin") {
    return;
  }

  if (user.role === "interviewer") {
    return;
  }

  throw new AppError(403, "custom_run_forbidden", "You do not have access to this custom run");
}
