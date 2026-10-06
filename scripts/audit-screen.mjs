// ============================================================================
// scripts/audit-screen.mjs — A SCREEN AGAINST ITS BOARD, MEASURED IN THE SAME BROWSER (redesign PR 3, TASK 0a).
//
//   node scripts/audit-screen.mjs <Board[,Board…]|all|shipped|pr3> [dark,light] [--no-shots] [--out=dir] [--quiet]
//
// For each board named in scripts/audit-map.mjs: the owner's board is mounted with `mountMockup()`
// (docs/mockups/render/render.mjs) and the app's screen is opened through the WHOLE app on fixtures
// (scripts/app-harness.mjs, the same harness the photographs use), both in one Chromium at 390×844, same theme.
// Elements are paired through the screen's declared map (a board selector ↔ an app selector, usually a data-attribute)
// and for each pair the computed style is compared: font size, weight, mono or sans, colour, background (each named by
// its theme token), border width/style/colour per side (an inset 0 0 0 Npx shadow counts as a border), radius,
// padding, min-height and gap. Font values are compared only where the board's element holds its own text (or the
// pair asks). Then every phrase of the board's text is looked for on the app's screen, skipping the sample figures
// (a phrase with a digit: "never copy a number from a board", docs/mockups/README.md) and the screen's declared
// skips, each with its reason.
//
// One line per check: ✓, or ✗ with both values. A difference docs/mockups/README.md explains (a rule wins over the
// drawing) is printed "✗ … · rule: <why>" and does not fail the run; any other ✗ exits 1.
// A side-by-side PNG per board and theme goes to --out (default docs/screens/redesign-pr3/audit/): board left, app
// right, the same height (the app is cut at the board's height).
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mountMockup, boardOf } from "../docs/mockups/render/render.mjs";
import { openHarness } from "./app-harness.mjs";
import { SCREENS, GROUPS, TAP_RULE } from "./audit-map.mjs";
import { PALETTES } from "../src/theme.js";

const argv = process.argv.slice(2);
const flag = (k, d = null) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes("=") ? a.split("=").slice(1).join("=") : true) : d; };
const pos = argv.filter((a) => !a.startsWith("--"));
const want = (pos[0] || "all").split(",").flatMap((n) => GROUPS[n] || [n]);
const themes = (pos[1] || "dark,light").split(",");
const OUT = flag("out", "docs/screens/redesign-pr3/audit");
const SHOTS = !flag("no-shots", false);
const QUIET = !!flag("quiet", false);
for (const n of want) if (!SCREENS[n]) { console.error(`audit-screen: no map for "${n}" (scripts/audit-map.mjs)`); process.exit(2); }

/** The style record of one element (run in the page). A selector may end in "::text=<t>" to pick by its own text. */
const RECORD = ([root, sel]) => {
  const scope = document.querySelector(root) || document;
  let el = null;
  const m = sel.split("::text=");
  if (m.length > 1) el = Array.from(scope.querySelectorAll(m[0])).find((e) => e.textContent.trim().startsWith(m[1]));
  else el = scope.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const sides = ["Top", "Right", "Bottom", "Left"];
  let border = sides.map((s) => (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none"
    ? `${cs[`border${s}Width`]} ${cs[`border${s}Style`]} ${cs[`border${s}Color`]}` : "0"));
  const inset = /^(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+px) inset$/.exec(cs.boxShadow);
  if (inset && border.every((b) => b === "0")) border = sides.map(() => `${inset[2]} solid ${inset[1]}`);
  const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
  // A board button left at the browser's own padding (1px 6px) has no designed padding: it is sized by its row.
  const uaPadding = el.tagName === "BUTTON" && cs.padding === "1px 6px";
  return {
    uaPadding, own, size: cs.fontSize, weight: String(cs.fontWeight), family: /mono|menlo|consolas|courier/i.test(cs.fontFamily) ? "mono" : "sans",
    color: cs.color, bg: cs.backgroundColor, border,
    radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
    minh: cs.minHeight, height: Math.round(r.height), gap: `${cs.rowGap}/${cs.columnGap}`,
  };
};
/** The phrases of a screen's text (run in the page): each element's own text, whitespace collapsed. A sentence whose
 *  figures sit in their own spans ("Take profit reached: <span>$24</span> of <span>$21</span>.") keeps its pieces apart
 *  with "\u0001", so the words between the figures are looked for in order and the figures are not. */
const PHRASES = ([root, sub]) => {
  const out = [];
  const top = document.querySelector(root);
  const el = top && sub ? top.querySelector(sub) : top;
  if (!el) return out;
  const walk = (n) => {
    if (n.nodeType === 1 && ["STYLE", "SCRIPT", "svg"].includes(n.tagName)) return;
    if (n.nodeType === 1 && getComputedStyle(n).display === "none") return;
    const own = Array.from(n.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean).join("\u0001");
    if (own) out.push(own);
    for (const c of n.children || []) walk(c);
  };
  walk(el);
  return out;
};
const TEXT = (root) => { const el = document.querySelector(root); return el ? el.innerText.replace(/\s+/g, " ") : ""; };

