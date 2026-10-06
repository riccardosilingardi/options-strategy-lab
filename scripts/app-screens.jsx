// ============================================================================
// scripts/app-screens.jsx — THE REAL APP, ON FIXTURES (redesign PR 2, TASK 6; renamed from build-screens.jsx in PR 3).
//
// `scripts/app-harness.mjs` bundles this for the browser; shoot-build.mjs, shoot-screens.mjs and audit-screen.mjs drive
// it at 390×844. Unlike scripts/screens.jsx (which
// mounts single components), this mounts the WHOLE app — `OptionsStrategyLab`, App.jsx's default export — so what is
// photographed is the real wiring: Find → the market page → Build ›, the review sheet, the stubbed send. Every network
// call is answered here: the UNG chain is the Alpaca-shaped fixture (src/fixtures/alpaca-chain-UNG.json), the monthly
// history is avFixture's, Alpaca is a stub account on a closed market that accepts a paper order, and the copilot is a
// stubbed answer. Nothing here is a live price and nothing leaves the browser.
//
// The location hash picks the variant: #app (everything answers), #loading (Build's market never answers),
// #noquotes (Build's market answers 503 on both feeds), #empty (a board with no strikes). Flags follow a "+":
// "+all" answers every market with UNG's contracts under its own ticker (Find's ten rows; never a real price),
// "+book" puts positions, working orders and Journal records on the stub broker and in the store (scripts/book-fixture.js).
// The theme is the page's own (`osl-theme` in localStorage).
// ============================================================================
import React from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import OptionsStrategyLab from "../src/App.jsx";
import { normaliseAlpacaChain } from "../src/chain.js";
import { avMonthlyBody } from "../src/avFixture.js";
import { bookRecords, bookHoldings, bookOrders, bookJournal } from "./book-fixture.js";

const [mode, ...flags] = (location.hash || "#app").slice(1).split("+");
const ALL = flags.includes("all");
// "+reading": only three markets ever answer (Find's "Reading 10 markets · 3 done"); "+stale": every chain was read three
// days ago (the stale banner); "+poor": a $200 trading capital, so nothing fits the budget ("Nothing fits").
const BOOK = flags.includes("book");
const READING = flags.includes("reading"), STALE = flags.includes("stale"), POOR = flags.includes("poor");
const RAW = JSON.parse(readFileSync("src/fixtures/alpaca-chain-UNG.json", "utf8"));
// UNG's contracts, under whichever ticker asks (SOYB is Build's default market; its empty state needs a price).
const chainFor = (tk) => ({ ...normaliseAlpacaChain("UNG", RAW, { spot: 13.24, now: Date.now() }), ticker: tk,
  ...(STALE ? { updated: new Date(Date.now() - 3 * 86400000).toISOString() } : {}) });
/** Fixture bars: a deterministic walk to the chain's spot. Not a price. */
const BARS = (() => {
  const out = []; let p = 12.2; const d0 = Date.UTC(2026, 3, 1);
  for (let i = 0; i < 130; i++) {
    p = Math.max(5, p * (1 + 0.012 * Math.sin(i / 5) + 0.006 * Math.cos(i / 2.3)));
    const t = new Date(d0 + i * 86400000 * 1.4).toISOString().slice(0, 10);
    out.push({ time: t, open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1000 });
  }
  const k = 13.24 / out[out.length - 1].close;
  return out.map((b) => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k }));
})();
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const ANSWER = "## What would make it wrong\n\nThis trade is a bet that **UNG stays above the short strike** until expiry. " +
  "It goes wrong if natural gas falls through the lower strike before the 21-day exit: an EIA storage report showing a " +
  "bigger build than expected would do it.\n\n- Watch the weekly storage report.\n- The price trend turning down would remove one of the factors behind it.";
const sse = (text) => {
  const frames = [
    { type: "message_start" },
    ...text.match(/.{1,60}/gs).map((t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } })),
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_stop" },
  ];
  return frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join("");
};
const NEVER = () => new Promise(() => {});
let ordersPosted = 0;

