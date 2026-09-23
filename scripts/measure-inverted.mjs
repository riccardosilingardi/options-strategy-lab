// ============================================================================
// scripts/measure-inverted.mjs — INVERTED PAIRS / NEIGHBOURING PAIRS, PER
// MARKET ON THE FIXTURES, AND HOW MANY CARDS CARRY THE LABEL BEFORE AND AFTER
// PR #41 (TASK 2).
//
//   node scripts/measure-inverted.mjs
//
// FIXTURES, NOT A LIVE CHAIN (see scripts/inverted-fixtures.jsx). App.jsx is
// JSX, so the fixture module is bundled with esbuild and run in node, the way
// scripts/measure-crossing.mjs does it.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { invertedTable } from "./scripts/inverted-fixtures.jsx";
import { RULES, staleBoardLine } from "./src/rules.js";
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n);
const t = invertedTable();
console.log("\\nINVERTED PAIRS PER MARKET — staleBoardShare " + RULES.staleBoardShare + "\\n");
console.log(pad("board", 36) + lpad("inverted/pairs", 16) + lpad("share", 8) + lpad("stale", 7) + lpad("cards", 7) + lpad("before", 8) + lpad("after", 7));
let c = 0, b = 0, a = 0;
for (const r of t) {
  c += r.cards; b += r.before; a += r.after;
  console.log(pad(r.id, 36) + lpad(r.breaks + "/" + r.pairs, 16) + lpad((r.share * 100).toFixed(1) + "%", 8) +
    lpad(r.stale ? "yes" : "no", 7) + lpad(r.cards, 7) + lpad(r.before, 8) + lpad(r.after, 7));
}
console.log(pad("TOTAL", 36) + lpad("", 16) + lpad("", 8) + lpad("", 7) + lpad(c, 7) + lpad(b, 8) + lpad(a, 7));
console.log("\\nabove the list: " + (staleBoardLine(t.filter((r) => r.stale).map((r) => ({ tk: r.tk, expKey: r.ek }))) || "(nothing)") + "\\n");
`;

const dir = mkdtempSync(join(tmpdir(), "osl-inverted-"));
try {
  const out = join(dir, "measure.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node",
    format: "cjs", outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status;
} finally { rmSync(dir, { recursive: true, force: true }); }
