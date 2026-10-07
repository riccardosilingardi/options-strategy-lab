// ============================================================================
// scripts/shoot-pr61.mjs — PHOTOGRAPHS OF PR 61 (the post-PR-60 sanity check, owner 7 Oct 2026).
//
//   node scripts/shoot-pr61.mjs [dir]      (default docs/screens/pr61)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a fixed clock, 390×844: the star as a toggle with
// Undo, the tick with its word and the line after it, the one Compare sheet (ticked, and the cards that fit with their
// C1…Cn labels), Build's limit away from the card's price, a trade already in the book on Build, and what AT RISK
// includes. Nothing here is a live price.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr61";
mkdirSync(OUT, { recursive: true });
const toUng = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toScreen = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500);
  await tap(p, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); };

const SHOTS = [
  ["find-star-undo", "dark", async (p) => { await p.waitForTimeout(1500);
    await tap(p, "[data-row] button[aria-label^='Save:']", null, 600); await tap(p, "[data-row] button[aria-label^='Remove from Saved:']", null, 600);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300); }],
  ["market-compare-line", "dark", async (p) => { await toUng(p); await tap(p, "[data-compare-tick]", null, 600); }],
  ["compare-sheet-ticked", "dark", async (p) => { await toUng(p); await tap(p, "[data-compare-tick]", "Compare", 400);
    await tap(p, "[data-compare-tick]", "Compare", 400); await tap(p, "[data-compare-line] button", "See them", 900); }, { full: true }],
  ["find-compare-fitting", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-find-compare]", null, 900); }, { full: true }],
  ["build-limit-moved", "dark", async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2000);
    await tap(p, "[data-limit-choices] button", "Mid", 600);
    await p.evaluate(() => document.querySelector("[data-build-order]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["positions-includes", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500); }],
  ["build-already-open", "dark", async (p) => { await toScreen(p); await tap(p, "button", "Analyse as a new trade", 2500);
    await p.evaluate(() => document.querySelector("[data-build-order]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["compare-sheet-ticked-light", "light", async (p) => { await toUng(p); await tap(p, "[data-compare-tick]", "Compare", 400);
    await tap(p, "[data-compare-tick]", "Compare", 400); await tap(p, "[data-compare-line] button", "See them", 900); }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all+book", theme, { scale: 2 });
    try {
      await go(page);
      if (opt.full) {
        const sheet = await page.$("[role=dialog]");
        if (sheet) await sheet.screenshot({ path: `${OUT}/${name}.png` }); else await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      } else await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`${name} (${theme})${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
