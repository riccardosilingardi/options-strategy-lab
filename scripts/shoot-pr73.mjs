// ============================================================================
// scripts/shoot-pr73.mjs — PHOTOGRAPHS OF PR 73 (the app on a computer, responsive; owner 19 Oct 2026).
//
//   node scripts/shoot-pr73.mjs [dir]      (default docs/screens/pr73/after)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book"), dark, at 1280×800 (the owner's test size), 1100×800,
// 1024×768 and 1440×900, and the phone at 390×844 (unchanged): Find with a market open beside it (Strategies), its Chain tab
// and the tray, a chip sheet's chips wrapping, Build, Positions as a table with a position's screen beside it. Each line
// says whether the page scrolls sideways (it must not).
// ============================================================================
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr73/after";
mkdirSync(OUT, { recursive: true });
const toFind = async (p) => { await p.waitForTimeout(1500); };
const toMarket = async (p) => { await toFind(p); await tap(p, "[data-row-button]", "UNG", 1500); };
const toChain = async (p) => { await toMarket(p); await tap(p, "[data-market] button", "Chain", 1200);
  await tap(p, "[data-market] button", "Delta · IV", 300).catch(() => {}); await tap(p, "[data-market] button", "Bid · Ask", 300).catch(() => {}); };
const toBuild = async (p) => { await toMarket(p); await tap(p, "[data-market] button", "Build ›", 2200); };
const toPositions = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500); };
const toPosition = async (p) => { await toPositions(p); await tap(p, "[data-position-open]", null, 1500); };

const SIZES = [["1280", 1280, 800], ["1100", 1100, 800], ["1024", 1024, 768], ["1440", 1440, 900]];
const SHOTS = [];
for (const [tag, w, h] of SIZES) {
  SHOTS.push([`find-${tag}`, toMarket, w, h], [`chain-${tag}`, toChain, w, h], [`build-${tag}`, toBuild, w, h],
    [`positions-${tag}`, toPositions, w, h], [`position-${tag}`, toPosition, w, h]);
}
SHOTS.push(["phone-find", toFind, 390, 844], ["phone-build", toBuild, 390, 844], ["phone-positions", toPositions, 390, 844]);

const h = await openHarness();
try {
  for (const [name, go, w, ht] of SHOTS) {
    const { page, ctx, errors } = await h.open("app+all+book", "dark", { width: w, height: ht, scale: 1 });
    try {
      await go(page);
      await page.screenshot({ path: join(OUT, `${name}.png`) });
      const m = await page.evaluate(() => ({
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
        cols: document.querySelector("[data-build-cols]")?.getAttribute("data-build-cols") || null,
        table: !!document.querySelector("[data-positions-table]"),
        wideEl: (() => { const out = []; for (const el of document.querySelectorAll("body *")) { if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).overflowX !== "hidden") out.push(el.tagName + (el.getAttribute("data-chain") != null ? "[data-chain]" : "")); } return out.slice(0, 4); })(),
      }));
      console.log(`${name} ${w}×${ht} — sideways ${m.sideways ? "YES" : "no"}${m.cols ? ` · build cols ${m.cols}` : ""}${m.table ? " · table" : ""}${m.wideEl.length ? ` · inner scroll: ${m.wideEl.join(",")}` : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
