import type {AuthUser, ProblemDetail} from "@oct/contracts";

interface HiddenTestCaseRecord {
  id: string;
  input: string;
  expectedOutput: string;
}

interface ProblemRecord extends ProblemDetail {
  hiddenTestCases: HiddenTestCaseRecord[];
  createdBy: string;
}

interface AssignmentRecord {
  id: string;
  candidateId: string;
  problemId: string;
  assignedBy: string;
  assignedAt: string;
}

export function buildSeedData(): {
  users: AuthUser[]; problems : ProblemRecord[];
  assignments : AssignmentRecord[];
} {
  const users: AuthUser[] = [
    {
      id : "candidate_alice",
      name : "Alice Candidate",
      email : "alice.candidate@example.com",
      role : "candidate"
    },
    {
      id : "interviewer_bob",
      name : "Bob Interviewer",
      email : "bob.interviewer@example.com",
      role : "interviewer"
    },
    {
      id : "problem_admin_cindy",
      name : "Cindy Admin",
      email : "cindy.problem_admin@example.com",
      role : "problem_admin"
    }
  ];

  const problems: ProblemRecord[] = [];

  // Assignments reference problems by foreign key, so they must stay empty
  // while there are no seeded problems to avoid a seed-time FK violation.
  const assignments: AssignmentRecord[] = [];

  return {users, problems, assignments};
}
