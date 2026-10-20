// ============================================================================
// scripts/shoot-pr77.mjs — PHOTOGRAPHS OF PR 77 (a figure drawn with a finger; owner 20 Oct 2026), AND A MEASUREMENT.
//
//   node scripts/shoot-pr77.mjs [dir]      (default docs/screens/pr77)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book", UNG's board), on a touch screen: Learn → Draw, then a
// finger draws through Chromium's own touch input (CDP Input.dispatchTouchEvent), so the page's own touch handling decides
// as on a phone. Shots: Draw at rest; a short strangle drawn (the iron condor first); a bull put spread drawn; a scribble
// (no known figure); a match tapped (loaded on the lab, back on Points); light; 1280×800. Printed for each drawing: what
// the cards say and how far the page scrolled while the finger drew (it must be 0).
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr77";
mkdirSync(OUT, { recursive: true });

/** Learn on UNG, Draw on, the picture at the top of the screen. */
const toDraw = async (p) => {
  await p.waitForTimeout(1500); await tap(p, "nav button", "Learn", 2000);
  await tap(p, "[data-learn-market] button", null, 600); await tap(p, "[data-learn-markets] button", "UNG", 2500);
  await tap(p, "[data-learn-mode] button", "Draw", 600);
  await p.evaluate(() => { const c = document.querySelector("[data-learn-mode]"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 70); });
  await p.waitForTimeout(300);
};
/** A finger draws `f(u)` (u 0..1 across the plot, the value 0 at the top of the plot and 1 at its foot). */
async function fingerDraw(page, ctx, f, { from = 0.04, to = 0.96, n = 48 } = {}) {
  const box = await page.evaluate(() => { const r = document.querySelector("[data-figure-chart=lab]").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, sy: window.scrollY }; });
  const cdp = await ctx.newCDPSession(page);
  const t = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const at = (u) => [box.x + 50 + u * (box.w - 62), box.y + 24 + f(u) * (box.h - 70)];
  await t("touchStart", ...at(from));
  for (let i = 1; i <= n; i++) { await t("touchMove", ...at(from + ((to - from) * i) / n)); await page.waitForTimeout(10); }
  await t("touchEnd"); await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({ y: window.scrollY,
    cards: [...document.querySelectorAll("[data-learn-match]")].map((b) => b.textContent.replace(/\s+/g, " ")),
    lines: [...document.querySelectorAll("[data-learn-draw-line]")].map((n) => n.textContent) }));
  return { ...r, scrolled: r.y - box.sy };
}
const tremor = (u) => 0.012 * Math.sin(u * 97);
const STRANGLE = (u) => (u < 0.34 ? 0.92 - ((u - 0.04) / 0.3) * 0.67 : u < 0.62 ? 0.25 : 0.25 + ((u - 0.62) / 0.34) * 0.67) + tremor(u);
const BULL_PUT = (u) => (u < 0.3 ? 0.85 : u < 0.5 ? 0.85 - ((u - 0.3) / 0.2) * 0.55 : 0.3) + tremor(u);
const SCRIBBLE = (u) => 0.5 + 0.35 * Math.sign(Math.sin(u * 60)) + tremor(u);

const SHOTS = [
  ["draw-at-rest", "dark", {}, async (p) => { await toDraw(p); }],
  ["draw-short-strangle", "dark", {}, async (p, ctx) => { await toDraw(p); return fingerDraw(p, ctx, STRANGLE); }],
  ["draw-bull-put", "dark", {}, async (p, ctx) => { await toDraw(p); return fingerDraw(p, ctx, BULL_PUT); }],
  ["draw-scribble", "dark", {}, async (p, ctx) => { await toDraw(p); return fingerDraw(p, ctx, SCRIBBLE, { n: 90 }); }],
  ["draw-loaded", "dark", {}, async (p, ctx) => {
    await toDraw(p); const r = await fingerDraw(p, ctx, STRANGLE);
    await tap(p, "[data-learn-match]", null, 900);
    await p.evaluate(() => { const c = document.querySelector("[data-learn-mode]"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 70); });
    return { ...r, after: await p.evaluate(() => document.querySelector("[data-learn-card]")?.getAttribute("data-learn-card")) };
  }],
  ["draw-short-strangle-light", "light", {}, async (p, ctx) => { await toDraw(p); return fingerDraw(p, ctx, STRANGLE); }],
  ["draw-computer-1280", "dark", { width: 1280, height: 800 }, async (p, ctx) => { await toDraw(p); return fingerDraw(p, ctx, STRANGLE); }],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const h = await openHarness();
try {
  for (const [name, theme, size, go] of SHOTS.filter(([n]) => !ONLY || ONLY.includes(n))) {
    const { page, ctx, errors } = await h.open("app+all+book", theme, { scale: 2, touch: true, ...size });
    try {
      const r = await go(page, ctx);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`${name} (${theme})${r ? ` — page scrolled ${r.scrolled}px · ${r.cards.join(" | ") || "no card"}${r.lines.length ? ` · ${r.lines.join(" / ")}` : ""}${r.after ? ` · loaded: ${r.after}` : ""}` : ""}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
