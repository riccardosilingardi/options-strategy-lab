// src/preview.test.jsx — A DEPLOY PREVIEW, RENDERED (redesign PR 2, TASK 0a).
//
// This file is bundled with `__OSL_DEPLOY_CONTEXT__` = "deploy-preview" (scripts/test-jsx.mjs, PREVIEW_FILES), the
// stamp vite.config.js writes on a Netlify preview build. Every control that writes or sends must render disabled
// with the sentence under it: Send (the ticket and Build's Send), Close at limit, File in
// Journal, Modify, Cancel, Cancel all, the exit rungs. The server refuses on its own (src/deploy.test.js); this is
// the screen saying so before the tap.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PREVIEW, PREVIEW_READ_ONLY, BUILD_CONTEXT } from "./deploy.js";
import { OrdersPanel, OrderRow } from "./orders.jsx";
import { PositionCard } from "./positionCard.jsx";
import { StatusBlock } from "./positionScreen.jsx";
import { SendBar } from "./build.jsx";
import { takeProfitTarget } from "./rules.js";
import { exitProgress, entryVsNow } from "./positionView.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s) => { if (!h.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const SENTENCE = PREVIEW_READ_ONLY;
/** Every <button …>label</button> whose label is `label`, with its attributes. */
const buttons = (h, label) => [...h.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
  .filter((m) => m[2].replace(/<[^>]+>/g, "").trim() === label).map((m) => m[1]);
const allDisabled = (h, label) => {
  const b = buttons(h, label);
  if (!b.length) throw new Error(`no "${label}" button`);
  for (const a of b) if (!/\bdisabled=""/.test(a)) throw new Error(`"${label}" is not disabled`);
};

const SYM = "GDX261030P00094000";
const ORDER = { id: "b2c3d4e5-0000-4000-8000-000000000001", symbol: SYM, qty: "9", filled_qty: "0", side: "sell",
  type: "limit", limit_price: "7.62", time_in_force: "gtc", status: "new", position_intent: "sell_to_close",
  submitted_at: "2026-10-01T13:31:02Z" };
const ctx = { positions: [{ symbol: SYM, qty: "9" }], orders: [ORDER], chainFor: () => null, demo: false, recordFor: () => ({ ref: "J-0001" }) };

console.log("\nTASK 0a — a deploy preview, rendered\n");

check("this bundle is stamped as a preview", () => {
  if (BUILD_CONTEXT !== "deploy-preview" || PREVIEW !== true) throw new Error(`stamp ${BUILD_CONTEXT}, PREVIEW ${PREVIEW}`);
});

check("an order row: Modify and Cancel are disabled, with the sentence under them; History still opens", () => {
  const h = renderToStaticMarkup(<OrderRow order={ORDER} ctx={ctx} />);
  allDisabled(h, "Modify");
  allDisabled(h, "Cancel");
  if (buttons(h, "History").some((a) => /\bdisabled=""/.test(a))) throw new Error("History is a read and stays open");
  has(h, SENTENCE);
});

check("the Orders segment: Cancel all is disabled, with the sentence", () => {
  const h = renderToStaticMarkup(<OrdersPanel orders={[ORDER]} ctx={ctx} />);
  allDisabled(h, "Cancel all");
  has(h, SENTENCE);
});

check("a position card: Close at limit and File in Journal are disabled, with the sentence; its title still opens the screen", () => {
  // J-0001 as positionCard.test.jsx draws it.
  const NOW = Date.parse("2026-10-02T12:00:00Z");
  const J1 = { id: 1, ref: "J-0001", ticker: "GDX", name: "Imported from Alpaca", expKey: "2026-10-30", expiry: "2026-10-30",
    legs: [{ side: 1, type: "put", strike: 94, qty: 1 }], entryNet: 5, entrySpot: 100, contracts: 9,
    openedAt: "2026-09-22T14:00:00Z", maxProfit: 8900, maxLoss: -500, alpacaHeld: true, thesis: { pop: null }, timeline: [] };
  const tpTarget = takeProfitTarget({ legs: J1.legs, maxProfit: J1.maxProfit, maxLoss: J1.maxLoss, entryNet: J1.entryNet, contracts: 9 });
  const h = renderToStaticMarkup(
    <PositionCard p={J1} title="GDX 94 put" action="CLOSE" line="Take profit reached." notes={[]} pnl={2925} shareText="+65%"
      progress={exitProgress({ p: J1, pnl: 2925, dteLeft: 28, tpTarget, n: 9, now: NOW })}
      ev={entryVsNow({ p: J1, n: 9, pnl: 2925, popNow: 0.6, nowSignals: null })}
      closeLabel="Close at limit" fileKind="gone" onClose={() => {}} onFile={() => {}} onDetails={() => {}} />);
  allDisabled(h, "Close at limit");
  allDisabled(h, "File in Journal");
  const open = buttons(h, "GDX 94 put");
  if (!open.length || open.some((a) => /\bdisabled=""/.test(a))) throw new Error("the title opens the position's screen, a read, and stays open");
  has(h, SENTENCE);
});

// REDESIGN PR 3 (TASK 3): the position's screen writes one thing, a "Keep it" reason on the timeline; a preview keeps
// nothing, and its Close at limit sends nothing.
check("the position's screen: Close at limit and Keep it, write why are disabled, with the sentence", () => {
  const act = { action: "WARNING", kind: "stop", line: "Stop threshold crossed.", notes: [] };
  const h = renderToStaticMarkup(<StatusBlock s={{ act, action: "WARNING", badge: "WARNING · STOP LEVEL", pnl: -153, progress: null, ref: "J-0003",
    notes: [], ruleLine: act.line, canKeep: true, onClose: () => {} }} keep={{ min: 12, onKeep: async () => ({ ok: true }) }} />);
  allDisabled(h, "Close at limit");
  allDisabled(h, "Keep it, write why");
  has(h, SENTENCE);
});

// REDESIGN PR 3 (TASK 0b): the confirm step is gone (nothing mounted it since PR 2); Build's Send is the first tap.
check("Build's Send is disabled on a preview, with the sentence (App.jsx hands it PREVIEW_READ_ONLY as its block)", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  if (!/const sendBlock = PREVIEW \? PREVIEW_READ_ONLY/.test(app)) throw new Error("Build's send block does not start with the preview");
  const h = renderToStaticMarkup(<SendBar label="Send limit order" disabled reason={SENTENCE} footer="Paper account" onSend={() => {}} />);
  allDisabled(h, "Send limit order");
  has(h, SENTENCE);
});

check("the sends that are functions, not buttons, refuse too: every order path's own check names PREVIEW", () => {
  const pro = readFileSync("src/pro.jsx", "utf8"), app = readFileSync("src/App.jsx", "utf8");
  for (const [src, what] of [[pro, "order path 2 of six"], [pro, "order path 4 of six"]]) {
    const i = src.indexOf(what);
    if (i < 0 || !src.slice(i, i + 200).includes("if (PREVIEW)")) throw new Error(`${what}: no preview check beside the demo's`);
  }
  for (const fn of ["const sendToAlpaca", "const openPaper", "const cancelWorking", "const prepareCardClose", "const closePos"]) {
    const i = app.indexOf(fn);
    if (i < 0 || !app.slice(i, i + 900).includes("if (PREVIEW)")) throw new Error(`${fn}: no preview check`);
  }
  if (!app.includes("readOnly: PREVIEW")) throw new Error("the Orders context carries readOnly");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
