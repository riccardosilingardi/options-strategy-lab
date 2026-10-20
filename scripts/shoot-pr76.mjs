// ============================================================================
// scripts/shoot-pr76.mjs — PHOTOGRAPHS AND ONE MEASUREMENT OF PR 76 (Learn's chart, the finger, IBKR's names; owner
// 20 Oct 2026).
//
//   node scripts/shoot-pr76.mjs [dir]      (default docs/screens/pr76/after; run on PR 74's code for "before")
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book"; the harness answers every market with UNG's board):
// Learn with an iron condor, an iron butterfly (two legs on one strike), a sold call, light, the crosshair held, a point
// held mid-drag, and 1280×800; Find's rows, the market header, Build's title, a position and the Journal for the
// listing ("UNG · ARCA").
//
// THE FINGER, MEASURED: on a touch screen (hasTouch) a finger presses a leg's blue point and slides 70px right with a
// ±14px vertical wobble (a thumb is never level), through Chromium's own touch input (CDP Input.dispatchTouchEvent), so
// the page's `touch-action` decides as it would on a phone. Printed: the strike before and after, and how far the page
// scrolled. Run on PR 74's code (touch-action: pan-y on the whole picture) and on this PR's.
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr76/after";
mkdirSync(OUT, { recursive: true });
const learn = async (p, tk = "UNG") => {
  await p.waitForTimeout(1500); await tap(p, "nav button", "Learn", 2000);
  await tap(p, "[data-learn-market] button", null, 600);
  await tap(p, "[data-learn-markets] button", tk, 2500);
};
const figure = (id) => async (p) => { await learn(p); await tap(p, `[data-learn-figure="${id}"]`, null, 800); await chartTop(p); };
const chartTop = (p) => p.evaluate(() => { const c = document.querySelector("[data-learn-chart]"); if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - 150)); });
const shortCall = async (p) => { await learn(p); await tap(p, '[data-learn-tab="short-call"]', null, 800); await chartTop(p); };
/** The crosshair: a mouse resting on the chart, away from every point. */
const crosshair = async (p) => {
  await figure("iron-condor")(p);
  const box = await p.evaluate(() => { const r = document.querySelector("[data-figure-chart=lab]").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.18, box.y + box.h * 0.45); await p.waitForTimeout(400);
};
/** A point held mid-drag (a mouse; the finger is measured below). */
const held = async (p) => {
  await figure("iron-condor")(p);
  const pt = await pointAt(p, 3);
  if (!pt) throw new Error("no point");
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.move(pt.x + 24, pt.y + 6, { steps: 6 }); await p.waitForTimeout(300);
};
const pointAt = (p, i) => p.evaluate((n) => {
  const g = document.querySelectorAll("[data-lab-point]")[n];
  const c = g && (g.querySelector("[data-lab-dot]") || g.querySelectorAll("circle")[1] || g.querySelector("circle"));
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, strike: Number(g.getAttribute("aria-valuenow")) };
}, i);
const findRows = async (p) => { await p.waitForFunction(() => document.querySelectorAll("[data-row]").length >= 2, null, { timeout: 20000 }); await p.waitForTimeout(800); };
const marketHead = async (p) => { await findRows(p); await tap(p, "[data-row-button]", "UNG", 1500); await p.evaluate(() => window.scrollTo(0, 0)); };
const buildHead = async (p) => { await marketHead(p); await tap(p, "button", "Build ›", 2000); await p.evaluate(() => window.scrollTo(0, 0)); };
const position = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500); await tap(p, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); await p.evaluate(() => window.scrollTo(0, 0)); };
const journal = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 2000); await tap(p, "[data-journal-entry] button", "J-0002", 800).catch(() => null); };

const SHOTS = [
  ["learn-iron-condor", "dark", {}, figure("iron-condor")],
  ["learn-iron-fly", "dark", {}, figure("iron-fly")],
  ["learn-short-call", "dark", {}, shortCall],
  ["learn-iron-condor-light", "light", {}, figure("iron-condor")],
  ["learn-crosshair", "dark", {}, crosshair],
  ["learn-drag-held", "dark", {}, held],
  ["learn-computer-1280", "dark", { width: 1280, height: 800 }, figure("iron-condor")],
  ["learn-market-sheet", "dark", {}, async (p) => { await learn(p); await tap(p, "[data-learn-market] button", null, 600); }],
  ["find-rows", "dark", {}, findRows],
  ["market-header", "dark", {}, marketHead],
  ["build-title", "dark", {}, buildHead],
  ["position-header", "dark", {}, position],
  ["journal-entry", "dark", {}, journal],
];

/** A finger's slide on a point, with a vertical wobble: Chromium's own touch input on a touch screen. */
async function fingerSlide(page, ctx, i) {
  const pt = await pointAt(page, i);
  if (!pt) return null;
  const cdp = await ctx.newCDPSession(page);
  const y0 = await page.evaluate(() => window.scrollY);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", pt.x, pt.y);
  for (let s = 1; s <= 10; s++) { await touch("touchMove", pt.x + 7 * s, pt.y + (s % 2 ? 14 : -14)); await page.waitForTimeout(30); }
  await touch("touchEnd");
  await page.waitForTimeout(400);
  const after = await pointAt(page, i);
  const y1 = await page.evaluate(() => window.scrollY);
  return { from: pt.strike, to: after ? after.strike : null, scrolled: y1 - y0 };
}

// ONLY=a,b photographs those shots alone (and skips the finger unless "finger" is named).
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const h = await openHarness();
try {
  for (const [name, theme, size, go] of SHOTS.filter(([n]) => !ONLY || ONLY.includes(n))) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, { scale: 2, ...size });
    try {
      await go(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`${name} (${theme})${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
  // THE FINGER: a phone with a touch screen, an iron condor, each point slid in turn.
  if (ONLY && !ONLY.includes("finger")) process.exit(0);
  const { page, ctx } = await h.open("app+all+book", "dark", { touch: true });
  try {
    await figure("iron-condor")(page);
    for (let i = 0; i < 4; i++) {
      const r = await fingerSlide(page, ctx, i);
      console.log(r ? `finger on point ${i + 1}: strike ${r.from} → ${r.to} · page scrolled ${r.scrolled}px` : `finger on point ${i + 1}: no point`);
    }
  } catch (e) { console.log(`finger: ${e.message}`); }
  await ctx.close();
} finally { await h.close(); }
