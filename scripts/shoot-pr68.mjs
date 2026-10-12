// ============================================================================
// scripts/shoot-pr68.mjs — PHOTOGRAPHS OF PR 68 (P5: the exit rules on past years, the chart at the exit, the chances
// checked; owner 12 Oct 2026).
//
//   node scripts/shoot-pr68.mjs [dir]      (default docs/screens/pr68)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), a fixed clock, 390×844, dark and light: Build's chart "At the
// 21-DTE exit"; "Exit rules, past years" under the backtest panel, at rest (its button) and after the tap — the fixture's
// daily closes cover this year only, which the replay leaves out, so it says there is nothing to replay; NO NUMBER here
// comes from a made-up series. The Journal's "Which chance came true" with the fixture's records, which carry no market
// chance: "0 trades so far — too few to judge".
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr68";
mkdirSync(OUT, { recursive: true });
const toBuild = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); await tap(p, "[data-market] button", "Build ›", 2500); };
const center = async (p, sel) => { await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel); await p.waitForTimeout(400); };
// The section's top a fifth of the way down, clear of the bottom bar.
const top = async (p, sel) => { await p.evaluate((s) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160); }, sel);
  await p.waitForTimeout(400); };
const atExit = async (p) => { await toBuild(p); await tap(p, "[data-unified] button", "At the 21-DTE exit", 700); await center(p, "[data-unified] svg"); };
const replayIdle = async (p) => { await toBuild(p); await tap(p, "[data-build-more] button", "More on this trade", 900); await top(p, "[data-exit-replay]"); };
const replayTapped = async (p) => { await replayIdle(p); await tap(p, "[data-exit-replay-run]", null, 1500); await top(p, "[data-exit-replay]"); };
const journal = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); await center(p, "[data-journal-calibration]"); };

const SHOTS = [
  ["build-chart-at-exit", "dark", atExit],
  ["build-exit-replay-idle", "dark", replayIdle],
  ["build-exit-replay-tapped", "dark", replayTapped],
  ["journal-which-chance", "dark", journal],
  ["build-chart-at-exit-light", "light", atExit],
  ["build-exit-replay-idle-light", "light", replayIdle],
  ["journal-which-chance-light", "light", journal],
];

const h = await openHarness();
try {
  for (const [name, theme, go] of SHOTS) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, { scale: 2 });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const said = await page.evaluate(() => ({
        when: document.querySelector("[data-chart-when]")?.getAttribute("data-chart-when") || null,
        cross: document.querySelector("[data-cross-readout]")?.textContent || null,
        replay: document.querySelector("[data-exit-replay]")?.getAttribute("data-exit-replay") || null,
        replayText: document.querySelector("[data-exit-replay] [role=note], [data-exit-replay] p")?.textContent || null,
        calibration: document.querySelector("[data-journal-calibration]")?.textContent?.slice(0, 120) || null,
        wide: document.documentElement.scrollWidth > window.innerWidth,
      }));
      const bits = [said.when && `chart: ${said.when}`, said.replay && `replay: ${said.replay}${said.replayText ? ` — ${said.replayText}` : ""}`,
        said.calibration && `journal: ${said.calibration}`, said.wide && "SCROLLS SIDEWAYS"].filter(Boolean);
      console.log(`${name} (${theme})${bits.length ? ` — ${bits.join(" · ")}` : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
