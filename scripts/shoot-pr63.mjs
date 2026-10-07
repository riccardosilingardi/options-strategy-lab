// ============================================================================
// scripts/shoot-pr63.mjs — PHOTOGRAPHS OF PR 63 (Find's rows and Build's chart, owner 7 Oct 2026).
//
//   node scripts/shoot-pr63.mjs [dir]      (default docs/screens/pr63)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a fixed clock, 390×844: Find's rows with their three
// figures (the sorted one ringed) and "No card has a positive average today." when no fitting card has one; a card's
// Details on the market page; Build's chart at rest (zones with their chances, ±1 sd, the exit, today's price), with the
// crosshair put by a tap and moved by the keys, "How to read" open, and light. Nothing here is a live price.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr63";
mkdirSync(OUT, { recursive: true });
const toUng = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toBuild = async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2500);
  await p.evaluate(() => document.querySelector("[data-unified]")?.scrollIntoView({ block: "center" })); await p.waitForTimeout(500); };
const tapChart = async (p, fy = 0.62) => {
  const b = await (await p.$("[data-unified] svg")).boundingBox();
  await p.mouse.click(b.x + b.width * 0.3, b.y + b.height * fy); await p.waitForTimeout(400);
};

const SHOTS = [
  ["find-rows", "dark", async (p) => { await p.waitForTimeout(2000); }],
  ["market-card-details", "dark", async (p) => { await toUng(p);
    await tap(p, "[data-compact] button", "Details", 800);
    await p.evaluate(() => document.querySelector("[data-card-details]")?.scrollIntoView({ block: "center" })); await p.waitForTimeout(400); }],
  ["build-chart", "dark", async (p) => { await toBuild(p); }],
  ["build-chart-crosshair", "dark", async (p) => { await toBuild(p); await tapChart(p);
    await p.focus("[data-chart-slider]"); for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowDown"); await p.waitForTimeout(300); }],
  ["build-chart-how-to-read", "dark", async (p) => { await toBuild(p); await tap(p, "[data-unified] button", "How to read", 600);
    await p.evaluate(() => document.querySelector("[data-unified] [role=note]")?.scrollIntoView({ block: "center" })); await p.waitForTimeout(300); }],
  ["build-chart-light", "light", async (p) => { await toBuild(p); await tapChart(p, 0.4); }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all+book", theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`${name} (${theme})${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
