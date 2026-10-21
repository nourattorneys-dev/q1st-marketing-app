/**
 * Spec v1.1 §2: a fresh Idempotency-Key per user action; the same key again only when no answer arrived for the very
 * same request. A changed note or another file is a new request, so it gets a new key (reusing it would be refused
 * as idempotency_mismatch).
 */
export type KeyMemory = { key: string; fingerprint: string } | null;

export function keyForAttempt(memory: KeyMemory, fingerprint: string, mint: () => string): { key: string; memory: KeyMemory } {
  if (memory && memory.fingerprint === fingerprint) return { key: memory.key, memory };
  const key = mint();
  return { key, memory: { key, fingerprint } };
}

/** After an attempt: keep the key only if no answer arrived (the request may have gone through). */
export function afterAttempt(memory: KeyMemory, answered: boolean): KeyMemory {
  return answered ? null : memory;
}

/** A stable description of an action's input, to tell a retry of the same request from a new one. */
export function fingerprintOf(input: unknown): string {
  return JSON.stringify(input, (_key, value: unknown) =>
    value instanceof File ? `file:${value.name}:${value.type}:${value.size}:${value.lastModified}` : value,
  );
}
