import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// The script in a repo of its own, with a stand-in pnpm: a build that gets past the settings checks reaches it.
function runBuild(settings: string) {
  const dir = mkdtempSync(join(tmpdir(), "cpanel-build-"));
  made.push(dir);
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  copyFileSync("scripts/cpanel-build.sh", join(repo, "scripts/cpanel-build.sh"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo, stdio: "ignore" });
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "--no-verify", "-m", "script");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "pnpm"), "#!/bin/sh\necho 'pnpm reached' >&2\nexit 3\n");
  chmodSync(join(bin, "pnpm"), 0o755);
  writeFileSync(join(dir, "settings.env"), settings);
  return spawnSync("bash", ["scripts/cpanel-build.sh"], {
    cwd: repo,
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, HOME: dir, CPANEL_SETTINGS: join(dir, "settings.env") },
  });
}
const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("scripts/cpanel-build.sh settings checks", () => {
  it("builds the live dashboard with AUTH_MODE=password", () => {
    const run = runBuild("AUTH_MODE=password\n");
    expect(run.stderr).toContain("pnpm reached");
  });

  it("refuses a live build with ALLOW_TEST_LOGINS=1, which would show reset links on a test page (final review)", () => {
    const run = runBuild("AUTH_MODE=password\nALLOW_TEST_LOGINS=1\n");
    expect(run.status).toBe(1);
    expect(run.stderr).not.toContain("pnpm reached");
    expect(run.stderr).toContain("ALLOW_TEST_LOGINS");
  });
});
