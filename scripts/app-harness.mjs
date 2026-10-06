// ============================================================================
// scripts/app-harness.mjs — THE WHOLE APP ON FIXTURES, IN CHROMIUM (redesign PR 3, TASK 0a).
//
// One harness for every script that photographs or measures the app: it bundles scripts/app-screens.jsx (the real
// `OptionsStrategyLab` with every network call answered by fixtures), serves it on a local port and opens pages at a
// fixed clock. shoot-build.mjs, shoot-screens.mjs and audit-screen.mjs all start here, so what one measures is what the
// other photographs. Nothing here is a live price and nothing leaves the browser.
//
//   const h = await openHarness();                       // bundle + serve + launch
//   const { page } = await h.open("app", "dark");        // the hash is the fixture mode (see app-screens.jsx)
//   await h.tap(page, "button", "UNG");
//   await h.close();
// ============================================================================
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export function loadChromium() {
  try { return require("playwright").chromium; }
  catch { return require(join(process.execPath, "../../lib/node_modules/playwright")).chromium; }
}

/** The fixed clock every photograph and measurement reads (Mon 5 Oct 2026, 16:00 in Rome). */
export const FIXED_NOW = "2026-10-05T14:00:00Z";

export async function openHarness({ context = "production" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "osl-app-"));
  const fixture = resolve("src/fixtures/alpaca-chain-UNG.json");
  await build({
    entryPoints: ["scripts/app-screens.jsx"], bundle: true, format: "esm", outfile: join(dir, "app.js"), logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"', __OSL_DEPLOY_CONTEXT__: JSON.stringify(context) }, loader: { ".js": "jsx" },
    plugins: [{ name: "fs-fixture", setup(b) {
      b.onResolve({ filter: /^node:fs$/ }, () => ({ path: "fs-fixture", namespace: "fx" }));
      b.onLoad({ filter: /.*/, namespace: "fx" }, () => ({ contents: `const t = ${JSON.stringify(readFileSync(fixture, "utf8"))};
        export const readFileSync = () => t; export default { readFileSync };`, loader: "js" }));
    } }],
  });
  writeFileSync(join(dir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>app</title></head><body style="margin:0"><div id="root"></div><script type="module" src="app.js"></script></body></html>`);
  const server = createServer((req, res) => {
    const f = req.url.split("?")[0].split("#")[0] === "/" ? "index.html" : req.url.split("?")[0].slice(1);
    try { const body = readFileSync(join(dir, f)); res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  }).listen(0);
  const port = server.address().port;
  const chromium = loadChromium();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" })
    .catch(() => chromium.launch());

  /** A fresh page on the app: `mode` is the fixture hash, `theme` the stored palette, the clock fixed. */
  async function open(mode = "app", theme = "dark", { width = 390, height = 844, scale = 1 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: theme, locale: "en-GB", timezoneId: "Europe/Rome" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("osl-theme", t); } catch { /* none */ } }, theme);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/#${mode}`);
    await page.waitForTimeout(1200);
    return { ctx, page, errors };
  }
  return { browser, open, tap, close: async () => { await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true }); } };
}

/** Tap the first enabled element matching `sel` whose text includes `text` (or the first match when text is null). */
export async function tap(page, sel, text = null, wait = 500) {
  const ok = await page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => (t == null || e.textContent.trim().includes(t)) && !e.disabled);
    if (!el) return false;
    el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, [sel, text]);
  if (!ok) throw new Error(`nothing to tap: ${sel} "${text}"`);
  await page.waitForTimeout(wait);
}

/** Find → UNG's row → its first card's Build › (the path every Build photograph takes). */
export async function toBuild(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[role=listitem], button")).some((e) => /UNG/.test(e.textContent)), null, { timeout: 15000 });
  await tap(page, "button", "UNG", 800);
  await tap(page, "button", "Build ›");
  await page.waitForSelector("[data-build]", { timeout: 15000 });
  await page.waitForTimeout(1500);
}
