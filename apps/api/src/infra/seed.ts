import type { AuthUser, ProblemDetail, SupportedLanguage } from "@oct/contracts";

const defaultLanguages: SupportedLanguage[] = ["python", "cpp"];

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
  users: AuthUser[];
  problems: ProblemRecord[];
  assignments: AssignmentRecord[];
} {
  const users: AuthUser[] = [
    {
      id: "candidate_alice",
      name: "Alice Candidate",
      email: "alice.candidate@example.com",
      role: "candidate"
    },
    {
      id: "interviewer_bob",
      name: "Bob Interviewer",
      email: "bob.interviewer@example.com",
      role: "interviewer"
    },
    {
      id: "problem_admin_cindy",
      name: "Cindy Problem Admin",
      email: "cindy.problem_admin@example.com",
      role: "problem_admin"
    }
  ];

  const problems: ProblemRecord[] = [
    {
      id: "problem_two_sum",
      title: "Two Sum",
      description: "Given an array of integers and a target value, return the indices of the two numbers that add up to the target.",
      difficulty: "easy",
      timeLimitMs: 1000,
      memoryLimitKb: 65536,
      supportedLanguages: defaultLanguages,
      sampleInput: "nums = [2, 7, 11, 15], target = 9",
      sampleOutput: "[0, 1]",
      hiddenTestCases: [
        {
          id: "case_two_sum_hidden_1",
          input: "nums = [3, 2, 4], target = 6",
          expectedOutput: "[1, 2]"
        }
      ],
      createdBy: "problem_admin_cindy"
    },
    {
      id: "problem_reverse_string",
      title: "Reverse String",
      description: "Read a string and return the reversed result.",
      difficulty: "easy",
      timeLimitMs: 1000,
      memoryLimitKb: 65536,
      supportedLanguages: defaultLanguages,
      sampleInput: "\"cloud\"",
      sampleOutput: "\"duolc\"",
      hiddenTestCases: [
        {
          id: "case_reverse_hidden_1",
          input: "\"native\"",
          expectedOutput: "\"evitan\""
        }
      ],
      createdBy: "problem_admin_cindy"
    }
  ];

  const assignments: AssignmentRecord[] = [
    {
      id: "assignment_alice_two_sum",
      candidateId: "candidate_alice",
      problemId: "problem_two_sum",
      assignedBy: "interviewer_bob",
      assignedAt: "2026-04-14T00:00:00.000Z"
    },
    {
      id: "assignment_alice_reverse_string",
      candidateId: "candidate_alice",
      problemId: "problem_reverse_string",
      assignedBy: "interviewer_bob",
      assignedAt: "2026-04-14T00:05:00.000Z"
    }
  ];

  return { users, problems, assignments };
}
