// ============================================================================
// scripts/audit-build.mjs — BUILD AGAINST THE MOCKUP'S OWN VALUES, MEASURED IN THE BROWSER.
//
//   node scripts/audit-build.mjs            (dark; add "light" for the light palette)
//
// Same harness as scripts/shoot-build.mjs (the WHOLE app on fixtures, 390×844, the clock fixed): Find → UNG → Build ›,
// then every value the owner's mockup "3 · Build" (and "Build · review, then send") gives — sizes, weights, borders,
// radii, paddings, tap heights, colours — is read with getComputedStyle and compared with the value written in the
// redesign PR 2 prompt, and the mockup's words are looked for on the screen. Prints one line per check (✓ or ✗ with what was measured) and exits 1 on any ✗.
// Fixtures only: no live price, no broker, no model.
// ============================================================================
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { PALETTES } from "../src/theme.js";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(join(process.execPath, "../../lib/node_modules/playwright"))); }

const THEME = process.argv[2] === "light" ? "light" : "dark";
const P = PALETTES[THEME];
const dir = mkdtempSync(join(tmpdir(), "osl-audit-"));
const fixture = resolve("src/fixtures/alpaca-chain-UNG.json");
await build({
  entryPoints: ["scripts/build-screens.jsx"], bundle: true, format: "esm", outfile: join(dir, "app.js"), logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"', __OSL_DEPLOY_CONTEXT__: '"production"' }, loader: { ".js": "jsx" },
  plugins: [{ name: "fs-fixture", setup(b) {
    b.onResolve({ filter: /^node:fs$/ }, () => ({ path: "fs-fixture", namespace: "fx" }));
    b.onLoad({ filter: /.*/, namespace: "fx" }, () => ({ contents: `const t = ${JSON.stringify(readFileSync(fixture, "utf8"))};
      export const readFileSync = () => t; export default { readFileSync };`, loader: "js" }));
  } }],
});
writeFileSync(join(dir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>audit</title></head><body style="margin:0"><div id="root"></div><script type="module" src="app.js"></script></body></html>`);
const server = createServer((req, res) => {
  const f = req.url.split("?")[0].split("#")[0] === "/" ? "index.html" : req.url.split("?")[0].slice(1);
  try { const body = readFileSync(join(dir, f)); res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

/** "#rrggbb" → "rgb(r, g, b)", the form getComputedStyle answers in. */
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const C = Object.fromEntries(Object.entries(P).filter(([, v]) => typeof v === "string" && v.startsWith("#")).map(([k, v]) => [k, rgb(v)]));

const results = [];
const tap = async (page, sel, text) => {
  const ok = await page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => (t == null || e.textContent.trim().includes(t)) && !e.disabled);
    if (!el) return false;
    el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, [sel, text]);
  if (!ok) throw new Error(`nothing to tap: ${sel} "${text}"`);
  await page.waitForTimeout(500);
};

/** Each check: a name, how to find the element (run in the page), and the computed values the mockup gives. */
async function check(page, name, find, want) {
  const got = await page.evaluate(([src, keys]) => {
    // eslint-disable-next-line no-new-func
    const el = new Function("q", "qt", src)(
      (s, root = document) => root.querySelector(s),
      (s, t, root = document) => Array.from(root.querySelectorAll(s)).find((e) => e.textContent.trim() === t || e.textContent.trim().startsWith(t)),
    );
    if (!el) return null;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const out = {};
    for (const k of keys) {
      if (k === "height") out[k] = Math.round(r.height);
      else if (k === "width") out[k] = Math.round(r.width);
      else if (k === "mono") out[k] = /mono|menlo|consolas|courier/i.test(cs.fontFamily);
      else if (k === "tabular") out[k] = /tabular-nums/.test(cs.fontVariantNumeric);
      else out[k] = cs[k];
    }
    return out;
  }, [find, Object.keys(want)]);
  if (!got) { results.push({ name, ok: false, why: "not found" }); return; }
  const bad = [];
  for (const [k, w] of Object.entries(want)) {
    const g = got[k];
    const pass = typeof w === "function" ? w(g) : String(g) === String(w);
    if (!pass) bad.push(`${k}: ${g} (want ${typeof w === "function" ? w.label || "a rule" : w})`);
  }
  results.push({ name, ok: bad.length === 0, why: bad.join("; ") });
}
const atLeast = (n) => Object.assign((g) => parseFloat(g) >= n, { label: `≥ ${n}` });

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: THEME, locale: "en-GB", timezoneId: "Europe/Rome" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("osl-theme", t); } catch { /* none */ } }, THEME);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-10-05T14:00:00Z"));
  await page.goto(`http://localhost:${port}/#app`);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((e) => /UNG/.test(e.textContent)), null, { timeout: 15000 });
  await tap(page, "button", "UNG"); await page.waitForTimeout(800);
  await tap(page, "button", "Build ›");
  await page.waitForSelector("[data-build]", { timeout: 15000 }); await page.waitForTimeout(1500);

  // ---- the mockup's words, on the screen (each read through its own generator; the fixture is UNG's iron condor)
  const text = await page.evaluate(() => document.querySelector("[data-build]").innerText);
  for (const [name, re] of [
    ["Title sub · TK · date · N days · ×N", /UNG · \d{1,2} [A-Z][a-z]{2} · \d+ days · ×\d+/],
    ["Takeaway · Keeps up to … loses up to … Breakeven", /Keeps up to \$[\d,]+ if UNG closes .+; loses up to \$[\d,]+ .+Breakevens? \$/],
    ["Chart · 60 sessions, BE labels, How to read ⓘ", /BE [\d.]+[\s\S]*60 sessions[\s\S]*How to read ⓘ/],
    ["Numbers · Max profit, Max loss, Breakeven, Return on risk", /Max profit[\s\S]*Max loss[\s\S]*Breakeven[\s\S]*Return on risk/],
    ["Boxes · FUTURE (MONTE CARLO) Chance Avg · PAST YRS (BACKTEST) In profit N of M Avg", /FUTURE \(MONTE CARLO\)\s+Chance[\s\S]*Avg[\s\S]*PAST YRS \(BACKTEST\)\s+In profit\s+\d+ of \d+\s+Avg/],
    ["Delta (shares) and Theta", /Delta \(shares\)[\s\S]*Theta/],
    ["Why this trade · open", /Why this trade\s+open/],
    ["Copilot · the four questions", /ASK THE COPILOT ABOUT THIS TRADE\s+Pre-trade analysis\s+What would make it wrong\?\s+Compare with the other cards\s+News that could move it/],
    ["Copilot · the footer", /Educational analysis on a paper account, not financial advice\. Every answer is filed in the Journal\./],
    ["Legs · date · Edit in chain ›", /Legs · \d{1,2} [A-Z][a-z]{2}\s+Edit in chain ›/],
    ["Leg · 1 × strike put, mid, bid / ask · Δ", /(BUY|SELL)\s+\d+ × [\d.]+ (put|call)\s+[\d.]+ mid\s+[\d.]+ \/ [\d.]+ · Δ/],
    ["Order · Contracts, Limit credit, Mid · natural · tick", /Contracts\s+Limit (credit|debit)[\s\S]*Mid [\d.]+ · natural [\d.]+ · tick [\d.]+/],
    ["Order · risk, the cap, open risk", /Risk on this trade[\s\S]*% of capital\s+Enforce the 5% cap per trade \(\$[\d,]+\)\s+Open risk after this[\s\S]*of \$[\d,]+/],
    ["Exit plan · pill and three rows", /Exit plan\s+defaults · not backtested on UNG\s+Take profit\s+at 50% of max profit[\s\S]*Time exit\s+21 days before expiry[\s\S]*Stop\s+alert at 50% of max loss, no order[\s\S]*Exits go in as limit orders\./],
    ["Send · label and footer", /Send limit order · (credit|debit) \$[\d,]+\s+Paper account · Alpaca · day order/],
    ["More on this trade ▾", /More on this trade\s+▾/],
  ]) results.push({ name: `Words · ${name}`, ok: re.test(text), why: "not on the screen" });
  if (process.env.DUMP) console.log(text);
  // ---- the header row and the page
  await check(page, "Header row · padding 6px 8px 0 4px", `return q("[data-build-header]")`, { paddingTop: "6px", paddingRight: "8px", paddingBottom: "0px", paddingLeft: "4px" });
  await check(page, "Back link · min-height 44, 15px, ink", `return q("[data-build-header] button")`, { height: atLeast(44), fontSize: "15px", color: C.ink });
  await check(page, "Paper pill · 12 bold, 1px field border, radius 999, mut", `return q("[data-build-header] span")`,
    { fontSize: "12px", fontWeight: "700", borderTopWidth: "1px", borderTopColor: C.field, borderTopLeftRadius: "999px", color: C.mut });
  await check(page, "Main · padding 4px 16px, gap 12", `return q("[data-build] main")`, { paddingTop: "4px", paddingLeft: "16px", paddingRight: "16px", rowGap: "12px" });
  await check(page, "Section · panel, 1px line, radius 12, padding 14", `return q("[data-build] section[aria-label='The numbers']")`,
    { backgroundColor: C.panel, borderTopWidth: "1px", borderTopColor: C.line, borderTopLeftRadius: "12px", paddingTop: "14px", paddingLeft: "14px" });
  // ---- the title
  await check(page, "Title · 24 bold", `return q("[data-build] main h2")`, { fontSize: "24px", fontWeight: "700" });
  await check(page, "Title sub · mono 13 mut", `return q("[data-build] main h2").nextElementSibling`, { fontSize: "13px", color: C.mut, mono: true });
  // ---- what this trade does
  await check(page, "Takeaway · 15px ink", `return q("[data-takeaway]")`, { fontSize: "15px", color: C.ink });
  await check(page, "How to read ⓘ · 13px blue, 44 tall", `return qt("[data-build] button", "How to read")`, { fontSize: "13px", color: C.blue, height: atLeast(44) });
  // ---- the numbers
  const fig = `q("[data-build] section[aria-label='The numbers'] > div:nth-of-type(2)").children[0]`;
  await check(page, "Figure label · 12 mut, dotted underline", `return ${fig}.querySelector("button")`,
    { fontSize: "12px", color: C.mut, textDecorationStyle: "dotted" });
  await check(page, "Figure value · mono 18 bold", `return ${fig}.querySelector("div")`, { fontSize: "18px", fontWeight: "700", mono: true, tabular: true });
  const box = `q("[data-build] section[aria-label='The numbers'] > div:nth-of-type(3)").children[0]`;
  await check(page, "FUTURE box · 1px line, radius 10, padding 10", `return ${box}`, { borderTopWidth: "1px", borderTopColor: C.line, borderTopLeftRadius: "10px", paddingTop: "10px" });
  await check(page, "Box title · 12 bold, 0.04em, mut", `return ${box}.children[0]`, { fontSize: "12px", fontWeight: "700", letterSpacing: "0.48px", color: C.mut });
  await check(page, "Box row label · 13px", `return ${box}.children[1].children[0]`, { fontSize: "13px" });
  await check(page, "Box row value · mono 15 bold", `return ${box}.children[1].children[1]`, { fontSize: "15px", fontWeight: "700", mono: true });
  await check(page, "Delta value · mono 15 bold", `return q("[data-build] section[aria-label='The numbers'] > div:nth-of-type(4)").children[0].querySelector("div")`,
    { fontSize: "15px", fontWeight: "700", mono: true });
  await check(page, "Theta value · mono 15 bold", `return q("[data-build] section[aria-label='The numbers'] > div:nth-of-type(4)").children[1].querySelector("div")`,
    { fontSize: "15px", fontWeight: "700", mono: true });
  // ---- why this trade (closed, then open)
  await check(page, "Why · padding 6px 14px", `return q("[data-why-trade]")`, { paddingTop: "6px", paddingLeft: "14px" });
  await check(page, "Why title · 15 bold", `return q("[data-why-trade] button span")`, { fontSize: "15px", fontWeight: "700" });
  await check(page, "Why 'open' · blue", `return q("[data-why-trade] button span:last-child")`, { color: C.blue });
  await tap(page, "[data-why-trade] button", "Why this trade");
  await check(page, "Factor row · 13px", `return q("[data-why-trade] div[style*='min-height: 28px'] span")`, { fontSize: "13px" });
  await check(page, "Five lines · number mono 12 bold mut", `return q("[data-why-trade] div[style*='grid-template-columns: 18px'] > span")`, { fontSize: "12px", fontWeight: "700", color: C.mut, mono: true });
  await check(page, "Five lines · label 12 bold 0.04em mut", `return q("[data-why-trade] div[style*='grid-template-columns: 18px'] > div > div")`, { fontSize: "12px", fontWeight: "700", letterSpacing: "0.48px", color: C.mut });
  await check(page, "Five lines · text 13px", `return q("[data-why-trade] div[style*='grid-template-columns: 18px'] > div > div:last-child")`, { fontSize: "13px" });
  // ---- the copilot
  await check(page, "Copilot heading · 12 bold 0.08em mut", `return q("[data-build-copilot] > div")`, { fontSize: "12px", fontWeight: "700", letterSpacing: "0.96px", color: C.mut });
  await check(page, "Pre-trade analysis · spans both, blue border, bold", `return q("[data-build-copilot] button")`,
    { gridColumnStart: "1", gridColumnEnd: "span 2", borderTopColor: C.blue, fontWeight: "700", height: atLeast(44) });
  await check(page, "Question button · 44, padding 8px 12px, field border, radius 10, 13px, left", `return q("[data-build-copilot] button:nth-of-type(2)")`,
    { height: atLeast(44), paddingTop: "8px", paddingLeft: "12px", borderTopColor: C.field, borderTopLeftRadius: "10px", fontSize: "13px", textAlign: "left" });
  await check(page, "Ask field · 44, field border, radius 10, bg", `return q("[data-build-copilot] input")`, { height: "44", borderTopColor: C.field, borderTopLeftRadius: "10px", backgroundColor: C.bg });
  await check(page, "Ask send · 44×44, action, on-accent", `return q("[data-build-copilot] button[aria-label='Send the question']")`, { height: "44", width: "44", backgroundColor: C.action, color: C.onAccent });
  // ---- the legs
  await check(page, "Legs title · 15 bold", `return q("[data-build-legs] h3")`, { fontSize: "15px", fontWeight: "700" });
  await check(page, "Edit in chain › · 13 blue 44", `return qt("[data-build-legs] button", "Edit in chain")`, { fontSize: "13px", color: C.blue, height: atLeast(44) });
  await check(page, "Leg row · min-height 52, 1px line on top", `return q("[data-leg-row]")`, { height: atLeast(52), borderTopWidth: "1px", borderTopColor: C.line });
  await check(page, "Side tag · 44 wide, 12 bold, line-height 22, radius 6", `return q("[data-leg-row] > span")`, { width: "44", fontSize: "12px", fontWeight: "700", lineHeight: "22px", borderTopLeftRadius: "6px" });
  await check(page, "Leg · mono 15 bold", `return q("[data-leg-row] > span:nth-child(2)")`, { fontSize: "15px", fontWeight: "700", mono: true });
  await check(page, "Leg mid · mono 15", `return q("[data-leg-row] > span:nth-child(3) > span")`, { fontSize: "15px", mono: true });
  await check(page, "Leg bid / ask · Δ · mono 12 mut", `return q("[data-leg-row] > span:nth-child(3) > span:nth-child(2)")`, { fontSize: "12px", color: C.mut, mono: true });
  // ---- the order
  await check(page, "Order title · 15 bold", `return q("[data-build-order] h3")`, { fontSize: "15px", fontWeight: "700" });
  await check(page, "Stepper · 1px field border, radius 10", `return q("[data-build-order] button[aria-label='More: Contracts']").parentElement`, { borderTopColor: C.field, borderTopLeftRadius: "10px" });
  await check(page, "Stepper − + · 44×44", `return q("[data-build-order] button[aria-label='More: Contracts']")`, { height: "44", width: "44" });
  await check(page, "Stepper value · mono 15 bold", `return q("[data-build-order] input[aria-label='Contracts']")`, { fontSize: "15px", fontWeight: "700", mono: true });
  await check(page, "Book line · mono 12 mut", `return q("[data-build-order] input[aria-label='Contracts']").closest("section").querySelector("div[style*='margin-top: 8px']")`, { fontSize: "12px", color: C.mut, mono: true });
  await check(page, "Limit note · 13px", `return q("[data-limit-note]")`, { fontSize: "13px" });
  await check(page, "Risk on this trade · 13 mut dotted", `return qt("[data-build-order] button", "Risk on this trade")`, { fontSize: "13px", color: C.mut, textDecorationStyle: "dotted" });
  await check(page, "Cap checkbox · 22px", `return q("[data-build-order] input[type=checkbox]")`, { width: "22", height: "22" });
  // ---- the exit plan
  await check(page, "Exit plan title · 15 bold", `return q("[data-build-exits] h3")`, { fontSize: "15px", fontWeight: "700" });
  await check(page, "Exit row · 96px label column, 1px line on top", `return q("[data-build-exits] div[style*='96px']")`, { gridTemplateColumns: (g) => /^96px /.test(g), borderTopColor: C.line });
  await check(page, "Exit label · 13 bold", `return q("[data-build-exits] div[style*='96px'] > span")`, { fontSize: "13px", fontWeight: "700" });
  await check(page, "Exit footer · 12 mut", `return q("[data-build-exits]").lastElementChild`, { fontSize: "12px", color: C.mut });
  // ---- send
  await check(page, "Send · full width, 52, radius 12, action, on-accent, 15 bold", `return q("[data-build-send] button")`,
    { height: atLeast(52), borderTopLeftRadius: "12px", backgroundColor: C.action, color: C.onAccent, fontSize: "15px", fontWeight: "700", width: "358" });
  await check(page, "Send footer · 12 mut centred", `return q("[data-build-send]").lastElementChild`, { fontSize: "12px", color: C.mut, textAlign: "center" });
  // ---- the review sheet
  await tap(page, "[data-build-send] button", "Send");
  await check(page, "Sheet · panel, 1px field on top, radius 18 18 0 0, padding 8 16 20, gap 12", `return q("[role=dialog]")`,
    { backgroundColor: C.panel, borderTopColor: C.field, borderTopLeftRadius: "18px", borderBottomLeftRadius: "0px", paddingTop: "8px", paddingLeft: "16px", paddingBottom: "20px", rowGap: "12px" });
  await check(page, "Sheet handle · 40×4", `return q("[role=dialog] > div")`, { width: "40", height: "4" });
  await check(page, "Review title · 18 bold", `return q("[role=dialog] h2")`, { fontSize: "18px", fontWeight: "700" });
  await check(page, "Review sub · 12 mut", `return q("[data-review] > div")`, { fontSize: "12px", color: C.mut });
  await check(page, "Review box · bg, 1px line, radius 10, padding 10px 12px", `return q("[data-review] > div:nth-child(2)")`,
    { backgroundColor: C.bg, borderTopColor: C.line, borderTopLeftRadius: "10px", paddingTop: "10px", paddingLeft: "12px" });
  await check(page, "Review leg · 13px", `return q("[data-review] > div:nth-child(2) > div > span")`, { fontSize: "13px" });
  await check(page, "Review OCC · mono mut", `return q("[data-review] > div:nth-child(2) > div > span:nth-child(2)")`, { color: C.mut, mono: true });
  await check(page, "Review limit line · mono 15 bold", `return q("[data-review] > div:nth-child(2) > div:last-child")`, { fontSize: "15px", fontWeight: "700", mono: true });
  await check(page, "Check mark · 20px", `return q("[data-review-checks] > div > span")`, { width: "20" });
  await check(page, "Check words · 13px", `return q("[data-review-checks] > div > span:nth-child(2)")`, { fontSize: "13px" });
  await check(page, "Check value · mono", `return q("[data-review-checks] > div > span:nth-child(3)")`, { mono: true });
  await check(page, "Back · ghost, 48", `return qt("[data-review] button", "Back")`, { height: atLeast(48), backgroundColor: "rgba(0, 0, 0, 0)" });
  await check(page, "Send to Alpaca · action, 48", `return qt("[data-review] button", "Send to Alpaca")`, { height: atLeast(48), backgroundColor: C.action });
  const sheet = await page.evaluate(() => document.querySelector("[role=dialog]").innerText);
  for (const [name, re] of [
    ["Review · title and sub", /Review, then send\s+Paper account · Alpaca · second of two taps/],
    ["Review · Sell to open N × strike put with its OCC", /(Sell|Buy) to open \d+ × [\d.]+ (put|call)\s+UNG\d{6}[PC]\d{8}/],
    ["Review · Limit $x credit · day · ×N", /Limit \$[\d.]+ (credit|debit) · day · ×\d+/],
    ["Review · the checks", /Most it can lose[\s\S]*Inside the per-trade cap[\s\S]*Open risk after this[\s\S]*No uncovered legs[\s\S]*days to expiry[\s\S]*Open interest above the chain's floor/],
    ["Review · Back and Send to Alpaca", /Back\s+Send to Alpaca/],
  ]) results.push({ name: `Words · ${name}`, ok: re.test(sheet), why: "not on the sheet" });
  await tap(page, "[data-review] button", "Send to Alpaca"); await page.waitForTimeout(1200);
  const sent = await page.evaluate(() => document.querySelector("[role=dialog]").innerText);
  for (const [name, re] of [
    ["Sent · ✓ Sent. Alpaca accepted it.", /✓ Sent\. Alpaca accepted it\./],
    ["Sent · the order, filled 0 of N", /[\d.]+ (credit|debit) · day · filled 0 of \d+/],
    ["Sent · the Journal ref", /J-\d{4} is filed in the Journal/],
    ["Sent · Journal and See it in Orders", /Journal\s+See it in Orders/],
  ]) results.push({ name: `Words · ${name}`, ok: re.test(sent), why: "not on the sheet" });
  if (process.env.DUMP) console.log(`=== SHEET ===\n${sheet}\n=== SENT ===\n${sent}`);
  // ---- nothing sideways
  const sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
  results.push({ name: "Nothing scrolls sideways at 390px", ok: !sideways, why: sideways ? "the page is wider than the screen" : "" });
  await ctx.close();
} finally {
  await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
}
let fails = 0;
for (const r of results) { if (!r.ok) fails++; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : ` — ${r.why}`}`); }
console.log(`\n${THEME}: ${results.length - fails} of ${results.length} match the mockup's values.`);
process.exit(fails ? 1 : 0);
