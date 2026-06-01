import type { AppContext } from "../../core/app-context.js";
import { AppError } from "../../core/errors.js";

export async function assertCandidateExamCanAccessProblem(
  context: AppContext,
  candidateId: string,
  problemId: string
) {
  if (!(await context.store.isProblemAssigned(candidateId, problemId))) {
    throw new AppError(403, "problem_not_assigned", "Candidate has not been assigned this problem");
  }

  const exam = await context.store.getCandidateExam(candidateId);

  if (exam.status === "not_started") {
    throw new AppError(403, "exam_not_started", "Start the exam before opening problems");
  }

  if (exam.status === "expired") {
    throw new AppError(403, "exam_expired", "The exam time limit has expired");
  }
}
