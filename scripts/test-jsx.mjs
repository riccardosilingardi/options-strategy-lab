// Runs the JSX test files through esbuild (already a vite dependency) and
// executes each in its own node process, so `npm test` covers the React shell
// as well as the plain-JS engine.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const FILES = ["src/visuals.test.jsx", "src/wizard.test.jsx"];
const dir = mkdtempSync(join(tmpdir(), "osl-jsx-test-"));
let failed = 0;
try {
  for (const file of FILES) {
    const out = join(dir, file.replace(/[/.]/g, "_") + ".cjs");
    // CJS: react-dom/server reaches for node built-ins through require().
    await build({ entryPoints: [file], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "error" });
    const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
    if (r.status !== 0) failed = 1;
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(failed);
