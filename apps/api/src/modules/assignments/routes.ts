import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../../core/app-context.js";
import { requireRole, requireUser } from "../../core/auth.js";
import { AppError } from "../../core/errors.js";

const createAssignmentSchema = z.object({
  candidateId: z.string().min(1),
  problemId: z.string().min(1).optional(),
  problemIds: z.array(z.string().min(1)).optional(),
  durationMinutes: z.number().int().min(1).max(480).default(60)
}).superRefine((value, ctx) => {
  if (!value.problemId && (!value.problemIds || value.problemIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one problem",
      path: ["problemIds"]
    });
  }
});

export async function registerAssignmentRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/me/exam", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    return hideLockedAssignments(await context.store.getCandidateExam(user.id));
  });

  app.post("/me/exam/start", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    return {
      exam: hideLockedAssignments(await context.store.startCandidateExam(user.id))
    };
  });

  app.get("/me/assignments", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["candidate"]);

    const exam = await context.store.getCandidateExam(user.id);
    return exam.status === "started" ? exam.assignments : [];
  });

  app.post("/admin/assignments", async (request) => {
    const user = await requireUser(request, context);
    requireRole(user, ["interviewer"]);

    const body = createAssignmentSchema.parse(request.body);
    const candidate = await context.store.getUserById(body.candidateId);
    const problemIds = [...new Set([...(body.problemIds ?? []), ...(body.problemId ? [body.problemId] : [])])];

    if (!candidate || candidate.role !== "candidate") {
      throw new AppError(404, "candidate_not_found", "Candidate does not exist");
    }

    if (problemIds.length !== (body.problemIds?.length ?? 0) + (body.problemId ? 1 : 0)) {
      throw new AppError(400, "duplicate_problem_ids", "Each selected problem must be unique");
    }

    const exam = await context.store.getCandidateExam(body.candidateId);

    if (exam.status !== "not_started") {
      throw new AppError(409, "exam_already_started", "Assignments cannot be changed after the candidate starts the exam");
    }

    for (const problemId of problemIds) {
      const problem = await context.store.getProblem(problemId);

      if (!problem) {
        throw new AppError(404, "problem_not_found", "Problem does not exist");
      }

      if (problem.archivedAt) {
        throw new AppError(400, "problem_archived", "Archived problems cannot be assigned");
      }

      if (await context.store.hasAssignment(body.candidateId, problemId)) {
        throw new AppError(409, "assignment_exists", "One or more selected problems are already assigned to the candidate");
      }
    }

    const assignments = await context.store.createAssignments(
      body.candidateId,
      problemIds,
      user.id,
      body.durationMinutes
    );

    return {
      assignment: assignments[0],
      assignments
    };
  });
}

function hideLockedAssignments<T extends { status: string; assignments: unknown[] }>(exam: T): T {
  if (exam.status === "started") {
    return exam;
  }

  return {
    ...exam,
    assignments: []
  };
}
