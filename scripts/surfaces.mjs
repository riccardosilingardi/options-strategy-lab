// scripts/surfaces.mjs — bundles scripts/surfaces.jsx (esbuild, as scripts/test-jsx.mjs does) and returns its counts.
// Used by src/voice.test.js (budgets) and scripts/measure-words.mjs (the table). PR #47, TASK 3.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function measureSurfaces({ html = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "osl-surfaces-"));
  try {
    const out = join(dir, "surfaces.cjs");
    await build({ entryPoints: [join(ROOT, "scripts/surfaces.jsx")], bundle: true, platform: "node", format: "cjs",
      outfile: out, logLevel: "error" });
    const r = spawnSync(process.execPath, [out, "--json", ...(html ? ["--html"] : [])],
      { encoding: "utf8", env: { ...process.env, TZ: "Europe/Rome" } });
    if (r.status !== 0) throw new Error(r.stderr || "surfaces failed");
    return JSON.parse(r.stdout.trim().split("\n").pop());
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
