export type MockOk<T> = { ok: true; status: number; data: T };
export type MockFail = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};
export type MockOutcome<T> = MockOk<T> | MockFail;
/** A file from a multipart upload, as the mock server hands it to the store. */
export type UploadedFile = { name: string; type: string; size: number; dataUrl: string };

export const ok = <T>(data: T, status = 200): MockOk<T> => ({ ok: true, status, data });

export const fail = (
  status: number,
  code: string,
  message: string,
  extra: { fields?: Record<string, string>; details?: Record<string, unknown> } = {},
): MockFail => ({ ok: false, status, code, message, ...extra });
