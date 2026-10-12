// ============================================================================
// scripts/shoot-pr66.mjs — PHOTOGRAPHS OF PR 66 (Find: four chips and More, owner 12 Oct 2026).
//
//   node scripts/shoot-pr66.mjs [dir]      (default docs/screens/pr66)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all": every market answers with UNG's contracts under its own
// ticker, so the markets differ only by their signals), a fixed clock, 390×844, dark and light: Find at rest with the
// five chips; the View sheet on Up (the target in expected moves, the family it builds and the example price); the Style
// sheet; Cautious chosen, with the line that names the binding filter and its fix; the More sheet; and the market page
// under a chosen view ("View: Up to $…, your choice"). Nothing here is a live price.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr66";
mkdirSync(OUT, { recursive: true });
const ready = async (p) => { await p.waitForTimeout(2000); };
const chip = async (p, text) => { await tap(p, "[data-chip-row] button", text, 900); };
const closeSheet = async (p) => { await tap(p, "[role=dialog] [data-sheet-footer] button", "Show", 700); };
const viewUp = async (p) => { await ready(p); await chip(p, "View"); await tap(p, "[data-view-choices] button", "Up", 700); };
const cautious = async (p) => { await ready(p); await chip(p, "Style"); await tap(p, "[role=dialog] [data-style=cautious]", null, 700); await closeSheet(p); };

const SHOTS = [
  ["find-chips", "dark", ready],
  ["find-view-up", "dark", viewUp],
  ["find-style", "dark", async (p) => { await ready(p); await chip(p, "Style"); }],
  ["find-cautious-binding", "dark", cautious],
  ["find-more", "dark", async (p) => { await ready(p); await chip(p, "More"); }],
  ["find-sort", "dark", async (p) => { await ready(p); await chip(p, "Future avg"); }],
  ["market-view-up", "dark", async (p) => { await viewUp(p); await closeSheet(p); await tap(p, "[data-row-button]", "UNG", 1500); }],
  ["find-chips-light", "light", ready],
  ["find-view-up-light", "light", viewUp],
  ["find-cautious-binding-light", "light", cautious],
  ["find-more-light", "light", async (p) => { await ready(p); await chip(p, "More"); }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all", theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const binding = await page.evaluate(() => document.querySelector("[data-find-binding]")?.textContent || null);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      console.log(`${name} (${theme})${binding ? ` — binding: ${binding}` : ""}${wide ? " — SCROLLS SIDEWAYS" : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
