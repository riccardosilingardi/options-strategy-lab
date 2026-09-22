// ============================================================================
// scripts/measure-words.mjs — HOW MANY WORDS EACH STEP ACTUALLY RENDERS.
//
// P9 TASK 3 asked for a measurement rather than an impression, so this reads
// the SOURCE — the three step blocks in App.jsx are delimited by
// `step === "radar" | "shortlist" | "build"` — and counts two things inside
// each one:
//
//   1. LITERAL JSX TEXT, the prose typed straight into the tree.
//   2. EVERY CALL TO A COPY GENERATOR, scored as the word count of what that
//      function returns on a fixture. A function called at two sites is
//      counted twice, because that is what the reader scrolls past.
//
// >>> WHAT IT DOES NOT CLAIM. <<< Generated sentences are scored at their
// CURRENT wording whichever App.jsx is being read, so a before/after delta
// measures SITES REMOVED OR FOLDED, not rewording. A generator this file has
// no fixture for is counted as zero and NAMED in `uncounted`, so the coverage
// of the measurement is on the measurement rather than assumed.
//
//   node scripts/measure-words.mjs [path-to-App.jsx]
// ============================================================================
import { readFileSync } from "node:fs";
import { measureScreens, SCREEN_IDS } from "../src/wordcount.mjs";

const path = process.argv[2] || new URL("../src/App.jsx", import.meta.url).pathname;
const src = readFileSync(path, "utf8");
const r = measureScreens(src);
console.log(`\n${path}\n`);
console.log("  SCREEN      LITERAL  GENERATED   TOTAL   SITES");
for (const id of SCREEN_IDS) {
  const s = r[id];
  console.log(`  ${id.padEnd(11)}${String(s.literal).padStart(7)}${String(s.generated).padStart(11)}${String(s.total).padStart(8)}${String(s.sites).padStart(8)}`);
}
console.log(`  ${"TOTAL".padEnd(11)}${String(r.total.literal).padStart(7)}${String(r.total.generated).padStart(11)}${String(r.total.total).padStart(8)}${String(r.total.sites).padStart(8)}`);
if (r.uncounted.length) console.log(`\n  uncounted generators (scored 0): ${r.uncounted.join(", ")}`);
console.log("");
