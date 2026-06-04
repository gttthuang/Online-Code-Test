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
    try {
      const user = await requireUser(request, context);
      requireRole(user, ["interviewer", "problem_admin"]);

      // 這裡 body.candidateId 現在已經是前端傳過來的真實 currentUserId 了！
      const body = adminCustomRunSchema.parse(request.body);
      
      const isProblemAdmin = user.role === "problem_admin";
      let finalCandidateId = body.candidateId;

      if (isProblemAdmin) {
        // 管理員預覽流程：安全起見，如果前端不小心還是傳了 "admin-preview"，我們就保底用目前登入的 user.id
        if (finalCandidateId === "admin-preview") {
          finalCandidateId = user.id;
        }

        const problem = await context.store.getProblem(body.problemId);
        if (!problem) {
          const error = new Error("Problem does not exist") as any;
          error.statusCode = 404;
          error.code = "problem_not_found";
          throw error;
        }
      } else {
        // 常規考生流程
        await assertCanViewCandidateProblem(context, user, body.candidateId, body.problemId);
        await assertCanRunProblem(context, body.candidateId, body.problemId, body.language);
      }

      // 🎯 這裡直接傳入安全、合法的 finalCandidateId，再也沒有 findUsers 的事了！
      const run = await context.store.createCustomRun({
        candidateId: finalCandidateId, 
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

    } catch (error) {
      request.log.error(error, "🔴 Custom Run 路由發生致命錯誤");
      throw error;
    }
  });
  app.get("/admin/custom-runs/:runId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer", "problem_admin"]);

    const params = runIdParamsSchema.parse(request.params);
    const run = await context.store.getCustomRun(params.runId);

    if (!run) {
      throw new AppError(404, "custom_run_not_found", "Custom run does not exist");
    }

    // 🚀 關鍵修正：如果是管理員在預覽，直接跳過常規考生的權限檢查
    const isProblemAdmin = user.role === "problem_admin";
    if (!isProblemAdmin) {
      // 只有當不是最高管理員時（例如一般面試官），才需要嚴格檢查指派關係
      await assertCanViewCandidateProblem(context, user, run.candidateId, run.problemId);
    }

    return run;
  });
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