/** A colour, named by every token of the palette that has it ("blue|action"); anything else stays as it is. */
function tokenNamer(theme) {
  const P = PALETTES[theme];
  const rgbOf = (v) => {
    if (typeof v !== "string") return null;
    if (v.startsWith("#")) { const n = parseInt(v.slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; }
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(v); return m ? `${m[1]}, ${m[2]}, ${m[3]}` : null;
  };
  const byRgb = {};
  for (const [k, v] of Object.entries(P)) { const c = rgbOf(v); if (c && !k.endsWith("Deep")) (byRgb[c] = byRgb[c] || []).push(k); }
  return (css) => {
    if (!css || css === "0") return css;
    if (css === "rgba(0, 0, 0, 0)" || css === "transparent") return "none";
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(css);
    if (!m) return css;
    const name = (byRgb[`${m[1]}, ${m[2]}, ${m[3]}`] || [`rgb(${m[1]},${m[2]},${m[3]})`]).join("|");
    return m[4] != null && m[4] !== "1" ? `${name}@${(+m[4]).toFixed(2)}` : name;
  };
}
/** Two names for one colour ("blue|action") match when they share a token and the same alpha. */
const same = (a, b) => {
  if (a === b) return true;
  const [an, aa = "1"] = String(a).split("@"), [bn, ba = "1"] = String(b).split("@");
  return aa === ba && an.split("|").some((t) => bn.split("|").includes(t));
};
const collapse = (arr) => (arr.every((x) => x === arr[0]) ? arr[0] : arr.join(" "));

function compare(pair, b, a, name) {
  const lines = [];
  const props = pair.p || ["size", "weight", "family", "color", "bg", "border", "radius", "padding", "minh", "gap"];
  const fontProps = new Set(["size", "weight", "family", "color"]);
  for (const k of props) {
    if (fontProps.has(k) && !b.own && !(pair.p || []).includes(k)) continue;
    if (k === "padding" && b.uaPadding) continue;
    let bv, av;
    if (k === "color" || k === "bg") { bv = name(b[k]); av = name(a[k]); }
    else if (k === "border") { bv = collapse(b.border.map((x) => x === "0" ? "0" : x.replace(/rgba?\([^)]*\)/, (c) => name(c)))); av = collapse(a.border.map((x) => x === "0" ? "0" : x.replace(/rgba?\([^)]*\)/, (c) => name(c)))); }
    else if (k === "radius" || k === "padding") { bv = collapse(b[k]); av = collapse(a[k]); }
    else if (k === "weight") { bv = +b.weight >= 600 ? "bold" : "regular"; av = +a.weight >= 600 ? "bold" : "regular"; }
    else if (k === "minh") {
      if (b.minh === "auto" || b.minh === "0px") continue;
      bv = b.minh;
      const effective = Math.max(parseFloat(a.minh) || 0, a.height);
      av = a.minh !== "auto" && a.minh !== "0px" ? a.minh : `${a.height}px tall`;
      if (effective >= parseFloat(bv) && (a.minh === bv || a.minh === "auto" || a.minh === "0px")) { lines.push({ ok: true, k, bv, av }); continue; }
      if (parseFloat(bv) < 44 && effective >= 44) { lines.push({ ok: false, k, bv, av, why: TAP_RULE }); continue; }
    }
    else { bv = b[k]; av = a[k]; }
    const ok = k === "color" || k === "bg" ? same(bv, av)
      : k === "border" ? bv.split(" ").length === av.split(" ").length && bv.split(" ").every((x, i) => same(x, av.split(" ")[i]))
      : String(bv) === String(av);
    lines.push({ ok, k, bv, av, why: ok ? null : (pair.why && (pair.why[k] || pair.why["*"])) || null });
  }
  return lines;
}

