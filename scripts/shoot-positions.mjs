// ============================================================================
// scripts/shoot-positions.mjs — PHOTOGRAPHS OF POSITIONS, A POSITION'S SCREEN AND ORDERS (redesign PR 3, TASK 8).
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
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, { scale: 2 });
    await go(page);
    if (opt.full) {
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 390, height: Math.min(tall, 6000) });
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`${name}.png${errors.length ? `  page errors: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }
} finally { await h.close(); }
