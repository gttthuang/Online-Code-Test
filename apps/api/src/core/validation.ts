export const problemValidation = {
  title: {
    min: 1,
    max: 120
  },
  description: {
    min: 1,
    max: 20_000
  },
  timeLimitMs: {
    min: 1,
    max: 10_000
  },
  memoryLimitKb: {
    min: 1,
    max: 1024 * 1024
  },
  sampleTextMaxChars: 8_000,
  hiddenTestCaseCount: {
    min: 1,
    max: 50
  },
  testCaseTextMaxChars: 16_000
} as const;

export const submissionValidation = {
  sourceCodeMax: 100_000
} as const;
