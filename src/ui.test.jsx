// ============================================================================
// src/ui.test.jsx — THE DESIGN-SYSTEM FOUNDATION, AND THE SWEEP THAT KEEPS IT (PR #45, TASKS 2 AND 5).
//
// Measured on 2 Oct 2026, before `ui.jsx`: 23 font sizes (67% of uses under 12px), 402 mono spreads against 15 sans,
// 57 padding values, 13 radii, Btn ×2, Panel ×2, Lbl ×3, Stat ×3 copies, and the mono stack defined in 8 files.
//
// The migrated files — `ui.jsx`, `card.jsx`, `find.jsx` — read their atoms from `ui.jsx` and their sizes from the
// type tokens. This fails the build on a `fontSize` literal or a local copy of an atom in any of them, so a later
// session cannot quietly paste a Btn back. Other screens keep their copies until PR #47; they are NOT swept here.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TYPE } from "./theme.js";
import { RangeField, Btn, Chip, Fold, histogram, clampTo, TAP, mono, sans } from "./ui.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 200)}"`); };

/* ====================================================================
   THE TYPE TOKENS: FIVE SIZES, TWO WEIGHTS, TWO LINE HEIGHTS, NOTHING UNDER 12
==================================================================== */
check("THE TYPE TOKENS ARE FIVE SIZES, TWO WEIGHTS AND TWO LINE HEIGHTS, AND NONE IS UNDER 12px", () => {
  eq(Object.values(TYPE.size), [12, 13, 15, 18, 24], "sizes");
  eq(Object.keys(TYPE.weight).length, 2, "weights");
  eq(Object.keys(TYPE.line).length, 2, "line heights");
  if (Math.min(...Object.values(TYPE.size)) < 12) throw new Error("a size under 12px");
  if (!Object.isFrozen(TYPE) || !Object.isFrozen(TYPE.size)) throw new Error("a token a screen can overwrite is not a token");
});

check("MONO AND SANS ARE DEFINED ONCE, HERE", () => {
  has(mono.fontFamily, "monospace"); has(sans.fontFamily, "system-ui");
  eq(TAP, 44, "the least a touch target is");
});

/* ====================================================================
   THE ATOMS
==================================================================== */
check("EVERY BUTTON AND CHIP IS 44px TALL, AND A CHIP SAYS WHETHER IT IS ON", () => {
  for (const html of [renderToStaticMarkup(<Btn>x</Btn>), renderToStaticMarkup(<Btn small ghost>x</Btn>),
    renderToStaticMarkup(<Chip on>x</Chip>), renderToStaticMarkup(<Chip>x</Chip>)]) {
    has(html, "min-height:44px");
  }
  has(renderToStaticMarkup(<Chip on>x</Chip>), 'aria-pressed="true"');
  has(renderToStaticMarkup(<Chip>x</Chip>), 'aria-pressed="false"');
});

check("THE FOLD HIDES ITS CHILDREN AND SAYS SO TO A SCREEN READER", () => {
  const html = renderToStaticMarkup(<Fold summary="Per contract" label="figures"><i>HIDDEN</i></Fold>);
  has(html, 'aria-expanded="false"'); has(html, "figures ▼");
  if (html.includes("HIDDEN")) throw new Error("a closed fold printed its children");
  eq(renderToStaticMarkup(<Fold summary="">x</Fold>), "", "no summary, no fold");
});

/* ====================================================================
   THE RANGE FIELD
==================================================================== */
check("histogram(): counts per bin, the ends take what is outside, and unknown is not a bin", () => {
  const h = histogram([0, 0.5, 1, 1, 2, -3, null, undefined, NaN, "x"], { min: 0, max: 1, bins: 4 });
  eq(h, [2, 0, 1, 3], "bins");        // 0 and -3 → the first; .5 → the third; 1, 1 and 2 → the last
  eq(histogram([], { min: 0, max: 1, bins: 3 }), [0, 0, 0], "empty");
  eq(histogram([1, 2], { min: 5, max: 5, bins: 3 }), [0, 0, 0], "no range, no bins");
});

check("clampTo(): a non-number is not zero", () => {
  eq(clampTo("54", 20, 80), 54, "a typed string"); eq(clampTo(99, 20, 80), 80, "over"); eq(clampTo(1, 20, 80), 20, "under");
  for (const bad of [null, undefined, "", "abc", NaN, true]) eq(clampTo(bad, 20, 80), null, String(bad));
});

const FIELD = { label: "Chance at least", value: 0.5, onChange: () => {}, min: 0.2, max: 0.8, step: 0.05,
  format: (v) => `${Math.round(v * 100)}%`, parse: (t) => Number(t) / 100, toInput: (v) => String(Math.round(v * 100)) };

check("A RANGE FIELD HAS A LABEL, A TAPPABLE VALUE, A 44px SLIDER, ITS TWO ENDS AND A VALUE TEXT", () => {
  const html = renderToStaticMarkup(<RangeField {...FIELD} />);
  has(html, ">Chance at least<"); has(html, ">50%<");
  has(html, 'min="0.2"'); has(html, 'max="0.8"'); has(html, 'step="0.05"'); has(html, 'value="0.5"');
  has(html, 'aria-valuetext="50%"');
  has(html, "height:44px");
  has(html, "Tap to type an exact number");
  has(html, ">20%<"); has(html, ">80%<");
  // The label belongs to the slider, so a screen reader reads "Chance at least, slider".
  const id = (html.match(/<input id="([^"]+)"/) || [])[1];
  if (!id || !html.includes(`for="${id}"`)) throw new Error("the label is not tied to the slider");
});

check("THE HISTOGRAM AND 'N pass' APPEAR ONLY WHEN THERE IS SOMETHING TO COUNT", () => {
  const bare = renderToStaticMarkup(<RangeField {...FIELD} />);
  if (bare.includes('aria-hidden="true"') || bare.includes(" pass")) throw new Error("a histogram of nothing");
  const html = renderToStaticMarkup(<RangeField {...FIELD} values={[0.3, 0.45, 0.45, 0.7]} pass={2} />);
  has(html, 'aria-hidden="true"'); has(html, "2</span> pass");
  // 20 bars and the threshold line.
  eq((html.match(/<div style="flex:1/g) || []).length, 20, "bars");
});

check("THE THRESHOLD MARK SITS WHERE THE VALUE IS, AND 'below' COLOURS THE OTHER SIDE", () => {
  const at = (v) => Math.round(+renderToStaticMarkup(<RangeField {...FIELD} value={v} values={[0.5]} />).match(/left:([\d.]+)%;top:0/)[1]);
  eq(at(0.2), 0, "the bottom"); eq(at(0.8), 100, "the top"); eq(at(0.5), 50, "the middle");
  const above = renderToStaticMarkup(<RangeField {...FIELD} value={0.3} values={[0.7]} passWhen="above" />);
  const below = renderToStaticMarkup(<RangeField {...FIELD} value={0.3} values={[0.7]} passWhen="below" />);
  if (above === below) throw new Error("passWhen changes nothing");
});

check("A VALUE THE SLIDER CANNOT HOLD IS CLAMPED INTO IT, AND NO VALUE IS A DASH, NEVER A ZERO", () => {
  has(renderToStaticMarkup(<RangeField {...FIELD} value={9} />), ">80%<");
  const none = renderToStaticMarkup(<RangeField {...FIELD} value={null} />);
  has(none, ">—<");
  if (none.includes(">0%<")) throw new Error("no value printed as 0%");
});

check("A RANGE THAT HAS NO WIDTH SAYS SO INSTEAD OF DRAWING A SLIDER THAT CANNOT MOVE", () => {
  const html = renderToStaticMarkup(<RangeField {...FIELD} min={5} max={5} note="no room to move" />);
  if (html.includes('type="range"')) throw new Error("a slider with nothing to slide");
  has(html, "no room to move");
});

/* ====================================================================
   THE SWEEP: NO fontSize LITERAL AND NO LOCAL ATOM COPY IN A MIGRATED FILE
==================================================================== */
// PR #47: the Positions segment's new files and the bottom bar are built on the atoms and tokens from day one.
// PR #48: the sweep of the remaining screens adds each file as it is migrated, one commit per file.
const MIGRATED = ["src/ui.jsx", "src/card.jsx", "src/find.jsx", "src/orders.jsx", "src/positions.jsx", "src/navBar.jsx",
  "src/steps.jsx", "src/why.jsx"];
const stripped = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const ATOMS = ["Btn", "Panel", "Lbl", "Label", "Stat", "Chip", "Fold", "RangeField", "Note", "NumberInput", "TextArea", "CheckField", "Info", "Segments"];

/** What a migrated file may not contain, as findings (so the sweep itself can be shown to fail). */
function offences(src, { isHome }) {
  const found = [];
  for (const m of src.matchAll(/fontSize\s*[:=]\s*\{?\s*[\d.]+/g)) found.push(`a fontSize literal: ${m[0]}`);
  if (!isHome) {
    for (const m of src.matchAll(/\b(?:const|let|var)\s+(mono|sans|sansUI)\s*=/g)) found.push(`a local ${m[1]} stack`);
    if (/ui-monospace|system-ui|ui-sans-serif/.test(src)) found.push("a font-family string (the stacks live in ui.jsx)");
    for (const a of ATOMS) {
      if (new RegExp(`\\b(?:const|let|var)\\s+${a}\\s*=|\\bfunction\\s+${a}\\s*\\(`).test(src)) found.push(`a local copy of ${a}`);
    }
  }
  return found;
}

check("THE MIGRATED FILES USE TOKENS ONLY: no fontSize literal, no local stack, no local atom", () => {
  const all = [];
  for (const f of MIGRATED) for (const o of offences(stripped(f), { isHome: f === "src/ui.jsx" })) all.push(`${f}: ${o}`);
  eq(all, [], "offences");
});

check("…AND THE SWEEP CAN SEE ONE: a pasted Btn, a literal size and a copied stack are all caught", () => {
  const dirty = `const mono = { fontFamily: "ui-monospace, Menlo" };\nconst Btn = () => <button style={{ fontSize: 11 }} />;\nconst x = <b style={{ fontSize: 13 }} />;`;
  const o = offences(dirty, { isHome: false });
  for (const want of ["a local mono stack", "a local copy of Btn", "a fontSize literal: fontSize: 11", "a fontSize literal: fontSize: 13", "a font-family string"]) {
    if (!o.some((x) => x.startsWith(want))) throw new Error(`the sweep missed: ${want} (saw ${JSON.stringify(o)})`);
  }
  eq(offences(`const a = <i style={{ fontSize: FS.xs }} />;`, { isHome: false }), [], "a token is not a literal");
});

check("THE CARD AND FIND IMPORT THEIR ATOMS FROM ui.jsx", () => {
  for (const f of ["src/card.jsx", "src/find.jsx"]) {
    if (!/from "\.\/ui\.jsx"/.test(readFileSync(f, "utf8"))) throw new Error(`${f} does not import ui.jsx`);
  }
  // The Fold is ONE component now: steps.jsx re-exports it rather than keeping a second.
  const steps = stripped("src/steps.jsx");
  if (/function Fold\b/.test(steps)) throw new Error("steps.jsx still defines its own Fold");
  has(steps, 'export { Fold } from "./ui.jsx"');
});

check("OTHER SCREENS ARE NOT PRETENDED TO BE MIGRATED: their copies are still theirs (PR #47)", () => {
  // This is a statement of scope, held so a later reader does not mistake the sweep for the whole app.
  for (const f of ["src/App.jsx", "src/pro.jsx", "src/positionCard.jsx"]) {
    if (MIGRATED.includes(f)) throw new Error(`${f} is swept but not migrated`);
  }
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
