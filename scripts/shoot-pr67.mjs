// ============================================================================
// scripts/shoot-pr67.mjs — PHOTOGRAPHS OF PR 67 (Build like IBKR's Option Wizard, owner 12 Oct 2026).
//
//   node scripts/shoot-pr67.mjs [dir]      (default docs/screens/pr67)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a fixed clock, 390×844, dark and light: Find's rows with
// "· mkt N%"; the market page's compact card with its two chances, and its Details (the costs row and IBKR's placeholder);
// a card's line saying why they differ (amber when the market's is lower); Build's numbers (Market · OSL model); the chart's Greek tabs (Delta) and the scenario table
// (Today, then At expiry at ±10%); the Order's costs line with the IBKR placeholder. Nothing here is a live price.
// For each shot the script prints what the screen says about the two chances, so the photographs can be read back.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr67";
mkdirSync(OUT, { recursive: true });
const toUng = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toBuild = async (p) => { await toUng(p); await tap(p, "[data-market] button", "Build ›", 2500); };
const center = async (p, sel) => { await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel); await p.waitForTimeout(400); };
const numbers = async (p) => { await toBuild(p); await center(p, "[data-chance-two]"); };
const greek = async (p) => { await toBuild(p); await tap(p, "[data-unified] button", "Delta", 600); await center(p, "[data-greek-chart]"); };
const table = async (p) => { await toBuild(p); await center(p, "[data-scenario]"); };
const tableExpiry = async (p) => { await toBuild(p); await tap(p, "[data-scenario] button", "At expiry", 400);
  await tap(p, "[data-scenario] button", "10%", 400); await center(p, "[data-scenario]"); };
const costs = async (p) => { await toBuild(p); await center(p, "[data-costs]"); };

const SHOTS = [
  ["find-rows-mkt", "dark", async (p) => { await p.waitForTimeout(2000); }],
  ["market-card-two-chances", "dark", async (p) => { await toUng(p); await center(p, "[data-compact]"); }],
  ["market-card-gap-line", "dark", async (p) => { await toUng(p); await center(p, "[data-chance-gap]"); }],
  ["market-card-gap-line-light", "light", async (p) => { await toUng(p); await center(p, "[data-chance-gap]"); }],
  ["market-card-details-costs", "dark", async (p) => { await toUng(p); await tap(p, "[data-compact] button", "Details", 800);
    await center(p, "[data-placeholder='costs-ibkr']"); }],
  ["build-numbers-two-chances", "dark", numbers],
  ["build-greek-delta", "dark", greek],
  ["build-scenario-today", "dark", table],
  ["build-scenario-expiry-10", "dark", tableExpiry],
  ["build-order-costs", "dark", costs],
  ["find-rows-mkt-light", "light", async (p) => { await p.waitForTimeout(2000); }],
  ["build-numbers-two-chances-light", "light", numbers],
  ["build-greek-delta-light", "light", greek],
  ["build-scenario-today-light", "light", table],
];

const h = await openHarness();
try {
  for (const [name, theme, go, opt = {}] of SHOTS) {
    const { page, ctx, errors } = await h.open(opt.mode || "app+all+book", theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const said = await page.evaluate(() => ({
        lines: [...document.querySelectorAll("[data-chance-line]")].slice(0, 2).map((e) => e.textContent.replace(/\s+/g, " ").trim()),
        gap: document.querySelector("[data-chance-gap]")?.textContent || null,
        gapKind: document.querySelector("[data-chance-gap]")?.getAttribute("data-chance-gap") || null,
        notRead: document.querySelector("[data-chance-two] [role=note], [data-chance-two] p")?.textContent || null,
        row: document.querySelector("[data-row-fig-extra]")?.textContent || null,
        costs: document.querySelector("[data-costs]")?.textContent || null,
        greek: document.querySelector("[data-greek-now]")?.textContent || null,
        wide: document.documentElement.scrollWidth > window.innerWidth,
      }));
      const bits = [said.lines.length ? `chance: ${said.lines.join(" | ")}` : null, said.gap && `gap (${said.gapKind}): ${said.gap}`, said.row && `row:${said.row}`,
        said.costs && `costs: ${said.costs}`, said.greek && `greek: ${said.greek}`, said.wide && "SCROLLS SIDEWAYS"].filter(Boolean);
      console.log(`${name} (${theme})${bits.length ? ` — ${bits.join(" · ")}` : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