const allResults = [];
const h = await openHarness();
try {
  for (const theme of themes) {
    const name = tokenNamer(theme);
    for (const screen of want) {
      const S = SCREENS[screen];
      const out = [];
      // ---- the board
      const bp = await h.browser.newPage({ deviceScaleFactor: 1 });
      const { w, h: bh } = await mountMockup(bp, screen, theme);
      const bRoot = "#mount";
      // ---- the app
      const { ctx, page, errors } = await h.open(S.mode || "app+all", theme, { width: 390, height: 844 });
      let navErr = null;
      try { if (S.go) await S.go(page, h); } catch (e) { navErr = String(e.message || e); }
      if (navErr) out.push({ ok: false, name: "Reach the screen", detail: navErr });
      const aRoot = S.root || "#root";
      for (const pair of S.pairs || []) {
        const b = await bp.evaluate(RECORD, [bRoot, pair.b]);
        const a = await page.evaluate(RECORD, [aRoot, pair.a]);
        if (!b) { out.push({ ok: false, name: `${pair.n} · board element`, detail: `no "${pair.b}" on the board` }); continue; }
        if (!a) { out.push({ ok: false, name: `${pair.n} · app element`, detail: `no "${pair.a}" on the app's screen`, why: pair.whyMissing || null }); continue; }
        for (const r of compare(pair, b, a, name)) {
          out.push({ ok: r.ok, name: `${pair.n} · ${r.k}`, detail: r.ok ? `${r.av}` : `board ${r.bv} · app ${r.av}`, why: r.why });
        }
      }
      // ---- the words
      const phrases = Array.from(new Set(await bp.evaluate(PHRASES, [bRoot, S.bWords || null])));
      const appText = await page.evaluate(TEXT, aRoot);
      const inOrder = (parts) => { let at = 0; for (const x of parts) { const i = appText.indexOf(x, at); if (i < 0) return false; at = i + x.length; } return true; };
      for (const raw of phrases) {
        const parts = raw.split("\u0001");
        const ph = parts.join(" … ");
        if (/\d/.test(ph) || ph.length < 2 || /^[ⓘ▾▴›‹·•●☆★⇅≈↑↓→✓✗⚠▲▼−+\-–]+$/.test(ph)) continue;
        const skip = (S.skipWords || []).find(([re]) => re.test(ph));
        if (skip) { out.push({ ok: true, skip: true, name: `Words · «${ph}»`, detail: `not looked for: ${skip[1]}` }); continue; }
        // A piece of one punctuation mark between two figures ("." after "$21") is not a phrase of its own.
        const ok = inOrder(parts.filter((x) => x.replace(/[.,:;·\s]/g, "").length > 0));
        out.push({ ok, name: `Words · «${ph}»`, detail: ok ? "on the screen" : "not on the app's screen", why: ok ? null : null });
      }
      // ---- sideways
      const sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
      out.push({ ok: !sideways, name: "Nothing scrolls sideways at 390px", detail: sideways ? "it does" : "" });
      if (errors.length) out.push({ ok: false, name: "No page errors", detail: errors.join(" | ") });
      // ---- the side-by-side picture
      if (SHOTS) {
        mkdirSync(OUT, { recursive: true });
        const bpng = await bp.screenshot({ clip: { x: 0, y: 0, width: w, height: bh }, fullPage: bh > 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const full = await page.evaluate(() => document.scrollingElement.scrollHeight);
        await page.setViewportSize({ width: 390, height: Math.max(844, Math.min(bh, full)) });
        await page.waitForTimeout(300);
        const apng = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: bh }, fullPage: true });
        const cp = await h.browser.newPage({ viewport: { width: 2 * 390 + 24, height: bh }, deviceScaleFactor: 1 });
        await cp.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;align-items:flex-start">
          <img src="data:image/png;base64,${bpng.toString("base64")}" style="width:390px;height:${bh}px">
          <img src="data:image/png;base64,${apng.toString("base64")}" style="width:390px;height:${bh}px"></body>`);
        await cp.screenshot({ path: join(OUT, `${screen}${theme === "light" ? "-light" : ""}.png`), clip: { x: 0, y: 0, width: 2 * 390 + 24, height: bh }, fullPage: true });
        await cp.close();
      }
      await ctx.close(); await bp.close();
      const bad = out.filter((r) => !r.ok && !r.why).length;
      const ruled = out.filter((r) => !r.ok && r.why).length;
      console.log(`\n== ${screen} · ${theme} — ${out.filter((r) => r.ok && !r.skip).length} ✓ · ${ruled} ✗ explained · ${bad} ✗ · ${out.filter((r) => r.skip).length} words skipped`);
      for (const r of out) {
        if (QUIET && r.ok) continue;
        if (r.skip && !process.env.SHOW_SKIPS && QUIET) continue;
        const tag = r.why && /^left:/.test(r.why) ? ` · ${r.why}` : ` · rule: ${r.why}`;
        console.log(`${r.skip ? "–" : r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}${!r.ok && r.why ? tag : ""}`);
      }
      allResults.push(...out.map((r) => ({ ...r, screen, theme })));
    }
  }
} finally {
  await h.close();
}
const fails = allResults.filter((r) => !r.ok && !r.why);
const ruled = allResults.filter((r) => !r.ok && r.why);
const skipped = allResults.filter((r) => r.skip).length;
const left = ruled.filter((r) => /^left:/.test(r.why));
if (left.length) {
  console.log(`\nLEFT AS THEY ARE, EACH WITH ITS REASON (${left.length}):`);
  for (const r of left) console.log(`  ✗ ${r.screen} · ${r.theme} · ${r.name} — ${r.why.replace(/^left:\s*/, "")}`);
}
console.log(`\n${allResults.length - fails.length - ruled.length - skipped} ✓ · ${skipped} board words skipped (each with its reason) · ${ruled.length - left.length} ✗ explained by a README rule · ${left.length} ✗ left with a reason · ${fails.length} ✗ unexplained (${want.join(", ")}; ${themes.join(", ")}).`);
if (flag("json")) writeFileSync(flag("json"), JSON.stringify(allResults, null, 1));
process.exit(fails.length ? 1 : 0);