window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const p = url.pathname;
  const method = (init.method || "GET").toUpperCase();
  if (window.__LOG) console.log("FETCH", method, String(input).slice(0, 120));
  if (p === "/api/state") return json({});
  if (p === "/api/chainAlpaca") {
    const sym = url.searchParams.get("sym");
    if (sym === "SOYB" && mode === "loading") return NEVER();
    if (sym === "SOYB" && mode === "noquotes") return json({ error: "fixture: no quotes" }, 503);
    // EMPTY: a price and a board with no strikes, so no default trade can be put on Build (the app presets one otherwise).
    if (sym === "SOYB" && mode === "empty") {
      const c = chainFor(sym);
      return json({ ...c, byExp: Object.fromEntries(Object.entries(c.byExp).map(([k, v]) => [k, { ...v, calls: {}, puts: {} }])) });
    }
    if (READING && !["UNG", "SOYB", "CORN"].includes(sym)) return NEVER();
    if (sym === "UNG" || sym === "SOYB" || ALL) return json(chainFor(sym));
    return json({ error: "fixture: not served" }, 503);
  }
  if (p === "/api/bars") return json({ bars: BARS, source: "fixture" });
  if (p === "/api/av") return json({ ...avMonthlyBody({ months: 195, seed: 7 }), _osl: { source: "cache", at: Date.now(), ageDays: 0, ttlDays: 7 } });
  if (p === "/api/ai") return new Response(sse(ANSWER), { status: 200, headers: { "content-type": "text/event-stream" } });
  if (p === "/api/alpaca") {
    const path = url.searchParams.get("path") || "";
    const head = { "X-OSL-Paper-Endpoint": "paper-api.alpaca.markets" };
    if (path === "/v2/account") return json({ account_number: "PA3FIXTURE", status: "ACTIVE", equity: "10000", buying_power: "20000", options_buying_power: "10000" }, 200, head);
    if (path === "/v2/clock") return json({ is_open: false, next_open: "2026-10-05T09:30:00-04:00", next_close: "2026-10-05T16:00:00-04:00" }, 200, head);
    if (path === "/v2/positions") return json(BOOK ? bookHoldings() : [], 200, head);
    if (path.startsWith("/v2/options/contracts")) return json({ option_contracts: [] }, 200, head);
    if (path.startsWith("/v2/orders") && method === "POST") {
      ordersPosted++;
      const body = JSON.parse(init.body || "{}");
      return json({ id: `fixture-order-${ordersPosted}`, status: "accepted", qty: body.qty || "1", filled_qty: "0", order_class: body.order_class || null,
        type: body.type, limit_price: body.limit_price || null, time_in_force: body.time_in_force, legs: body.legs || null,
        submitted_at: new Date().toISOString() }, 200, head);
    }
    if (path.startsWith("/v2/orders/") && method === "GET") {
      const id = decodeURIComponent(path.slice("/v2/orders/".length).split("?")[0]);
      const o = (BOOK ? bookOrders() : []).find((x) => x.id === id);
      return o ? json(o, 200, head) : json({ message: "order not found" }, 404, head);
    }
    if (path.startsWith("/v2/orders")) return json(BOOK ? bookOrders() : [], 200, head);
    return json({}, 200, head);
  }
  return json({ error: "fixture: not served" }, 503);
};

// A first run is over: the capital questions are answered (onboarding is the wizard's, photographed elsewhere).
try {
  localStorage.setItem("options-lab-state", JSON.stringify({ journalSeq: BOOK ? 5 : 0, saved: [], positions: BOOK ? bookRecords() : [], expiryLog: [], journal: BOOK ? bookJournal() : [], ivHist: {}, copilotLog: [],
    seasonal: {}, settings: { capital: POOR ? 200 : 10000, concurrentTarget: 4, savings: null, sizeOverride: null, sizingFree: null, onboarded: true, mode: "pro",
      notifyWhenReady: false, findOrder: "ev", webhook: "", reportFreq: "weekly", reportLast: 0, reportLastMd: "" } }));
} catch { /* none */ }

createRoot(document.getElementById("root")).render(<OptionsStrategyLab />);
