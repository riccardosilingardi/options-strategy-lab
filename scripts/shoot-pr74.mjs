// ============================================================================
// scripts/shoot-pr74.mjs — PHOTOGRAPHS OF PR 74 (Learn, the figure lab; owner 20 Oct 2026).
//
//   node scripts/shoot-pr74.mjs [dir]      (default docs/screens/pr74)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book"): the bottom bar's fifth place, Learn, on the market
// the fixture serves (UNG, picked from the Market sheet: the harness answers every market with UNG's board) — empty, with an iron condor from the gallery, with a
// sold call alone (the line that says the app never sends it), in light, and on a computer (1280×800, two columns).
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr74";
mkdirSync(OUT, { recursive: true });
const learn = async (p, tk = "UNG") => {
  await p.waitForTimeout(1500); await tap(p, "nav button", "Learn", 2000);
  await tap(p, "[data-learn-market] button", null, 600);
  await tap(p, "[data-learn-markets] button", tk, 2500);
};
const figure = (id) => async (p) => { await learn(p); await tap(p, `[data-learn-figure="${id}"]`, null, 800); await p.evaluate(() => window.scrollTo(0, 0)); };
const shortCall = async (p) => { await learn(p); await tap(p, '[data-learn-tab="short-call"]', null, 800); };
const SHOTS = [
  ["learn-empty", "dark", {}, learn],
  ["learn-iron-condor", "dark", {}, figure("iron-condor")],
  ["learn-short-call", "dark", {}, shortCall],
  ["learn-iron-condor-light", "light", {}, figure("iron-condor")],
  ["learn-computer-1280", "dark", { width: 1280, height: 800 }, figure("iron-condor")],
];
const h = await openHarness();
try {
  for (const [name, theme, size, go] of SHOTS) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, { scale: 2, ...size });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const r = await page.evaluate(() => ({ where: document.querySelector("[data-learn-where]")?.textContent || null,
        card: document.querySelector("[data-learn-card]")?.getAttribute("data-learn-card") || null,
        risk: document.querySelector("[data-learn-risk]")?.textContent || null }));
      console.log(`${name} (${theme}) — ${r.where} · ${r.card || "no card"}${r.risk ? ` · ${r.risk}` : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
