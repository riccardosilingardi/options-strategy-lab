// ============================================================================
// scripts/shoot-pr4.mjs — PHOTOGRAPHS OF PR 4: THE COPILOT BY PLACE AND THE SIGNALS TAB.
//
//   node scripts/shoot-pr4.mjs [dir]      (default docs/screens/pr4)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a stub copilot, a fixed clock, 390×844: Find's
// "Compare ›" sheet, the market page's Signals tab (the four factor blocks, the news block's headlines and its folded
// question), Build's six questions, a position's four, and the computer at 1024px. Nothing here is a live price.
// ============================================================================
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr4";
mkdirSync(OUT, { recursive: true });
const toUng = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toSignals = async (p) => { await toUng(p); await tap(p, "[data-market] [role=group] button", "Signals", 1500); };
const toScreen = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500);
  await tap(p, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); };

const SHOTS = [
  ["find-compare", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-find-compare]", null, 900); }],
  ["find-compare-answer", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-find-compare]", null, 900);
    await tap(p, "[data-find-copilot] button", "Compare the cards", 2500); }],
  ["market-signals", "dark", toSignals, { full: true }],
  ["market-news", "dark", async (p) => { await toSignals(p); await tap(p, "[data-factor-evidence=news]", null, 600);
    await tap(p, "[data-factor=news] button", "Ask the copilot", 600); }, { full: true }],
  ["market-signals-light", "light", toSignals, { full: true }],
  ["build-copilot", "dark", async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2000);
    await p.evaluate(() => document.querySelector("[data-build-copilot]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["position-copilot", "dark", async (p) => { await toScreen(p);
    await p.evaluate(() => document.querySelector("[data-build-copilot]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["computer-signals-1024", "dark", toSignals, { w: 1024, h: 800 }],
  // PR 4b: Build's variants, a position's roll, and Build during a roll.
  ["build-variants", "dark", async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2000);
    await p.evaluate(() => document.querySelector("[data-build-variants]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["position-roll-turned", "dark", async (p) => { await toScreen(p);
    await p.evaluate(() => document.querySelector("[data-position-roll]")?.scrollIntoView()); await p.waitForTimeout(400); }],
  ["position-roll", "dark", async (p) => { await toScreen(p);
    await p.evaluate(() => document.querySelector("[data-position-roll]")?.scrollIntoView()); await p.waitForTimeout(400); }, { mode: "app+all+book+roll" }],
  ["build-roll", "dark", async (p) => { await toScreen(p); await tap(p, "[data-position-roll] [data-alt-rows] button", null, 2500); }, { mode: "app+all+book+roll" }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all+book", theme, opt.w ? { width: opt.w, height: opt.h, scale: 1 } : { scale: 2 });
    await go(page);
    if (opt.full) {
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: opt.w || 390, height: Math.min(tall, 6000) });
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`${name}.png${errors.length ? `  page errors: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }
} finally { await h.close(); }
