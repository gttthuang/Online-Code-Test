import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { languages } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";
import { submissionValidation } from "../../core/validation.js";

const createSubmissionSchema = z.object({
  problemId: z.string().min(1),
  language: z.enum(languages),
  sourceCode: z.string()
    .min(1)
    .max(submissionValidation.sourceCodeMax)
}).superRefine((value, ctx) => {
  if (value.sourceCode.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceCode must not be blank",
      path: ["sourceCode"]
    });
  }
});

const submissionIdParamsSchema = z.object({
  submissionId: z.string().min(1)
});

export async function registerSubmissionRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/me/submissions", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const body = createSubmissionSchema.parse(request.body);
    const problem = await context.store.getProblem(body.problemId);

    if (!problem) {
      throw new AppError(404, "problem_not_found", "Problem does not exist");
    }

    if (!(await context.store.isProblemAssigned(user.id, body.problemId))) {
      throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
    }

    if (!problem.supportedLanguages.includes(body.language)) {
      throw new AppError(400, "language_not_supported", "Problem does not support this language");
    }

    const submission = await context.store.createSubmission(user.id, body);

    await context.judgeQueue.enqueue({
      submissionId: submission.id
    });

    return {
      submissionId: submission.id,
      status: submission.status
    };
  });

  app.get("/me/submissions/:submissionId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const params = submissionIdParamsSchema.parse(request.params);
    const submission = await context.store.getSubmissionById(params.submissionId);

    if (!submission || submission.candidateId !== user.id) {
      throw new AppError(404, "submission_not_found", "Submission does not exist");
    }

    return submission;
  });

  // =========================
  // Problem admin preview submission
  // =========================

  app.post("/admin/submissions/preview", async (request) => {
    const user = await requireUser(request, context);

    requireRole(user, ["problem_admin"]);

    const body = createSubmissionSchema.parse(request.body);

    const problem = await context.store.getProblem(body.problemId);

    if (!problem) {
      throw new AppError(
        404,
        "problem_not_found",
        "Problem does not exist"
      );
    }

    if (!problem.supportedLanguages.includes(body.language)) {
      throw new AppError(
        400,
        "language_not_supported",
        "Problem does not support this language"
      );
    }

    // TODO:
    // 可以之後加：
    // 檢查這個 problem_admin 是否為題目 owner

    const submission = await context.store.createSubmission(
      user.id,
      body
    );

    await context.judgeQueue.enqueue({
      submissionId: submission.id
    });

    return {
      submissionId: submission.id,
      status: submission.status
    };
  });

  app.get("/admin/submissions/:submissionId", async (request) => {
    const user = await requireUser(request, context);

    requireRole(user, ["problem_admin"]);

    const params = submissionIdParamsSchema.parse(request.params);

    const submission = await context.store.getSubmissionById(
      params.submissionId
    );

    if (!submission || submission.candidateId !== user.id) {
      throw new AppError(
        404,
        "submission_not_found",
        "Submission does not exist"
      );
    }

    return submission;
  });

}
