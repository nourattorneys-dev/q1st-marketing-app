import type { EngineResult } from "@/lib/engine/result";
import type { Job } from "@/lib/engine/schemas";

/**
 * What the browser shows while a slow AI job runs (design §8). `message` is a Jobs.* message key (unreachable,
 * signedOut, jobFailed) or the engine's own words.
 */
export type JobPoll = { status: "running" | "done" | "failed"; progress: number; message: string | null; misses: number; result: unknown };

export const JOB_STARTED: JobPoll = { status: "running", progress: 0, message: null, misses: 0, result: null };

/** After this many polls in a row without an answer, say we're still trying (the job carries on at the engine). */
export const MISSES_BEFORE_WARNING = 3;

/**
 * The state after one poll; `answer` is null when our route couldn't be reached.
 * - done or failed ends the job
 * - an unknown job (404) or an ended session (401) ends it with a message, since asking again can't help
 * - anything else is a blip: keep polling, and after a few in a row say so
 */
export function afterPoll(state: JobPoll, answer: EngineResult<Job> | null): JobPoll {
  if (state.status !== "running") return state;
  if (answer === null || (!answer.ok && answer.error.code !== "not_found" && answer.error.code !== "signed_out")) {
    const misses = state.misses + 1;
    return { ...state, misses, message: misses >= MISSES_BEFORE_WARNING ? "unreachable" : state.message };
  }
  if (!answer.ok) return { ...state, status: "failed", message: answer.error.code === "signed_out" ? "signedOut" : answer.error.message };
  const job = answer.data;
  if (job.status === "done") return { status: "done", progress: 1, message: null, misses: 0, result: job.result ?? null };
  if (job.status === "failed") return { ...state, status: "failed", message: typeof job.error === "string" ? job.error : "jobFailed" };
  return { ...state, progress: job.progress ?? state.progress, misses: 0, message: null };
}
