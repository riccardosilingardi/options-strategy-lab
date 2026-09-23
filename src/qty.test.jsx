// The quantity fields must be editable on a phone: deleting the "1" leaves an
// empty field, not a 1 written straight back. Covers `readQty` (pure), the
// `QtyField` component driven through its own handlers, and the ticket's Send
// refusing an empty or invalid quantity in words.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { QtyField, OrderTicket, readQty } from "./pro.jsx";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };

/* ---- the pure reading ---- */
check("readQty: empty is invalid, never 1", () => {
  const r = readQty("", 1, 20);
  eq(r.ok, false, "ok"); eq(r.value, null, "value");
});
check("readQty: '3' reads 3, in range", () => {
  const r = readQty("3", 1, 20);
  eq(r.ok, true, "ok"); eq(r.value, 3, "value"); eq(r.inRange, true, "inRange");
});
check("readQty: non-numeric is invalid", () => { eq(readQty("2a", 1, 10).ok, false, "ok"); eq(readQty("1.5", 1, 10).ok, false, "ok"); });
check("readQty: out of range clamps (ticket 1–20, leg 1–10)", () => {
  eq(readQty("25", 1, 20).clamped, 20, "ticket high"); eq(readQty("0", 1, 20).clamped, 1, "ticket low");
  eq(readQty("12", 1, 10).clamped, 10, "leg high"); eq(readQty("12", 1, 10).inRange, false, "leg inRange");
});

/* ---- the component, driven through its own handlers ----
   No DOM library in this repository, so React's `useState` / `useEffect` are
   stubbed for the duration of these calls: the component is called as a
   function, its input's handlers are invoked, and it is called again. */
function mount(props) {
  const cells = []; let i = 0;
  const realState = React.useState, realEffect = React.useEffect;
  const render = () => {
    i = 0;
    React.useState = (init) => { const k = i++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; };
    React.useEffect = () => {};
    try { return QtyField(props); } finally { React.useState = realState; React.useEffect = realEffect; }
  };
  return render;
}

check('type "", then "3", read 3 — and never 1 in between', () => {
  const values = [], validity = [];
  const render = mount({ value: 1, min: 1, max: 20, onValue: (n) => values.push(n), onValidity: (v, note) => validity.push([v, note]) });
  let el = render();
  eq(el.props.value, "1", "initial text");
  el.props.onChange({ target: { value: "" } });
  el = render();
  eq(el.props.value, "", "text after deleting");
  eq(values.length, 0, "nothing handed up while empty");
  eq(validity[validity.length - 1][0], false, "empty is reported invalid");
  el.props.onChange({ target: { value: "3" } });
  el = render();
  eq(el.props.value, "3", "text after typing 3");
  eq(values[values.length - 1], 3, "value handed up");
  eq(validity[validity.length - 1][0], true, "3 is valid");
});

check("blur on an empty field keeps it empty and invalid", () => {
  const values = [], validity = [];
  const render = mount({ value: 2, min: 1, max: 10, onValue: (n) => values.push(n), onValidity: (v) => validity.push(v) });
  let el = render();
  el.props.onChange({ target: { value: "" } });
  el = render(); el.props.onBlur();
  el = render();
  eq(el.props.value, "", "still empty after blur");
  eq(values.length, 0, "no silent 1");
  eq(validity[validity.length - 1], false, "still invalid");
});

check("out of range clamps on blur only (leg 1–10)", () => {
  const values = [];
  const render = mount({ value: 1, min: 1, max: 10, onValue: (n) => values.push(n), onValidity: () => {} });
  let el = render();
  el.props.onChange({ target: { value: "15" } });
  el = render();
  eq(el.props.value, "15", "typed text kept while typing");
  eq(values.length, 0, "nothing handed up before blur");
  el.props.onBlur();
  el = render();
  eq(el.props.value, "10", "clamped on blur");
  eq(values[values.length - 1], 10, "clamped value handed up");
});

check("the field opens the numeric keypad and is not type=number", () => {
  const h = renderToStaticMarkup(<QtyField value={1} min={1} max={20} />);
  has(h, 'inputMode="numeric"'); has(h, 'type="text"');
});

/* ---- the ticket refuses to send without a quantity ---- */
const LEGS = [{ side: 1, qty: 1, type: "call", strike: 19 }, { side: -1, qty: 1, type: "call", strike: 19.5 }];
const PASS = () => ({ pass: true, violations: [], warnings: [] });
check("an invalid leg quantity disables Send with a short message", () => {
  const h = renderToStaticMarkup(
    <OrderTicket legs={LEGS} expKey="2026-09-18" ticker="BOIL" estNet={1.45} setMsg={() => {}}
      gate={PASS} dte={40} maxLoss={-145} maxProfit={105} qtyBlock="Leg 2: Enter a quantity (1–10)" />);
  has(h, "Leg 2: Enter a quantity (1–10)");
  if (/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Leg 2: Enter a quantity/.test(h) === false) throw new Error("Send is not disabled");
});

/* ---- the old coercion is gone from both inputs (read from the repo root: this file is bundled to CJS, where import.meta.url is not a URL) ---- */
check("no `Number(v) || 1` coercion on either quantity input", () => {
  const pro = readFileSync("src/pro.jsx", "utf8");
  const app = readFileSync("src/App.jsx", "utf8");
  if (/setQty\s*=\s*\(v\)/.test(pro)) throw new Error("pro.jsx still coerces the ticket quantity per keystroke");
  if (/updLeg\(i, "qty", Math\.max\(1,/.test(app)) throw new Error("App.jsx still coerces the leg quantity per keystroke");
});

console.log(`${ok.length} passed, ${bad.length} failed`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
