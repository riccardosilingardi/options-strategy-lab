// ============================================================================
// scripts/measure-sweep.mjs — THE DESIGN-SYSTEM COUNTS PER FILE (PR #48, TASK 5).
//
//   node scripts/measure-sweep.mjs
//
// The same five readings the PR #45 sweep was measured with: distinct font sizes (and how many uses sit under 12px),
// `...mono` against `...sans`/`...sansUI` spreads, distinct padding values, distinct radii, and local copies of the
// atoms `ui.jsx` owns (Btn, Panel, Lbl/Label, Stat, mono, sansUI). Read from source, comments stripped.
// ============================================================================
import { readFileSync } from "node:fs";

const FILES = ["App.jsx", "pro.jsx", "positionCard.jsx", "wizard.jsx", "why.jsx", "steps.jsx", "visuals.jsx",
  "card.jsx", "find.jsx", "ui.jsx", "orders.jsx", "positions.jsx", "navBar.jsx"];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

export function sweepCounts(src) {
  const code = strip(src);
  const sizes = [...code.matchAll(/fontSize:\s*([\d.]+)/g)].map((m) => +m[1]);
  const pads = new Set([...code.matchAll(/padding:\s*("[^"]*"|'[^']*'|[\d.]+)/g)].map((m) => m[1]));
  const radii = new Set([...code.matchAll(/borderRadius:\s*([\d.]+|"[^"]*")/g)].map((m) => m[1]));
  const copies = ["Btn", "Panel", "Lbl", "Label", "Stat"].filter((a) => new RegExp(`(^|\\n)\\s*(export\\s+)?(const|function)\\s+${a}\\b`).test(code));
  if (/(^|\n)\s*const\s+mono\s*=\s*\{/.test(code)) copies.push("mono");
  if (/(^|\n)\s*const\s+sansUI\s*=\s*\{/.test(code)) copies.push("sansUI");
  return {
    sizeLiterals: sizes.length, distinctSizes: new Set(sizes).size, under12: sizes.filter((x) => x < 12).length,
    mono: (code.match(/\.\.\.mono\b/g) || []).length, sans: (code.match(/\.\.\.(sans|sansUI)\b/g) || []).length,
    paddings: pads.size, radii: radii.size, copies,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("\nFILE               fontSize literals (distinct, <12px)   mono / sans   paddings  radii  atom copies");
  for (const f of FILES) {
    let src = "";
    try { src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"); } catch { continue; }
    const c = sweepCounts(src);
    console.log(`${f.padEnd(18)} ${String(c.sizeLiterals).padStart(5)} (${String(c.distinctSizes).padStart(2)}, ${String(c.under12).padStart(4)})` +
      `              ${String(c.mono).padStart(4)} / ${String(c.sans).padEnd(5)} ${String(c.paddings).padStart(6)}  ${String(c.radii).padStart(5)}  ${c.copies.join(", ") || "—"}`);
  }
  console.log("");
}
