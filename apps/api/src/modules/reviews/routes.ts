import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { reviewRecommendations } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const candidateIdParamsSchema = z.object({
  candidateId: z.string().min(1)
});

const reviewParamsSchema = z.object({
  candidateId: z.string().min(1),
  problemId: z.string().min(1)
});

const rubricScoreSchema = z.number().int().min(1).max(5);

const upsertReviewSchema = z.object({
  notes: z.string().max(20_000),
  rubric: z.object({
    problemSolving: rubricScoreSchema,
    codeQuality: rubricScoreSchema,
    communication: rubricScoreSchema,
    testingDebugging: rubricScoreSchema
  }),
  recommendation: z.enum(reviewRecommendations)
});

export async function registerReviewRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/admin/candidates/:candidateId/reviews", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = candidateIdParamsSchema.parse(request.params);
    const contextResponse = await context.store.getCandidateReviewContext(params.candidateId, user.id);

    if (!contextResponse) {
      throw new AppError(404, "candidate_not_found", "Candidate does not exist");
    }

    return contextResponse;
  });

  app.put("/admin/candidates/:candidateId/reviews/:problemId", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = reviewParamsSchema.parse(request.params);
    const body = upsertReviewSchema.parse(request.body);
    await assertReviewTargetExists(context, params.candidateId, params.problemId);

    if (!(await context.store.hasAssignment(params.candidateId, params.problemId))) {
      throw new AppError(400, "review_problem_not_assigned", "Candidate has not been assigned this problem");
    }

    const review = await context.store.upsertInterviewReview({
      candidateId: params.candidateId,
      problemId: params.problemId,
      interviewerId: user.id,
      notes: body.notes,
      problemSolving: body.rubric.problemSolving,
      codeQuality: body.rubric.codeQuality,
      communication: body.rubric.communication,
      testingDebugging: body.rubric.testingDebugging,
      recommendation: body.recommendation
    });

    if (!review) {
      throw new AppError(500, "review_save_failed", "Failed to save review");
    }

    return {
      review
    };
  });

  app.delete("/admin/candidates/:candidateId/reviews/:problemId", async (request, reply) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const params = reviewParamsSchema.parse(request.params);
    await assertReviewTargetExists(context, params.candidateId, params.problemId);

    const deleted = await context.store.deleteInterviewReview(params.candidateId, params.problemId, user.id);

    if (!deleted) {
      throw new AppError(404, "review_not_found", "Review does not exist");
    }

    return reply.status(204).send();
  });
}

async function assertReviewTargetExists(context: AppContext, candidateId: string, problemId: string) {
  const [candidate, problem] = await Promise.all([
    context.store.getUserById(candidateId),
    context.store.getProblem(problemId)
  ]);

  if (!candidate || candidate.role !== "candidate") {
    throw new AppError(404, "candidate_not_found", "Candidate does not exist");
  }

  if (!problem) {
    throw new AppError(404, "problem_not_found", "Problem does not exist");
  }
}
