"use client";

import { useEffect, useRef, useState } from "react";
import type { EngineResult } from "@/lib/engine/result";
import type { Job } from "@/lib/engine/schemas";
import { afterPoll, JOB_STARTED, type JobPoll } from "@/lib/jobs/poll";

async function fetchJob(jobId: string): Promise<EngineResult<Job> | null> {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    return (await response.json()) as EngineResult<Job>;
  } catch {
    return null;
  }
}

/**
 * Polls our /api/jobs/[id] every `pollSeconds` until the job is done or failed; calls onDone once, with the job's result,
 * and onSettled once, either way (so a caller can stop a button from starting the same job twice).
 */
export function useJob(
  jobId: string,
  pollSeconds: number,
  onDone?: (result: unknown) => void,
  onSettled?: (status: "done" | "failed") => void,
): JobPoll {
  const [state, setState] = useState<JobPoll>(JOB_STARTED);
  const done = useRef(onDone);
  const settled = useRef(onSettled);
  useEffect(() => {
    done.current = onDone;
    settled.current = onSettled;
  }, [onDone, onSettled]);

  useEffect(() => {
    let current = JOB_STARTED;
    let active = true;
    async function poll() {
      const answer = await fetchJob(jobId);
      if (!active || current.status !== "running") return;
      current = afterPoll(current, answer);
      setState(current);
      if (current.status === "done") done.current?.(current.result);
      if (current.status !== "running") {
        clearInterval(timer);
        settled.current?.(current.status);
      }
    }
    const timer = setInterval(() => void poll(), pollSeconds * 1000);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, pollSeconds]);

  return state;
}
