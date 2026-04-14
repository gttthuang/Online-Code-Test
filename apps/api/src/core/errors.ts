import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.flatten()
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Unexpected server error"
      }
    }
  };
}
