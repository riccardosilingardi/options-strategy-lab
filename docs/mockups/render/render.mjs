// ============================================================================
// docs/mockups/render/render.mjs — THE OWNER'S MOCKUPS, RENDERED IN A REAL BROWSER.
//
// The mockups were drawn as Claude Design "dc" artboards (docs/mockups/src/*.dc.html): HTML + CSS with {{holes}},
// <sc-for>, <sc-if> and <dc-import>, filled by each board's own logic class. runtime.js is a small static renderer for
// that format: it runs the board's class once (its default state) and expands the template, so the board becomes
// plain DOM in Chromium — the same CSS, the same sizes, the same words as the canvas.
//
// Two uses:
//   1. PNGs:  node docs/mockups/render/render.mjs [Board,Board|all] [dark,light]   → docs/mockups/png/<Board>[-light].png
//   2. A live mockup in a Playwright page, to compare with the app value by value:
//        import { mountMockup } from "../docs/mockups/render/render.mjs";
//        await mountMockup(page, "Positions", "dark");   // then page.$eval(selector, el => getComputedStyle(el)...)
//
// Static: event handlers are dropped and every board shows its default state. Fonts are the browser's system-ui /
// ui-monospace, as in the app. Sample numbers in the boards are illustrative; see docs/mockups/README.md for where the
// app's rules win over the drawing.
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const PNG = join(HERE, "..", "png");
export const CANVAS = JSON.parse(readFileSync(join(SRC, "canvas.json"), "utf8"));
const FILES = Object.fromEntries(readdirSync(SRC).filter((f) => f.endsWith(".dc.html")).map((f) => [f, readFileSync(join(SRC, f), "utf8")]));
const RUNTIME = readFileSync(join(HERE, "runtime.js"), "utf8");

/** The board's size as drawn on the canvas: { w, h, title }. */
export const boardOf = (name) => CANVAS.boards[`${name}.dc.html`] || null;

/** Mount one board in a Playwright page (replaces the page's content). Returns its { w, h }. */
export async function mountMockup(page, name, theme = "dark") {
  const board = boardOf(name);
  if (!board) throw new Error(`no board "${name}" in canvas.json`);
  await page.setViewportSize({ width: board.w, height: Math.min(board.h, 4000) });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body><div id="mount"></div></body></html>');
  await page.addScriptTag({ content: RUNTIME });
  const err = await page.evaluate(([files, n, dark]) => {
    try { document.getElementById("mount").appendChild(window.renderBoard(files, n, { dark }).root); return null; }
    catch (e) { return String((e && e.stack) || e); }
  }, [FILES, name, theme === "dark"]);
  if (err) throw new Error(`${name}: ${err}`);
  return { w: board.w, h: board.h };
}

async function loadChromium() {
  const require = createRequire(import.meta.url);
  try { return require("playwright").chromium; }
  catch { return require(join(process.execPath, "../../lib/node_modules/playwright")).chromium; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const want = process.argv[2] && process.argv[2] !== "all" ? process.argv[2].split(",") : Object.keys(CANVAS.boards).map((f) => f.replace(".dc.html", ""));
  const themes = (process.argv[3] || "dark,light").split(",");
  const chromium = await loadChromium();
  const exe = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ executablePath: exe }).catch(() => chromium.launch());
  for (const name of want) for (const theme of themes) {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    const { w, h } = await mountMockup(page, name, theme);
    const out = join(PNG, `${name}${theme === "light" ? "-light" : ""}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h }, fullPage: h > 4000 });
    console.log("ok", out.replace(process.cwd() + "/", ""), `${w}×${h}`);
    await page.close();
  }
  await browser.close();
}
