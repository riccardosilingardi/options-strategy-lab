// ============================================================================
// scripts/shoot-positions.mjs — PHOTOGRAPHS OF POSITIONS, A POSITION'S SCREEN AND ORDERS (redesign PR 3, TASK 8), AND
// SINCE PR 3b THE JOURNAL, SETTINGS AND THE COMPUTER'S TWO PANES (1366×900).
//
//   node scripts/shoot-positions.mjs [dir]      (default docs/screens/redesign-pr3)
//
// The whole app on fixtures (scripts/app-harness.mjs, the "+book" fixture of scripts/book-fixture.js: J-0002 a long put
// past its take profit with its close working, J-0003 a call spread past the stop warning, J-0004 an order still
// waiting), at 390×844 and a fixed clock. Nothing here is a live price and nothing is sent.
// ============================================================================
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/redesign-pr3";
mkdirSync(OUT, { recursive: true });
const toPositions = async (page) => { await page.waitForTimeout(1500); await tap(page, "nav button", "Positions", 2500); };
const toScreen = async (page) => { await toPositions(page); await tap(page, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); };
const toOrders = async (page) => { await toPositions(page); await tap(page, "[aria-label='Positions or orders'] button", "Orders", 1500); };

const SHOTS = [
  ["positions", "dark", toPositions],
  ["positions-light", "light", toPositions],
  ["position-screen", "dark", toScreen],
  ["position-screen-full", "dark", toScreen, { full: true }],
  ["position-keep", "dark", async (p) => { await toScreen(p); await tap(p, "[data-position-status] button", "Keep it, write why", 600);
    await p.fill("[data-position-status] textarea", "The USDA report on Friday could turn it"); await p.waitForTimeout(300); }],
  ["position-close", "dark", async (p) => { await toScreen(p); await tap(p, "[data-position-status] button", "Close at limit", 2500); }],
  ["position-alpaca-details", "dark", async (p) => { await toScreen(p); await tap(p, "button", "Alpaca details", 900); }],
  ["position-screen-light", "light", toScreen],
  ["orders", "dark", toOrders],
  ["orders-modify", "dark", async (p) => { await toOrders(p); await tap(p, "[data-order-actions] button", "Modify", 900); }],
  ["orders-cancel", "dark", async (p) => { await toOrders(p); await tap(p, "[data-order-actions] button", "Cancel", 700); }],
  ["orders-details", "dark", async (p) => { await toOrders(p); await tap(p, "[data-order-actions] button", "Details", 700); }],
  ["orders-light", "light", toOrders],
  // Redesign PR 3b.
  ["journal", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); }],
  ["journal-open", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200);
    await tap(p, "[data-journal-open] li:nth-child(2) > button", null, 600); }, { full: true }],
  ["journal-light", "light", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); }],
  ["settings", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-find-header] button[aria-label=Settings]", null, 1200); }, { full: true }],
  ["settings-light", "light", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-find-header] button[aria-label=Settings]", null, 1200); }],
  ["computer-find", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); }, { w: 1366, h: 900 }],
  ["computer-positions", "dark", toScreen, { w: 1366, h: 900 }],
  ["computer-journal", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); }, { w: 1366, h: 900 }],
  ["computer-build", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500);
    await tap(p, "[data-market] button", "Build ›", 2000); }, { w: 1366, h: 900 }],
  ["computer-find-light", "light", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); }, { w: 1366, h: 900 }],
  // PR 4, TASK 0: the two narrower computer windows PR 3b had not looked at.
  ["computer-find-1024", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); }, { w: 1024, h: 800 }],
  ["computer-positions-1024", "dark", toScreen, { w: 1024, h: 800 }],
  ["computer-build-1024", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500);
    await tap(p, "[data-market] button", "Build ›", 2000); }, { w: 1024, h: 800 }],
  ["computer-find-1280", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); }, { w: 1280, h: 800 }],
  ["computer-journal-1280", "dark", async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); }, { w: 1280, h: 800 }],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, opt.w ? { width: opt.w, height: opt.h, scale: 1 } : { scale: 2 });
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
