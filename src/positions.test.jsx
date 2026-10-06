// PR #47, TASKS 1, 2 and 4 — the account strip, the segment bar, the "Not in the app" card and the bottom bar, rendered.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AccountStrip, PositionsBar, PositionsHeader, WorkingCloseLine, buyingPowerOf } from "./positions.jsx";
import { BottomBar, placeOf, NAV_PLACES, NAV_BAR_H } from "./navBar.jsx";
import { UnrecordedCard } from "./pro.jsx";
import { workingCloseText } from "./orderRow.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); } catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasnt = (h, s) => { if (String(h).includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const ACC = { account_number: "PA1", equity: "102430.12", buying_power: "180000", options_buying_power: "97500" };

check("THE STRIP: equity, the OPTIONS buying power when Alpaca sends it (its ⓘ says which), AT RISK $X of $Y", () => {
  const h = renderToStaticMarkup(<AccountStrip account={ACC} risk={{ openRisk: 9500, total: 25000 }} capital={100000} />);
  has(h, "EQUITY"); has(h, "$102,430");
  // Redesign PR 3 (the board "Positions"): the label is BUYING POWER either way; the ⓘ sentence names the figure.
  has(h, ">BUYING POWER"); has(h, "$97,500"); hasnt(h, "$180,000");
  has(h, "AT RISK"); has(h, "$9,500"); has(h, "of $25,000");
  for (const k of ["equity", "buying power", "at risk"]) has(h, `What ${k} is`);
  hasnt(h, 'role="note"');   // one ⓘ open at a time, none at rest
  has(readFileSync("src/positions.jsx", "utf8"), "This is Alpaca's options figure, the one it checks an options order against.");
  const plain = renderToStaticMarkup(<AccountStrip account={{ ...ACC, options_buying_power: undefined }} risk={null} />);
  has(plain, ">BUYING POWER"); has(plain, "$180,000");
  eq(buyingPowerOf(null).value, null, "no account, no figure");
  eq(buyingPowerOf({ buying_power: "" }).value, null, "an empty string is not zero");
});

check("…under free sizing AT RISK says 'no limit applied'; unread figures are dashes", () => {
  const h = renderToStaticMarkup(<AccountStrip account={null} risk={{ openRisk: 4500, total: 25000, sizingFree: true }} />);
  has(h, "no limit"); hasnt(h, "of $25,000");
  if ((h.match(/—/g) || []).length < 2) throw new Error("equity and buying power should read —");
});

check("THE ⓘ SENTENCES ARE SOURCED IN THE CODE, and say limits come from the capital, not equity", () => {
  const src = readFileSync("src/positions.jsx", "utf8");
  has(src, "cash + long_market_value + short_market_value");
  has(src, "options_buying_power");
  has(src, "Your limits come from the capital you set in Settings (");
  has(src, "not from equity.");
});

check("THE BAR: Positions | Orders with counts; the one refresh icon is the header's ↻ beside the gear (the board)", () => {
  const h = renderToStaticMarkup(<PositionsBar seg="orders" holdings={2} orders={1} onSeg={() => {}} />);
  has(h, "Positions"); has(h, "Orders"); has(h, 'aria-pressed="true"'); hasnt(h, "Read Alpaca again");
  const head = renderToStaticMarkup(<PositionsHeader onRefresh={() => {}} onSettings={() => {}} />);
  has(head, "<h1"); has(head, ">Positions</h1>"); has(head, 'aria-label="Read Alpaca again"'); has(head, 'aria-label="Settings"');
});

check("THE CARD'S LINE WHILE ITS CLOSE WORKS: 'Close working at $7.62 · 0 of 9 · <clock>' and Manage order", () => {
  eq(workingCloseText("$7.62 credit · GTC · 0 of 9"), "Close working at $7.62 · 0 of 9", "from the row's terms");
  const h = renderToStaticMarkup(<WorkingCloseLine line="Close working at $7.62 · 0 of 9" clockLine="Market closed · opens Mon 15:30 your time" onManage={() => {}} />);
  has(h, "Close working at $7.62 · 0 of 9"); has(h, "Market closed · opens Mon 15:30 your time"); has(h, ">Manage order<");
});

check("A HOLDING WITH NO RECORD: 'Not in the app', Import, and its one close (path 3)", () => {
  const g = { key: "SLV 2026-11-20", ticker: "SLV", expKey: "2026-11-20", pl: -40,
    items: [{ symbol: "SLV261120C00030000", qty: "2", avg_entry_price: "1.00", current_price: "0.80" }] };
  const h = renderToStaticMarkup(<UnrecordedCard group={g} gate={() => ({ pass: true })} onImport={() => {}} />);
  has(h, "Not in the app"); has(h, ">Import<"); has(h, ">Close at limit<"); has(h, "SLV 2026-11-20");
});

check("THE BOTTOM BAR: Find · Build · Positions · Journal, aria-current, 44px, the badge, above the badge strip", () => {
  eq(NAV_PLACES.map((p) => p.label).join(" · "), "Find · Build · Positions · Journal", "four places");
  const h = renderToStaticMarkup(<BottomBar current="positions" badge={2} onGo={() => {}} />);
  eq((h.match(/aria-current="page"/g) || []).length, 1, "one current");
  has(h, "Positions, 2 to look at");
  has(h, "env(safe-area-inset-bottom");
  if (NAV_BAR_H - 10 < 44) throw new Error("targets under 44px");
  eq(placeOf({ tab: "watching", step: "find" }), "find", "Saved is part of Find");
  eq(placeOf({ tab: "build", step: "build" }), "build", "Build");
  eq(placeOf({ tab: "positions", step: "find" }), "positions", "Positions");
  eq(placeOf({ tab: "build", step: "find", showSettings: true }), null, "Settings is none of the four");
});

check("THE APP: no StepNav and no places row; the bar is mounted, and Integrations lives in Settings", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  hasnt(app, "<StepNav"); hasnt(app, "OTHER_PLACES");
  has(app, "<BottomBar"); has(app, "CONNECTIONS"); hasnt(app, "> INTEGRATIONS<"); hasnt(app, "<AlpacaDesk");
  has(app, "BADGE_SAFE + NAV_BAR_H");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
