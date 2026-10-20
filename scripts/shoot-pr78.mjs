// ============================================================================
// scripts/shoot-pr78.mjs — PHOTOGRAPHS OF PR 78 (from Learn to the real chain, Build and Optimize; owner 20 Oct 2026).
//
//   node scripts/shoot-pr78.mjs [dir]      (default docs/screens/pr78)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book"; "+opt" for Optimize, UNG's board copied onto three
// expiries): Learn's card with its two doors; "Build this" arriving on Build (‹ Learn, "Model … → market …"); "Open in
// chain" (the tray, the legs highlighted, ‹ Back to Learn); a short straddle's defined-risk version, on Learn and on Build;
// Optimize run on a trade from Learn; light; 1280×800. Printed: what each screen says.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr78";
mkdirSync(OUT, { recursive: true });
const learn = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Learn", 2000); await tap(p, "[data-learn-market] button", null, 600); await tap(p, "[data-learn-markets] button", "UNG", 2500); };
const toCard = (p) => p.evaluate(() => { const c = document.querySelector("[data-learn-card]"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 60); });
const condor = async (p) => { await learn(p); await tap(p, '[data-learn-figure="iron-condor"]', null, 800); };
const straddle = async (p) => { await learn(p); await tap(p, '[data-learn-tab="short-call"]', null, 400); await tap(p, '[data-learn-tab="short-put"]', null, 800); };
const say = (p) => p.evaluate(() => ({
  build: document.querySelector("[data-build] h2")?.textContent || null, from: document.querySelector("[data-build-from]")?.textContent || null,
  back: document.querySelector("[data-back-learn]")?.textContent || (document.querySelector("[data-build]") ? document.querySelector("[data-build] button")?.textContent : null),
  tray: [...document.querySelectorAll("[data-tray-leg]")].map((n) => n.textContent).join(" ") || null,
  bridge: document.querySelector("[data-learn-bridge]")?.getAttribute("data-learn-bridge") || null,
  line: document.querySelector("[data-learn-bridge-line]")?.textContent || null,
  optimize: document.querySelector("[data-optimize-summary], [data-opt-summary]")?.textContent || null,
}));
const SHOTS = [
  ["learn-doors", "dark", {}, "app+all+book", async (p) => { await condor(p); await toCard(p); }],
  ["build-from-learn", "dark", {}, "app+all+book", async (p) => { await condor(p); await tap(p, "[data-learn-build]", null, 3000); await p.evaluate(() => window.scrollTo(0, 0)); }],
  ["chain-from-learn", "dark", {}, "app+all+book", async (p) => { await learn(p); await tap(p, '[data-learn-figure="call-fly"]', null, 800); await tap(p, "[data-learn-open-chain]", null, 2500); await p.evaluate(() => window.scrollTo(0, 0)); }],
  ["learn-straddle-defined", "dark", {}, "app+all+book", async (p) => { await straddle(p); await toCard(p); }],
  ["build-defined-version", "dark", {}, "app+all+book", async (p) => { await straddle(p); await tap(p, "[data-learn-build]", null, 3000); await p.evaluate(() => window.scrollTo(0, 0)); }],
  ["build-from-learn-optimize", "dark", {}, "app+all+book+opt", async (p) => {
    await condor(p); await tap(p, "[data-learn-build]", null, 3000);
    await tap(p, "button", "Find the best expiry and legs", 4000);
    await p.evaluate(() => { const s = [...document.querySelectorAll("button")].find((b) => /Find the best expiry and legs|Run again/.test(b.textContent)); if (s) s.scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
  }],
  ["learn-doors-light", "light", {}, "app+all+book", async (p) => { await condor(p); await toCard(p); }],
  ["learn-doors-computer-1280", "dark", { width: 1280, height: 800 }, "app+all+book", async (p) => { await condor(p); }],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const h = await openHarness();
try {
  for (const [name, theme, size, mode, go] of SHOTS.filter(([n]) => !ONLY || ONLY.includes(n))) {
    const { page, ctx, errors } = await h.open(mode, theme, { scale: 2, ...size });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const r = await say(page);
      console.log(`${name} (${theme}) — ${Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).slice(0, 90)}`).join(" · ")}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
