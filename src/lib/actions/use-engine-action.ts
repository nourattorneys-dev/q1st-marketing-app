"use client";

import { useCallback, useRef, useState } from "react";
import { afterAttempt, fingerprintOf, keyForAttempt, type KeyMemory } from "./idempotency";
import { NETWORK_FAILURE, shouldReuseKey, type ActionResult } from "./result";

/** One key memory and a pending flag, shared by the two hooks below. */
function useKeyedAttempt() {
  const memory = useRef<KeyMemory>(null);
  const [pending, setPending] = useState(false);

  const attempt = useCallback(async <T>(fingerprint: string, send: (key: string) => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    const next = keyForAttempt(memory.current, fingerprint, () => crypto.randomUUID());
    memory.current = next.memory;
    setPending(true);
    try {
      const result = await send(next.key);
      memory.current = afterAttempt(memory.current, result.ok || !shouldReuseKey(result.error));
      return result;
    } catch {
      return { ok: false, error: NETWORK_FAILURE }; // no answer: retrying the same request reuses the key
    } finally {
      setPending(false);
    }
  }, []);

  return { attempt, pending };
}

/**
 * Runs a server action with an idempotency key: the same key is reused only for the same request after no answer
 * (so a retry can't apply a change twice), and a new one is made after any answer or for a changed request.
 */
export function useEngineAction<I extends { idempotencyKey: string }, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const { attempt, pending } = useKeyedAttempt();
  const run = useCallback(
    (input: Omit<I, "idempotencyKey">) => attempt<T>(fingerprintOf(input), (idempotencyKey) => action({ ...input, idempotencyKey } as I)),
    [action, attempt],
  );
  return { run, pending };
}

/** The same for a multipart upload: the server action takes FormData, which carries the fields, the file and the key. */
export function useEngineUpload<T>(action: (form: FormData) => Promise<ActionResult<T>>) {
  const { attempt, pending } = useKeyedAttempt();
  const run = useCallback(
    (fields: Record<string, string>, file: File) =>
      attempt<T>(fingerprintOf({ fields, file }), (idempotencyKey) => {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, value);
        form.set("file", file);
        form.set("idempotencyKey", idempotencyKey);
        return action(form);
      }),
    [action, attempt],
  );
  return { run, pending };
}
