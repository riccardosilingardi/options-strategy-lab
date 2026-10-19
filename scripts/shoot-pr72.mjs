// ============================================================================
// scripts/shoot-pr72.mjs — PHOTOGRAPHS OF PR 72 (owner 19 Oct 2026): the exit plan per trade, the exposure line, the
// contracts named twice, the feed beside the prices' age, the tray's two chances, the price history's Retry.
//
//   node scripts/shoot-pr72.mjs [dir]      (default docs/screens/pr72)
//
// The whole app on fixtures (scripts/app-harness.mjs), 390×844, a fixed clock. No live price, and no number from a made-up
// series: the replay's suggestion needs real daily closes, which the fixture's (this year only) cannot give, so the Exit
// plan shows the defaults' pill, as it does on the deploy until "Replay the exit rules ›" has run.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap, toBuild } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr72";
mkdirSync(OUT, { recursive: true });
const top = async (p, sel, off = 140) => { await p.evaluate(([s, o]) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o); }, [sel, off]);
  await p.waitForTimeout(400); };
const exitPlan = async (p) => { await toBuild(p); await top(p, "[data-build-exits]"); };
const exitEdited = async (p) => { await toBuild(p); await tap(p, "[data-exit-row=takeProfitPct] button", null, 400);
  await tap(p, "[data-exit-editor=takeProfitPct] button[aria-label^='More']", null, 300); await tap(p, "[data-exit-editor=takeProfitPct] button[aria-label^='More']", null, 300);
  await top(p, "[data-build-exits]"); };
const legs = async (p) => { await toBuild(p); await top(p, "[data-build-legs]"); };
const review = async (p) => { await toBuild(p); await tap(p, "[data-build-send] button", "Send", 900); };
const send = async (p) => { await toBuild(p); await top(p, "[data-build-send]", 360); };
const market = async (p) => { await p.waitForTimeout(1500); await tap(p, "button", "UNG", 1500); await p.evaluate(() => window.scrollTo(0, 0)); };
const tray = async (p) => { await market(p); await tap(p, "[data-market] button", "Chain", 1200);
  await tap(p, "[data-chain] button[data-side=ask], [data-chain-cell=ask], button[aria-label*='Buy']", null, 600).catch(() => {}); };

const SHOTS = [
  ["build-exit-plan", "dark", "app+all+book", exitPlan],
  ["build-exit-plan-edited", "dark", "app+all+book", exitEdited],
  ["build-legs-named-twice", "dark", "app+all+book", legs],
  ["build-review-legs", "dark", "app+all+book", review],
  ["build-exposure-line", "dark", "app+all+book+poor", send],
  ["market-feed-line", "dark", "app+all+book", market],
  ["market-tray-two-chances", "dark", "app+all+book", tray],
  ["build-exit-plan-edited-light", "light", "app+all+book", exitEdited],
  ["build-legs-named-twice-light", "light", "app+all+book", legs],
];
const h = await openHarness();
try {
  for (const [name, theme, mode, go] of SHOTS) {
    const { page, ctx, errors } = await h.open(mode, theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const said = await page.evaluate(() => ({
        tags: Array.from(document.querySelectorAll("[data-exit-tag]")).map((e) => e.textContent).join(","),
        reset: !!Array.from(document.querySelectorAll("[data-build-exits] button")).find((b) => /Reset to suggested/.test(b.textContent)),
        exposure: document.querySelector("[data-exposure-line]")?.textContent || null,
        leg: document.querySelector("[data-leg-name]")?.textContent || null,
        occ: document.querySelector("[data-contract-occ]")?.textContent || null,
        feed: document.querySelector("[data-feed-line]")?.textContent || null,
        wide: document.documentElement.scrollWidth > window.innerWidth,
      }));
      console.log(`${name} (${theme}) — ${JSON.stringify(said)}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
