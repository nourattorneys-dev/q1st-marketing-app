"use client";

import { useCallback, useRef, useState } from "react";
import { NETWORK_FAILURE, shouldReuseKey, type ActionResult } from "./result";

/**
 * Runs a server action with an idempotency key: the same key is reused while no answer has arrived
 * (so a retry can't apply a change twice), and a new one is made after any definite answer.
 */
export function useEngineAction<I extends { idempotencyKey: string }, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const keyRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (input: Omit<I, "idempotencyKey">): Promise<ActionResult<T>> => {
      keyRef.current ??= crypto.randomUUID();
      setPending(true);
      try {
        const result = await action({ ...input, idempotencyKey: keyRef.current } as I);
        if (result.ok || !shouldReuseKey(result.error)) keyRef.current = null;
        return result;
      } catch {
        return { ok: false, error: NETWORK_FAILURE }; // the key is kept: a retry is the same request
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending };
}
