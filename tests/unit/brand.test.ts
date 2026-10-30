import { describe, expect, it } from "vitest";
import { brandCss, textOn } from "@/lib/brand/theme";
import sharp from "sharp";
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
    for (const bad of [null, "red", "#12345", "#123456;}body{display:none", "</style>"]) expect(brandCss(bad, bad)).toBeNull();
  });
  it("a dark-mode colour of its own is used in dark mode; without one, dark mode follows the light colour", () => {
    expect(brandCss("#0a3d2a", "#7fd3a5")).toContain('[data-theme="dark"]{--primary:#7fd3a5;--primary-foreground:#0a0f1c;');
    expect(brandCss("#0a3d2a")).toContain('[data-theme="dark"]{--primary:#0a3d2a;--primary-foreground:#ffffff;');
    const darkOnly = brandCss(null, "#7fd3a5")!;
    expect(darkOnly.startsWith('[data-theme="dark"]')).toBe(true);
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

  it("cuts a logo's empty edges, so it fills its slot; an SVG keeps its own frame", async () => {
    const mark = await sharp({ create: { width: 10, height: 4, channels: 4, background: "#000000" } }).png().toBuffer();
    const padded = await sharp({ create: { width: 60, height: 40, channels: 4, background: "#ffffff" } })
      .composite([{ input: mark, left: 25, top: 18 }])
      .png()
      .toBuffer();
    const fetchImpl = async () => new Response(new Uint8Array(padded), { headers: { "content-type": "image/png" } });
    const logo = await logoFetcher({ maxBytes: 100_000, timeoutMs: 1000 }, fetchImpl)("https://x.example/l.png");
    expect("data" in logo).toBe(true);
    const meta = await sharp((logo as { data: Buffer }).data).metadata();
    expect([meta.width, meta.height]).toEqual([10, 4]);
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='60' height='40'/>";
    const kept = await logoFetcher({ maxBytes: 100_000, timeoutMs: 1000 }, async () => new Response(svg, { headers: { "content-type": "image/svg+xml" } }))("https://x.example/l.svg");
    expect("data" in kept && kept.data.toString()).toBe(svg);
  });
});
