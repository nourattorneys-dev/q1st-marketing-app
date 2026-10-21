import { beforeEach, describe, expect, it, vi } from "vitest";

const role = vi.fn();
const engine = { job: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getRole: () => role() }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));

const { GET } = await import("@/app/api/jobs/[id]/route");
const call = (id: string) => GET(new Request(`http://localhost/api/jobs/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id] (design §8)", () => {
  it("answers 401 signed_out when nobody with a role is signed in, without asking the engine", async () => {
    role.mockResolvedValue(null);
    const response = await call("j_1");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "signed_out" } });
    expect(engine.job).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that isn't an engine id", async () => {
    role.mockResolvedValue("reviewer");
    expect((await call("..")).status).toBe(404);
    expect(engine.job).not.toHaveBeenCalled();
  });

  it("returns the engine's job, never cached", async () => {
    role.mockResolvedValue("reviewer");
    engine.job.mockResolvedValue({ id: "j_1", status: "running", progress: 0.5 });
    const response = await call("j_1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { id: "j_1", status: "running", progress: 0.5 } });
  });
});
