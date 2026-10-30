import { describe, expect, it } from "vitest";
import { brandCss, textOn } from "@/lib/brand/theme";
import { logoFetcher } from "@/lib/tenancy/logo";

describe("a client's colour (P2)", () => {
  it("picks white or ink text, whichever reads better on it", () => {
    expect(textOn("#2f6bff")).toBe("#ffffff");
    expect(textOn("#0a3d2a")).toBe("#ffffff");
    expect(textOn("#f2c94c")).toBe("#0a0f1c");
  });
  it("sets the action colours for light and dark; anything but #rrggbb writes nothing", () => {
    const css = brandCss("#0A3D2A")!;
    expect(css).toContain(":root{--primary:#0a3d2a;--primary-foreground:#ffffff;");
    expect(css).toContain('[data-theme="dark"]{');
    for (const bad of [null, "red", "#12345", "#123456;}body{display:none", "</style>"]) expect(brandCss(bad)).toBeNull();
  });
});

describe("a client's logo is fetched once, within limits (P2)", () => {
  const limits = { maxBytes: 10, timeoutMs: 1000 };
  const answer = (body: string, type: string, status = 200) => async () => new Response(body, { status, headers: { "content-type": type } });
  it("keeps an allowed image", async () => {
    const logo = await logoFetcher(limits, answer("PNGDATA", "image/png; charset=binary"))("https://x.example/l.png");
    expect(logo).toMatchObject({ contentType: "image/png" });
    expect("data" in logo && logo.data.toString()).toBe("PNGDATA");
  });
  it("refuses plain http, a failure, another kind of file, or one over the size limit", async () => {
    const ok = answer("PNG", "image/png");
    expect(await logoFetcher(limits, ok)("http://x.example/l.png")).toMatchObject({ problem: expect.stringContaining("https://") });
    expect(await logoFetcher(limits, answer("", "image/png", 404))("https://x.example/l.png")).toMatchObject({ problem: expect.stringContaining("404") });
    expect(await logoFetcher(limits, answer("<html>", "text/html"))("https://x.example/l.png")).toMatchObject({ problem: expect.stringContaining("PNG") });
    expect(await logoFetcher(limits, answer("X".repeat(11), "image/png"))("https://x.example/l.png")).toMatchObject({ problem: expect.stringContaining("larger") });
    const down = async () => Promise.reject(new Error("down"));
    expect(await logoFetcher(limits, down)("https://x.example/l.png")).toMatchObject({ problem: expect.stringContaining("didn't answer") });
  });
});
