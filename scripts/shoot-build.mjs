// ============================================================================
// scripts/shoot-build.mjs — PHOTOGRAPH BUILD (redesign PR 2, TASK 6).
//
//   node scripts/shoot-build.mjs [outDir]       (default docs/screens/redesign-pr2)
//
// Bundles scripts/build-screens.jsx (the WHOLE app on fixtures) for the browser, serves it on a local port, and drives
// the pre-installed headless Chromium (Playwright) at 390×844 with the clock fixed at 5 Oct 2026, 14:00 UTC: Find → the
// UNG row → its first Strategies card's Build › → Build. Then: Build at rest (full page), Why this trade open, the
// copilot with its stubbed answer, the Order section over the cap, the review sheet, the sent state, loading, no
// quotes, empty, Build in light, "More on this trade ▾" open and "Edit in chain ›" on the market page. Prints Build's full height and whether anything scrolls sideways at 390px.
// Fixtures only: no live price, no broker, no model.
// ============================================================================
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(join(process.execPath, "../../lib/node_modules/playwright"))); }

const OUT = resolve(process.argv[2] || "docs/screens/redesign-pr2");
mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "osl-build-"));
const fixture = resolve("src/fixtures/alpaca-chain-UNG.json");
await build({
  entryPoints: ["scripts/build-screens.jsx"], bundle: true, format: "esm", outfile: join(dir, "app.js"), logLevel: "error",
  // Stamped as production: these are production's screens (a preview draws the read-only banner, preview.test.jsx).
  define: { "process.env.NODE_ENV": '"production"', __OSL_DEPLOY_CONTEXT__: '"production"' }, loader: { ".js": "jsx" },
  plugins: [{ name: "fs-fixture", setup(b) {
    b.onResolve({ filter: /^node:fs$/ }, () => ({ path: "fs-fixture", namespace: "fx" }));
    b.onLoad({ filter: /.*/, namespace: "fx" }, () => ({ contents: `const t = ${JSON.stringify(readFileSync(fixture, "utf8"))};
      export const readFileSync = () => t; export default { readFileSync };`, loader: "js" }));
  } }],
});
writeFileSync(join(dir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>build</title></head><body style="margin:0"><div id="root"></div><script type="module" src="app.js"></script></body></html>`);
const server = createServer((req, res) => {
  const f = req.url.split("?")[0].split("#")[0] === "/" ? "index.html" : req.url.split("?")[0].slice(1);
  try { const body = readFileSync(join(dir, f)); res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const report = [];

async function open(mode, theme = "dark") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: "en-GB", timezoneId: "Europe/Rome" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("osl-theme", t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-10-05T14:00:00Z"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/#${mode}`);
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}
const tap = async (page, sel, text) => {
  const ok = await page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => (t == null || e.textContent.trim().includes(t)) && !e.disabled);
    if (!el) return false;
    el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, [sel, text]);
  if (!ok) throw new Error(`nothing to tap: ${sel} "${text}"`);
  await page.waitForTimeout(500);
};
const measure = (page) => page.evaluate(() => ({ height: document.scrollingElement.scrollHeight, width: document.scrollingElement.scrollWidth, vw: window.innerWidth }));
async function shot(page, name, errors, { full = false, scrollTo = null } = {}) {
  if (scrollTo) await page.evaluate((s) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60); }, scrollTo);
  else if (!full) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const m = await measure(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  report.push({ name, ...m, sideways: m.width > m.vw, errors: errors.slice() });
}
/** Find → UNG's row → its first card's Build ›. */
async function toBuild(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[role=listitem], button")).some((e) => /UNG/.test(e.textContent)), null, { timeout: 15000 });
  await tap(page, "button", "UNG");
  await page.waitForTimeout(800);
  await tap(page, "button", "Build ›");
  await page.waitForSelector("[data-build]", { timeout: 15000 });
  await page.waitForTimeout(1500);
}

try {
  // 1 — Build at rest, full page; then the sections opened one at a time.
  {
    const { ctx, page, errors } = await open("app");
    await toBuild(page);
    await shot(page, "01-build-at-rest", errors, { full: true });
    await shot(page, "01b-build-first-screen", errors);
    await tap(page, "[data-why-trade] button", "Why this trade");
    await shot(page, "02-why-this-trade-open", errors, { scrollTo: "[data-why-trade]" });
    await tap(page, "[data-build-copilot] button", "What would make it wrong?");
    await page.waitForTimeout(1500);
    await shot(page, "03-copilot-answer", errors, { scrollTo: "[data-build-copilot]" });
    // The review sheet, then the stubbed send.
    await tap(page, "[data-build-send] button", "Send");
    await shot(page, "05-review-sheet", errors);
    await tap(page, "[data-review] button", "Send to Alpaca");
    await page.waitForTimeout(1200);
    await shot(page, "06-sent", errors);
    await ctx.close();
  }
  // 4 — the Order section over the cap: contracts up until the risk passes the per-trade limit.
  {
    const { ctx, page, errors } = await open("app");
    await toBuild(page);
    for (let i = 0; i < 40; i++) {
      const over = await page.evaluate(() => !!document.querySelector("[data-build-order] [role=alert]"));
      if (over) break;
      await page.evaluate(() => { const b = document.querySelector("[data-build-order] button[aria-label='More: Contracts']"); if (b && !b.disabled) b.click(); });
      await page.waitForTimeout(120);
    }
    await shot(page, "04-order-over-the-cap", errors, { scrollTo: "[data-build-order]" });
    await ctx.close();
  }
  // 7, 8, 9 — the three states, through the bottom bar's Build with nothing picked.
  for (const [mode, name] of [["loading", "07-loading"], ["noquotes", "08-no-quotes"], ["empty", "09-empty"]]) {
    const { ctx, page, errors } = await open(mode);
    await page.waitForTimeout(800);
    await tap(page, "nav button", "Build");
    await page.waitForTimeout(mode === "noquotes" ? 2500 : 1200);
    // LOADING is Build's own request in flight (`buildScreenState()`): Find's background reads do not count, so the
    // real way in is Retry on a market that has not answered — and in this mode it never does.
    if (mode === "loading") { await tap(page, "button", "Retry"); await page.waitForTimeout(600); }
    await shot(page, name, errors);
    await ctx.close();
  }
  // 11, 12 — "More on this trade ▾" open, and "Edit in chain ›" landing on the market page's Chain tab with these legs.
  {
    const { ctx, page, errors } = await open("app");
    await toBuild(page);
    await tap(page, "[data-build-more] button", "More on this trade");
    await page.waitForTimeout(800);
    await shot(page, "11-more-on-this-trade", errors, { scrollTo: "[data-build-more]" });
    await tap(page, "[data-build-legs] button", "Edit in chain");
    await page.waitForTimeout(1200);
    await shot(page, "12-edit-in-chain", errors);
    await ctx.close();
  }
  // 10 — Build in light.
  {
    const { ctx, page, errors } = await open("app", "light");
    await toBuild(page);
    await shot(page, "10-build-light", errors, { full: true });
    await ctx.close();
  }
} finally {
  await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
}
for (const r of report) {
  console.log(`${r.name.padEnd(28)} page ${String(r.height).padStart(6)}px · sideways ${r.sideways ? `YES (${r.width}px)` : "no"}` +
    `${r.errors.length ? ` · ERRORS: ${r.errors.join(" | ")}` : ""}`);
}
