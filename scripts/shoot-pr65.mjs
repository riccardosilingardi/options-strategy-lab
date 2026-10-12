// ============================================================================
// scripts/shoot-pr65.mjs — PHOTOGRAPHS OF PR 65: OPTIMIZE ON BUILD, AND THE ROLL JUDGED ON THE WHOLE TRADE.
//
//   node scripts/shoot-pr65.mjs [dir]      (default docs/screens/pr65)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a fixed clock, 390×844: Build's "Optimize this trade" at
// rest (one button, nothing run), after the tap (the summary, where the trade sits, O1…O5), its "How it searches" ⓘ, a
// row loaded, light; a position's roll on the "+roll" fixture (the run's summary and each row's whole-trade line).
// "+opt" copies UNG's December board onto two more expiries so the search has three: copies, not live prices.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr65";
mkdirSync(OUT, { recursive: true });
const toUng = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toBuild = async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2500); };
const at = async (p, sel) => { await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel); await p.waitForTimeout(400); };
const toOptimize = async (p) => { await toBuild(p); await at(p, "[data-build-optimize]"); };
const ran = async (p) => { await toOptimize(p); await tap(p, "[data-optimize-run]", null, 1500); await at(p, "[data-build-optimize]"); };
const toScreen = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500);
  await tap(p, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); };

const OPT = { mode: "app+all+book+opt" };
const SHOTS = [
  ["build-optimize-rest", "dark", toOptimize, OPT],
  ["build-optimize-ran", "dark", ran, OPT],
  ["build-optimize-how", "dark", async (p) => { await ran(p); await tap(p, "[data-build-optimize] button", "How it searches", 600); }, OPT],
  ["build-optimize-loaded", "dark", async (p) => { await ran(p); await tap(p, "[data-build-optimize] [data-alt-rows] button", "Load", 2500);
    await at(p, "[data-build-optimize]"); }, OPT],
  ["build-optimize-light", "light", ran, OPT],
  ["position-roll-whole-trade", "dark", async (p) => { await toScreen(p); await at(p, "[data-position-roll]"); }, { mode: "app+all+book+roll" }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all+book", theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const txt = await page.evaluate(() => [document.querySelector("[data-build-optimize]"), document.querySelector("[data-position-roll]")]
        .filter(Boolean).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 900)).join(" || "));
      console.log(`${name} (${theme})${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}\n   ${txt}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
