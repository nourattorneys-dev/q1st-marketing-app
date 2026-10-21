import { isEngineError } from "./errors";

export type EngineFailure = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};
export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineFailure };

/** Engine failures become values so a section can show a readable notice (Next hides thrown messages in production). */
export async function tryEngine<T>(fn: () => Promise<T>): Promise<EngineResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isEngineError(error)) {
      return {
        ok: false,
        error: {
          status: error.status,
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }
    throw error;
  }
}
