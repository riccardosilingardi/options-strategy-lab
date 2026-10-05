// ============================================================================
// src/placeholder.test.jsx — THE PLACEHOLDER (redesign PR 1, TASK 1; owner's rule, 4 Oct 2026).
//
// No function in the mockups is dropped: one with no source yet is a `<Placeholder id>`, whose words are
// `PLACEHOLDERS` in rules.js. Three locks: every Placeholder in the source names an id in the list; every id in the
// list is used somewhere; and no entry's words carry a figure, so a placeholder can never pass for a reading.
// JSX tests are bundled to CJS: source files are read by repo-relative path.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { Placeholder } from "./ui.jsx";
import { PLACEHOLDERS, PLACEHOLDER_HEAD } from "./rules.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 300)}"`); };

console.log("\nTHE PLACEHOLDER — one atom, one list\n");

const SRC = readdirSync("src").filter((f) => /\.(jsx?|mjs)$/.test(f) && !/\.test\./.test(f))
  .map((f) => ({ f, code: readFileSync(`src/${f}`, "utf8") }));
const IDS = PLACEHOLDERS.map((p) => p.id);
// A use is `<Placeholder id="x"` or a placeholder id handed on as `placeholder: "x"` (a row or a line that renders one).
const USE = /<Placeholder\s+id=["']([^"']+)["']|placeholder:\s*["']([a-z0-9-]+)["']/g;
const uses = [];
for (const { f, code } of SRC) for (const m of code.matchAll(USE)) uses.push({ f, id: m[1] || m[2] });

check("THE LIST: every entry has an id, a screen, what it shows, what it needs and its PR; ids are unique", () => {
  for (const p of PLACEHOLDERS) for (const k of ["id", "screen", "shows", "needs", "pr"]) {
    if (typeof p[k] !== "string" || !p[k].trim()) throw new Error(`${p.id || "?"}: no ${k}`);
  }
  if (new Set(IDS).size !== IDS.length) throw new Error("an id is listed twice");
});

check("EVERY PLACEHOLDER IN THE SOURCE NAMES AN ID IN PLACEHOLDERS — and none is built from a variable", () => {
  for (const u of uses) if (!IDS.includes(u.id)) throw new Error(`${u.f}: unknown placeholder id "${u.id}"`);
  for (const { f, code } of SRC) {
    if (/<Placeholder\s+id=\{/.test(code)) {
      // A computed id must come from a value the regex above can see: `placeholder: "<id>"`.
      if (!/placeholder:\s*["'][a-z0-9-]+["']/.test(code)) throw new Error(`${f}: a Placeholder id from a variable no list names`);
    }
  }
});

check("EVERY ID IS USED SOMEWHERE — an id leaves the list only when its function is built", () => {
  for (const id of IDS) if (!uses.some((u) => u.id === id)) throw new Error(`"${id}" is listed but never rendered`);
});

check("NO ENTRY'S WORDS CARRY A FIGURE: no $, no %, no number with a unit", () => {
  const FIGURE = /\$|%|\d+(\.\d+)?\s*(days?|d\b|yrs?|years?|ms|kB|x\b|×|contracts?|points?|bps|minutes?|hours?|h\b)/i;
  for (const p of PLACEHOLDERS) for (const k of ["shows", "needs", "pr"]) {
    if (FIGURE.test(p[k])) throw new Error(`${p.id}.${k} carries a figure: "${p[k]}"`);
  }
});

check("THE ATOM: a dashed box in T.mut that says 'Not connected yet', what it shows, what it needs and its PR", () => {
  for (const p of PLACEHOLDERS) {
    const html = renderToStaticMarkup(<Placeholder id={p.id} />);
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/</g, "&lt;");
    has(html, PLACEHOLDER_HEAD); has(html, esc(p.shows)); has(html, esc(p.needs)); has(html, esc(p.pr));
    has(html, "dashed"); has(html, `data-placeholder="${p.id}"`);
  }
  if (renderToStaticMarkup(<Placeholder id="no-such-id" />) !== "") throw new Error("an unknown id rendered something");
});

check("IT TAKES AN ID AND NOTHING ELSE: its definition destructures `id` only", () => {
  const ui = readFileSync("src/ui.jsx", "utf8");
  has(ui, "export function Placeholder({ id })");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
