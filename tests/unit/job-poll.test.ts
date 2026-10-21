import { describe, expect, it } from "vitest";
import { afterPoll, JOB_STARTED, MISSES_BEFORE_WARNING } from "@/lib/jobs/poll";

const job = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true as const, data: { id: "j_1", status, ...extra } });
const failure = (code: string, message = "x") => ({ ok: false as const, error: { status: 404, code, message } });

describe("following a slow AI job (design §8; Review Focus 2)", () => {
  it("shows progress, then done with the job's result", () => {
    const running = afterPoll(JOB_STARTED, job("running", { progress: 0.4 }));
    expect(running).toMatchObject({ status: "running", progress: 0.4 });
    expect(afterPoll(running, job("done", { progress: 1, result: { postIds: ["p_1"] } }))).toMatchObject({ status: "done", result: { postIds: ["p_1"] } });
  });

  it("stops on a failed job with the engine's words", () => {
    expect(afterPoll(JOB_STARTED, job("failed", { error: "The model timed out." }))).toMatchObject({ status: "failed", message: "The model timed out." });
    expect(afterPoll(JOB_STARTED, job("failed"))).toMatchObject({ status: "failed", message: "jobFailed" });
  });

  it("stops when the job is gone or the session has ended, since asking again can't help", () => {
    expect(afterPoll(JOB_STARTED, failure("not_found", "No such job."))).toMatchObject({ status: "failed", message: "No such job." });
    expect(afterPoll(JOB_STARTED, failure("signed_out"))).toMatchObject({ status: "failed", message: "signedOut" });
  });

  it("keeps going through network blips and says so only after a few in a row", () => {
    let state = JOB_STARTED;
    for (let miss = 1; miss < MISSES_BEFORE_WARNING; miss++) state = afterPoll(state, null);
    expect(state).toMatchObject({ status: "running", message: null });
    state = afterPoll(state, failure("engine_unavailable"));
    expect(state).toMatchObject({ status: "running", message: "unreachable" });
    expect(afterPoll(state, job("running", { progress: 0.5 }))).toMatchObject({ status: "running", message: null, misses: 0 });
  });
});
