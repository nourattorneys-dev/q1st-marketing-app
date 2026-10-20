type EngineErrorInit = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string> | null;
  details?: Record<string, unknown> | null;
};

export class EngineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(init: EngineErrorInit) {
    super(init.message);
    this.name = "EngineError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? undefined;
    this.details = init.details ?? undefined;
  }
}

export function isEngineError(error: unknown): error is EngineError {
  return error instanceof EngineError;
}
