// ============================================================================
// scripts/shoot-screens.mjs — PHOTOGRAPH THE SCREENS (redesign PR 1, round 2, TASK 4).
//
//   node scripts/shoot-screens.mjs [outDir]       (default docs/screens/redesign-pr1)
//
// Bundles scripts/screens.jsx for the browser (esbuild; `node:fs` is swapped for the one fixture file it reads), serves
// it on a local port, and drives the pre-installed headless Chromium (Playwright) at 390×844, dark, then one screen in
// light. Prints each page's height, whether anything scrolls sideways at 390px, and one compact card's height.
// Fixtures only: no live price, no broker.
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

const OUT = resolve(process.argv[2] || "docs/screens/redesign-pr1");
mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "osl-screens-"));
const fixture = resolve("src/fixtures/alpaca-chain-UNG.json");
await build({
  entryPoints: ["scripts/screens.jsx"], bundle: true, format: "esm", outfile: join(dir, "app.js"), logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"' }, loader: { ".js": "jsx" },
  plugins: [{ name: "fs-fixture", setup(b) {
    b.onResolve({ filter: /^node:fs$/ }, () => ({ path: "fs-fixture", namespace: "fx" }));
    b.onLoad({ filter: /.*/, namespace: "fx" }, () => ({ contents: `const t = ${JSON.stringify(readFileSync(fixture, "utf8"))};
      export const readFileSync = () => t; export default { readFileSync };`, loader: "js" }));
  } }],
});
writeFileSync(join(dir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>screens</title></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>`);
const server = createServer((req, res) => {
  const f = req.url.split("?")[0].split("#")[0] === "/" ? "index.html" : req.url.split("?")[0].slice(1);
  try { const body = readFileSync(join(dir, f)); res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const SHOTS = [
  ["01-find", "find"], ["02-find-budget-sheet", "find-budget"], ["03-find-nothing-fits", "find-nothing"], ["04-saved", "saved"],
  ["05-market-strategies", "strategies"], ["06-market-overview", "overview"], ["07-market-chain-two-legs", "chain"],
  ["08-market-strategies-light", "strategies", "light"],
];
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const report = [];
try {
  for (const [name, view, theme = "dark"] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: "en-GB", timezoneId: "Europe/Rome" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("osl-theme", t); } catch { /* none */ } }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/#${view}`);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const el = document.scrollingElement;
      const card = document.querySelector("[data-card-key]");
      return { height: el.scrollHeight, width: el.scrollWidth, vw: window.innerWidth,
        card: card ? Math.round(card.getBoundingClientRect().height) : null,
        cards: document.querySelectorAll("[data-card-key]").length };
    });
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
    report.push({ name, ...m, sideways: m.width > m.vw, errors });
    await ctx.close();
  }
} finally {
  await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
}
for (const r of report) {
  console.log(`${r.name.padEnd(30)} page ${String(r.height).padStart(6)}px · sideways ${r.sideways ? "YES" : "no"}` +
    `${r.cards ? ` · ${r.cards} cards, first ${r.card}px` : ""}${r.errors.length ? ` · ERRORS: ${r.errors.join(" | ")}` : ""}`);
}
