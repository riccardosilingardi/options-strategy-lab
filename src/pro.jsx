import React, { useState, useEffect } from "react";
import { RefreshCw, Send, Trash2, Download, Sparkles, FileText, XCircle } from "lucide-react";
import { T } from "./theme.js";
import { RULES, ruleBadge, takeProfitLabel, scaleOutLabel, stopLossLabel, exitDTELabel, perTradeCapLabel, copilotRulesBlock, money, pctText, MIN_NET_DOLLARS,
  NO_CEILING, reportNarrativePrompt, chanceText, seasonalStampNote, MEASURED_SIGMA_SOURCE,
  comboBook, notionalControlled, notionalNote,
  legBook, sizeSkippedNote, onTick, netFromLegs, limitCeilingNote, rewardRisk,
  contractListing, unlistedContractNote, unquotedLegNote, unquotedLegPointer, marketOrderNote,
  ivProvenance } from "./rules.js";
import { contractsOf, positionSize, bookPositions, autopilotHorizonNote, autopilotVolNote } from "./journal.js";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { erf, netBS } from "./engine.js";
import { ARROW, REGIONS, regionSignals, tagImpacts, taRead } from "./signals.js";
import { useNarrow, BandThumbnail, payoffBands, bandTakeaway } from "./visuals.jsx";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";
import { reduceRatios, orderQty, unitLimit, orderBody, orderPreviewLines, orderOutcome, alpacaErrorText } from "./order.js";
import { hasOpenInterest, sourceNote, openInterestNote } from "./chain.js";
// "Why this trade" and the headline tags moved to src/why.jsx: the wizard's
// decision screen needs them too, and a road with no evidence under it is a
// recommendation. Re-exported here so nothing else has to change its import.
export { ImpactTags, WhyThisTrade } from "./why.jsx";
export { useNarrow };

/* ============ theme (condiviso) ============ */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
// Never "-$0": a figure that rounds to zero is one the app could not read,
// and a minus sign in front of it invents a direction it does not have.
const fmt$ = (x) => {
  if (x == null || Number.isNaN(x) || !Number.isFinite(x)) return "—";
  const r = Math.abs(x).toFixed(0);
  return `${x < 0 && Number(r) > 0 ? "-" : ""}$${r}`;
};
/** A dollar figure for a model or a document, or null when there is not one. */
const dollarsOrNull = (x) => (Number.isFinite(x) ? +Number(x).toFixed(0) : null);
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small, title }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    style={{ ...mono, fontSize: small ? 11 : 12, padding: small ? "4px 8px" : "8px 12px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: ghost ? "transparent" : color, color: ghost ? color : T.onAccent, border: ghost ? `1px solid ${color}66` : "none", display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>
);
const Panel = ({ children, style }) => <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: 14, ...style }}>{children}</div>;
const Lbl = ({ children }) => <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>{children}</div>;
const Stat = ({ k, v, c, tip }) => (
  <div>
    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{k}{tip && <span title={tip} style={{ cursor: "help", color: T.blue, marginLeft: 3 }}>ⓘ</span>}</div>
    <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: c || T.ink }}>{v}</div>
  </div>
);
const Inp = (props) => <input {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />;
const Sel = (props) => <select {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />;

async function proxied(url) {
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("proxy " + r.status);
  return r;
}

/* ================================================================
   1) NEWS: cause -> effect tagging + geopolitical/government sources

   The cause->effect rules themselves live in src/signals.js: the same tags feed
   the news factor of fuseSignals(), so a headline can never mean one thing to
   the feed and another to the engine.
================================================================ */
export { tagImpacts };

const ANALYSIS_QUERIES = [
  '"Saxo Bank" commodities weekly',
  'EIA natural gas weekly storage report analysis',
  'USDA WASDE report analysis grains',
  'CFTC commitment of traders agriculture energy',
];
const GEO_QUERIES = [
  "OPEC energy sanctions geopolitics",
  "USDA WASDE grain report",
  "Black Sea grain Ukraine Russia export",
  "China soybean corn imports trade",
  "government export ban commodities tariff",
];
async function fetchRss(url) {
  let r;
  try { r = await fetch(url); if (!r.ok) throw new Error("rss " + r.status); }
  catch { r = await proxied(url); }
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"));
  if (!items.length) throw new Error("empty feed");
  return items.slice(0, 10).map((it) => ({
    title: it.querySelector("title")?.textContent || "",
    link: it.querySelector("link")?.textContent || "",
    date: it.querySelector("pubDate")?.textContent || "",
    src: it.querySelector("source")?.textContent || new URL(url).hostname,
  }));
}
export async function fetchAllNews(ticker, newsQ) {
  const feeds = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(newsQ)}&hl=en-US&gl=US&ceid=US:en`,
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`,
    "https://www.eia.gov/rss/todayinenergy.xml",
    ...GEO_QUERIES.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`),
    ...ANALYSIS_QUERIES.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`),
  ];
  const nGeoStart = 2, nAnStart = 2 + GEO_QUERIES.length;
  const results = await Promise.allSettled(feeds.map(fetchRss));
  const items = results.flatMap((r, i) => (r.status === "fulfilled" ? r.value.map((x) => ({ ...x, geo: i >= nGeoStart && i < nAnStart, analysis: i >= nAnStart })) : []));
  if (!items.length) throw new Error("news feeds are not reachable");
  const seen = new Set();
  return items
    .filter((i) => i.title && !seen.has(i.title) && seen.add(i.title))
    .map((i) => ({ ...i, impacts: tagImpacts(i.title) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 40);
}

/* ================================================================
   2) WEATHER: Open-Meteo forecasts over the key commodity regions

   The region table, the climate normals and the anomaly read all live in
   src/signals.js. This block only fetches and reshapes for display, so the
   weather drill-down and fuseSignals() can never disagree about the same forecast.
================================================================ */
export { REGIONS };

export async function fetchWeather() {
  const out = {};
  await Promise.all(REGIONS.map(async (rg) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${rg.lat}&longitude=${rg.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=14&timezone=auto`;
    let r;
    try { r = await fetch(url); if (!r.ok) throw new Error(); } catch { r = await proxied(url); }
    const j = await r.json();
    out[rg.id] = { tmax: j.daily.temperature_2m_max, tmin: j.daily.temperature_2m_min, prec: j.daily.precipitation_sum, dates: j.daily.time };
  }));
  return out;
}

/** One display row per region: anomaly versus that region's own monthly norm. */
export function weatherSignals(data) {
  return regionSignals(data);
}

// The Weather tab is gone (see WhyThisTrade below): weather is evidence for a
// trade, not a place to visit. `weatherSignals` stays — the report still uses it.

/* ================================================================
   3) ALPACA PRO: ordini completi + posizioni/ordini live
================================================================ */
// Nessun componente invia ordini senza cancello: se la prop `gate` manca, la
// risposta e' un blocco, non un permesso (PRD §8, regola 4 di CLAUDE.md).
export function runGate(gate, proposal) {
  if (typeof gate !== "function") {
    return { pass: false, warnings: [], violations: [{ code: "GATE_MISSING",
      message: "The risk gate is not wired into this screen, so no order can leave it. This is a bug, and it fails closed on purpose." }] };
  }
  return gate(proposal);
}

// THE STATUS AND THE BODY TRAVEL WITH THE ERROR. An mleg rejection is
// unreadable without them — "leg ratio quantities should be relatively prime:
// GCD[5 5] = 5" is the entire diagnosis and it arrives in Alpaca's own body.
// The 200-character slice used to cut it out of the only sentence the user
// ever saw. `alpacaErrorText(e)` in src/order.js turns these into that
// sentence; nothing else is allowed to invent a shorter one.
export async function alpacaReq(path, method = "GET", body = null) {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent(path)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error(alpacaErrorText({ status: r.status, body: text }));
    e.status = r.status; e.body = text; e.path = path;
    throw e;
  }
  return text ? JSON.parse(text) : {};
}
/* ====================================================================
   WHAT HAPPENED TO THE ORDER, WHERE THE ORDER WAS SENT FROM.

   Every outcome of the ticket used to go to `setMsg`, which renders at the
   TOP of a page whose send button is at the bottom: the owner confirmed
   twice, Alpaca rejected the order, and nothing appeared on screen. The
   order did not vanish — the reason did.

   So the ticket says it itself, beside the button, and it STAYS until it is
   dismissed. `setMsg` is still called: the banner is useful when the page is
   scrolled up, it just cannot be the only place the answer lives.
==================================================================== */
export function OrderOutcome({ outcome, onDismiss }) {
  if (!outcome) return null;
  const tone = outcome.tone || T.dim;
  return (
    <div style={{ marginTop: 9, padding: "9px 11px", background: `${tone}0f`, border: `1px solid ${tone}66`, borderRadius: 7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ ...mono, fontSize: 9.5, color: tone, fontWeight: 700, letterSpacing: 0.4 }}>{outcome.label}</div>
        <button onClick={onDismiss} style={{ ...mono, fontSize: 10, color: T.dim, background: "transparent", border: `1px solid ${T.line}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", minHeight: 24 }}>Dismiss</button>
      </div>
      <div style={{ fontSize: 13, color: T.ink, marginTop: 5, lineHeight: 1.5, fontWeight: 600 }}>{outcome.headline}</div>
      {outcome.detail && <div style={{ fontSize: 12.5, color: T.body, marginTop: 4, lineHeight: 1.5 }}>{outcome.detail}</div>}
      {/* ALPACA'S OWN WORDS, WHOLE. A rejection is a diagnosis and it is
          written in the body of the reply; a wrapped, scrollable box is
          what it takes to show one on a phone without breaking the page. */}
      {outcome.body && (
        <pre style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 7, marginBottom: 0, padding: "7px 8px", background: T.bg,
          border: `1px solid ${T.line}`, borderRadius: 5, maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{outcome.body}</pre>
      )}
    </div>
  );
}

/** The armed confirmation, written out: one tap must never look like nothing. */
export function OrderPending({ lines = [], onCancel }) {
  return (
    <div style={{ marginTop: 9, padding: "9px 11px", background: `${T.amber}0f`, border: `1px solid ${T.amber}66`, borderRadius: 7 }}>
      <div style={{ ...mono, fontSize: 9.5, color: T.amber, fontWeight: 700, letterSpacing: 0.4 }}>NOT SENT YET · THIS IS WHAT THE SECOND TAP SENDS</div>
      <div style={{ ...mono, fontSize: 12, color: T.ink, marginTop: 6, lineHeight: 1.7 }}>
        {lines.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small ghost onClick={onCancel}>Cancel — send nothing</Btn>
        <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>or tap the button above again to send it</span>
      </div>
    </div>
  );
}

/* ====================================================================
   THE TICKET SHOWS THE BOOK, THE MODEL AND THE NOTIONAL.

   The owner, on the ticket as it stood: "it is not clear what price to put
   in the app, or what the information is, or how to choose it." It offered
   a text field with a number in it and nothing else — and the number was
   the bare mid, which is the price the only order this app has ever sent
   sat at all day without filling.

   Four facts, for the WHOLE structure and never leg by leg, because a leg
   is not a thing anybody here trades:

     1. the combo book — bid, mid, ask, each leg at the side that trades;
     2. where the typed limit falls in it, and one plain sentence saying
        whether that fills now, waits, or never fills;
     3. the model value beside the market value — the same `modelSanity()`
        that refuses a proposal at the three generation sites. It refuses
        NOTHING here: a hand-built trade is the user's to make. What it
        owes him is the number he is accepting, in the same size as the
        one he is accepting it against;
     4. NOTIONAL CONTROLLED, next to capital at risk. The app has always
        computed this implicitly and never shown it, which is why the
        product reads as having no leverage.

   Every figure comes from `rules.js`, so this panel cannot drift from the
   arithmetic the gate and the proposal floors run on.
==================================================================== */
/* ONE COMPUTATION, ONE ANSWER — the model verdict is handed in, not redone.

   This panel used to call `modelSanity()` inline, so every keystroke in the
   limit field repriced every leg with Black-Scholes, and it re-derived the
   per-leg marks from `quoteFn(leg).mid` instead of reading the ones
   `analyze()` had already produced. That made the ticket a SECOND consumer of
   the same marks with a different spelling: for a leg priced off the model the
   Shortlist passed the model's own price and the ticket passed null, so the two
   screens could name different legs as responsible for one trade.

   `modelCheckOf()` in App.jsx is the single expression, memoised on the
   analysis, and the three generation sites use it too. `model` arriving null
   means nobody computed one — which is what the panel says, rather than
   quietly computing a second opinion. */
/* THE MARKET, READ-ONLY, FIRST — the thing the owner asked for by name three
   times: "devo vedere il bid/ask di quel 0.48 e 0.34 per capire quanto sono
   vicino a un ordine probabile." One row per leg, its BID and its ASK and the
   SIZE at each, with the two sides that actually trade in full contrast and
   the other two dimmed. `legBook()` in rules.js is the data; this only draws
   it, so the table and the combination price below it cannot disagree. */
function LegMarketTable({ legs, quotes, ticker, expKey, feed }) {
  const lb = legBook(legs, quotes);
  // WHICH LEGS THE CHAIN NEVER LISTED. `quotes` carries the chain's own `occ`
  // per leg now; its absence is the absence of a contract (src/rules.js,
  // `contractListing`), and it is what the broker refused on 20 September.
  const unlisted = contractListing({ legs, occs: (quotes || []).map((x) => (x && x.occ) || null) }).missing;
  const Head = ({ children, right }) => (
    <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4, textAlign: right ? "right" : "left" }}>{children}</div>
  );
  const cell = (on) => ({ ...mono, fontSize: 12, fontWeight: on ? 800 : 500, color: on ? T.ink : T.dim, textAlign: "right" });
  return (
    <div style={{ marginTop: 10, padding: "9px 11px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 7 }}>
      <div style={{ ...mono, fontSize: 9.5, color: T.dim, letterSpacing: 0.4, fontWeight: 700 }}>
        THE MARKET, LEG BY LEG{expKey ? ` · ${ticker} ${expKey}` : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 1fr 0.7fr", gap: "4px 8px", marginTop: 7, alignItems: "center" }}>
        <Head>LEG</Head><Head right>BID</Head><Head right>SIZE</Head><Head right>ASK</Head><Head right>SIZE</Head>
        {lb.rows.map((r) => {
          const buying = r.side > 0;
          return (
            <React.Fragment key={r.i}>
              <div style={{ ...mono, fontSize: 11.5, color: buying ? T.green : T.red, fontWeight: 700 }}>
                {buying ? "BUY" : "SELL"} {r.qty > 1 ? `${r.qty}× ` : ""}{r.strike}{r.type === "call" ? "C" : "P"}
              </div>
              <div style={cell(r.trades === "bid")}>{r.bid != null ? r.bid.toFixed(2) : "—"}</div>
              <div style={{ ...cell(r.trades === "bid"), fontSize: 10.5, fontWeight: 500 }}>{r.bidSize != null ? r.bidSize : "?"}</div>
              <div style={cell(r.trades === "ask")}>{r.ask != null ? r.ask.toFixed(2) : "—"}</div>
              <div style={{ ...cell(r.trades === "ask"), fontSize: 10.5, fontWeight: 500 }}>{r.askSize != null ? r.askSize : "?"}</div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 7, lineHeight: 1.6 }}>
        In full contrast: the side that trades when you send this. To buy the structure you lift the ask on
        every leg you are buying and hit the bid on every leg you are selling — the other two are the reverse
        trade, which is nobody{"’"}s side of this one.
      </div>
      {/* A MISSING SIZE IS UNKNOWN, NEVER ZERO. A "?" and a sentence, rather
          than a blank that reads as a market with nobody in it. */}
      {lb.missingSizes > 0 && (
        <div style={{ ...mono, fontSize: 9.5, color: T.amber, marginTop: 5, lineHeight: 1.6 }}>
          {sizeSkippedNote(lb.missingSizes, feed)}
        </div>
      )}
      {/* ONE FACT, ONE PLACE. This sentence was written out here AND in the
          combination panel below, so the Build screen said it twice — inside
          the work PR #28 did to stop the CONFLICT paragraph appearing four
          times. It keeps its home HERE, where the legs are named, and the
          combination panel prints `unquotedLegPointer()` instead. */}
      {lb.unquoted > 0 && (
        <div style={{ ...mono, fontSize: 9.5, color: T.amber, marginTop: 5, lineHeight: 1.6 }}>
          {unquotedLegNote(lb.unquoted)}
        </div>
      )}
      {/* AND A LEG THE CHAIN NEVER LISTED IS A DIFFERENT FACT FROM AN UNQUOTED
          ONE: no quote means nobody is making a market, no LISTING means the
          contract does not exist. The order cannot be sent either way, and
          only one of the two can be fixed by waiting. */}
      {unlisted.length > 0 && (
        <div style={{ ...mono, fontSize: 9.5, color: T.red, marginTop: 5, lineHeight: 1.6 }}>
          ✗ {unlistedContractNote(unlisted, lb.rows.length)}
        </div>
      )}
    </div>
  );
}

/* ONE SLIDER PER LEG, IN ONE-CENT STEPS. The user prices each leg and the app
   computes the net, which is the reverse of the single net field this ticket
   used to offer and is the direction the owner thinks in.

   THE STEPS ARE CENTS BECAUSE OPTIONS DO NOT HAVE CONTINUOUS PRICES: a penny
   class ticks at $0.01 under $3.00, and 0.525 is not a price anybody can send.
   The old `<Inp type="number" step="0.01">` constrained the spinner and not
   what could be typed; `onTick()` in rules.js is applied to the value itself,
   so what reaches `orderBody()` is on the tick whatever route it came by. */
function LegPriceSliders({ legs, quotes, prices, onPrice }) {
  const lb = legBook(legs, quotes);
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      {lb.rows.map((r) => {
        const px = Number((prices || [])[r.i]);
        const has = Number.isFinite(px);
        const lo = r.bid != null ? r.bid : null, hi = r.ask != null ? r.ask : null;
        const spannable = lo != null && hi != null && hi > lo;
        return (
          <div key={r.i}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: r.side > 0 ? T.green : T.red }}>
                {r.side > 0 ? "BUY" : "SELL"} {r.qty > 1 ? `${r.qty}× ` : ""}{r.strike}{r.type === "call" ? "C" : "P"}
              </span>
              <span style={{ ...mono, fontSize: 10, color: T.dim }}>
                bid {r.bid != null ? r.bid.toFixed(2) : "—"} · mid {r.mid != null ? r.mid.toFixed(2) : "—"} · ask {r.ask != null ? r.ask.toFixed(2) : "—"}
              </span>
              <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: T.ink, marginLeft: "auto" }}>
                {has ? `$${px.toFixed(2)}` : "—"}
              </span>
            </div>
            {spannable ? (
              <input type="range" min={lo} max={hi} step={0.01} value={has ? px : lo}
                aria-label={`price for leg ${r.i + 1}`}
                onChange={(e) => onPrice(r.i, onTick(e.target.value))}
                style={{ width: "100%", marginTop: 4, accentColor: r.side > 0 ? T.green : T.red }} />
            ) : (
              <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 3, lineHeight: 1.6 }}>
                No two-sided quote on this leg, so there is no range to move inside. Its price is what the feed
                gave, and the app is not inventing one either side of it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ====================================================================
   THE COMBINATION: WHAT THE MARKET IS, WHERE THE LIMIT SITS, WHAT WOULD
   REALLY BE PAID, AND HOW MUCH OF THE UNDERLYING IS BEING CONTROLLED.

   Five facts, for the WHOLE structure and never leg by leg, because a leg
   is not a thing anybody here trades:

     1. the combo book — bid, mid, ask, each leg at the side that trades;
     2. ONE VERDICT BAND, coloured, three states, naming the distance, and
        reading the TIME IN FORCE — the same price is a different order
        depending on how long it stands;
     3. A LIMIT IS A CEILING, NOT A PRICE: at or past the touch you fill AT
        the touch, so "you offer $30, you pay $24" and every figure on the
        screen above is worked out at the $24;
     4. the model value beside the market value — the same `modelSanity()`
        that refuses a proposal at the three generation sites. It refuses
        NOTHING here: a hand-built trade is the user's to make;
     5. NOTIONAL CONTROLLED, next to capital at risk.

   Every figure comes from `rules.js`, so this panel cannot drift from the
   arithmetic the gate and the proposal floors run on.
==================================================================== */
/* ONE COMPUTATION, ONE ANSWER — the model verdict is handed in, not redone.
   This panel used to call `modelSanity()` inline, so every keystroke in the
   limit field repriced every leg with Black-Scholes, and it re-derived the
   per-leg marks from `quoteFn(leg).mid` instead of reading the ones
   `analyze()` had already produced. `modelCheckOf()` in App.jsx is the single
   expression; `model` arriving null means nobody computed one, which is what
   the panel says rather than quietly computing a second opinion. */
function ComboBookPanel({ legs, quotes, verdict, effective, type, qty, spot, ticker, estNet, maxLoss, maxProfit, model, limits = null }) {
  const book = comboBook(legs, quotes);
  const dir = Number(estNet) >= 0 ? 1 : -1;
  const ms = model || { checked: false, pass: true, marketNet: null, modelNet: null, reason: null };
  const notional = notionalControlled(qty, spot);
  const risk = Math.abs(Number(maxLoss)) * Math.max(1, Math.round(Number(qty) || 1));
  const tone = verdict?.state === "fills" ? T.green : verdict?.state === "waiting" ? T.blue : verdict?.known ? T.red : T.dim;
  const ceiling = limitCeilingNote(effective);
  const rr = rewardRisk(maxProfit, maxLoss);
  const Cell = ({ k, v, c, note }) => (
    <div style={{ minWidth: 92 }}>
      <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4 }}>{k}</div>
      <div style={{ ...mono, fontSize: 14, fontWeight: 800, color: c || T.ink, marginTop: 2 }}>{v}</div>
      {note && <div style={{ ...mono, fontSize: 9, color: T.dim, marginTop: 1 }}>{note}</div>}
    </div>
  );
  return (
    <div style={{ marginTop: 10, padding: "9px 11px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 7 }}>
      <div style={{ ...mono, fontSize: 9.5, color: T.dim, letterSpacing: 0.4, fontWeight: 700 }}>
        THE MARKET ON THE WHOLE STRUCTURE{book.ok ? "" : " — NOT QUOTED ON BOTH SIDES"}
      </div>
      {book.ok ? (
        <>
          <div style={{ display: "flex", gap: 18, marginTop: 7, flexWrap: "wrap" }}>
            {/* `ask` is ALWAYS the price at which the structure AS BUILT trades
                right now — longs lifted at their ask, shorts hit at their bid —
                and `bid` is always the reverse trade, which is nobody's side of
                this one. On a credit the magnitudes therefore run the other way
                (|ask| < |mid| < |bid|), so the LABELS have to say which is
                which rather than relying on the order they are printed in. */}
            <Cell k="COMBO BID" v={money(Math.abs(book.bid) * 100)} c={T.mut}
              note="the other side of this trade" />
            <Cell k="COMBO MID" v={money(Math.abs(book.mid) * 100)} c={T.ink} note="the middle — nobody has to meet it" />
            <Cell k="COMBO ASK" v={money(Math.abs(book.ask) * 100)} c={T.mut}
              note={dir > 0 ? "fills now — you pay it" : "fills now — you receive it"} />
            <Cell k="SPREAD" v={money(book.spread * 100)} c={T.amber}
              note={Math.abs(book.mid) > 0 ? `${pctText(book.spread / Math.abs(book.mid), 0)} of the mid` : null} />
          </div>
          {/* >>> ONE VERDICT BAND: three states, the distance, and the horizon.
              Time in force was stated in words AFTER the fact, underneath a
              verdict that had not read it. The same price inside the spread is
              a real trade good-until-cancelled and a wasted evening as a day
              order, and that is the half the owner said unlocked it. <<< */}
          {verdict && verdict.known && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: `${tone}12`, border: `1.5px solid ${tone}`, borderRadius: 6 }}>
              <div style={{ ...mono, fontSize: 11, color: tone, fontWeight: 800, letterSpacing: 0.4 }}>{verdict.label}</div>
              <div style={{ fontSize: 12.5, color: T.body, marginTop: 4, lineHeight: 1.5 }}>{verdict.sentence}</div>
              {verdict.tifSentence && (
                <div style={{ fontSize: 12.5, color: T.body, marginTop: 5, lineHeight: 1.5 }}>{verdict.tifSentence}</div>
              )}
            </div>
          )}
          {verdict && !verdict.known && (
            <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 7, lineHeight: 1.5 }}>{verdict.sentence}</div>
          )}
          {/* A LIMIT IS A CEILING, NOT A PRICE — and nothing said so. */}
          {ceiling && (
            <div style={{ fontSize: 12.5, color: T.body, marginTop: 7, lineHeight: 1.55, padding: "7px 9px", background: `${T.blue}0f`, border: `1px solid ${T.blue}55`, borderRadius: 6 }}>
              {ceiling}
            </div>
          )}
        </>
      ) : (
        <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 6, lineHeight: 1.6 }}>
          {/* A POINTER, NOT A SECOND COPY. The full sentence belongs to the leg
              table above, where the legs are named — the same rule
              `warningsToPrint()` applies to the CONFLICT paragraph. */}
          {unquotedLegPointer(book.missing.length)}
        </div>
      )}

      {/* FOUR NUMBERS THAT MOVE, at the effective price and never at the mid.
          They are the same four the screen above prints, from the same
          `analyze()` result, so the ticket cannot say one thing and the stats
          another about the trade about to be sent. */}
      <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", paddingTop: 9, borderTop: `1px solid ${T.line}` }}>
        {/* THE NOTE USED TO SAY "at the price below, not at the mid" WITH NO
            PRICE BELOW. On a MARKET order there is no limit to point at: the
            figures are worked out at the touch, which is what a market order
            takes, and saying otherwise names a control that is not there. */}
        <Cell k="MOST YOU CAN MAKE" v={Number.isFinite(maxProfit) ? money(maxProfit * Math.max(1, Math.round(Number(qty) || 1))) : NO_CEILING}
          c={T.green} note={type === "market" ? "at the touch a market order takes" : "at the price below, not at the mid"} />
        {/* >>> THE LIMIT CHECK IS WHERE THE SEND IS. <<< This note used to
            repeat its own label back ("the most you can lose"), while the one
            sentence that makes the figure mean something — the per-trade limit
            it is measured against — was printed ONLY on the trade card, which
            this sheet covers while the sliders are being moved. So the owner
            read "risking $44 of $1,000" on the card, moved the price to the ask
            and sent $60 with nothing on screen restating the check at the new
            price. `limits` is the SAME `guard.limits` the card prints, from the
            one gate call on the Build screen, so the two cannot disagree. */}
        <Cell k="MOST YOU CAN LOSE" v={Number.isFinite(risk) ? money(risk) : "—"} c={T.red}
          note={limits && Number.isFinite(limits.perTrade)
            ? `of ${money(limits.perTrade)} ${limits.answered === false ? "suggested" : "allowed"}`
            : "the most you can lose"} />
        <Cell k="MADE PER $1 RISKED" v={rr == null ? "—" : rr.toFixed(2)} c={T.violet}
          note={rr == null ? "no ceiling, or no readable price" : "best case over worst case"} />
        <Cell k="NOTIONAL CONTROLLED" v={notional != null ? money(notional) : "—"} c={T.violet}
          note={`${Math.max(1, Math.round(Number(qty) || 1))} × 100 × ${spot != null ? `$${(+spot).toFixed(2)}` : "spot"}`} />
      </div>

      {/* THE MODEL VALUE BESIDE THE MARKET VALUE. This is what would have
          caught the BOIL 20/21 order: $5 a contract on the chain against $33
          from the model. It refuses nothing here — the desk is the user's —
          but it is no longer possible to accept that number without seeing it. */}
      <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", paddingTop: 9, borderTop: `1px solid ${T.line}` }}>
        <Cell k="MARKET SAYS" v={ms.marketNet != null ? money(ms.marketNet) : money(Math.abs(Number(estNet) || 0) * 100)}
          c={T.ink} note="one contract, off the chain" />
        <Cell k="THE MODEL SAYS" v={ms.modelNet != null ? money(ms.modelNet) : "—"}
          c={ms.checked && !ms.pass ? T.red : T.mut} note={ms.checked ? "same maths as every other screen" : "not enough to price it"} />
      </div>
      {ms.checked && !ms.pass && (
        <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 8, lineHeight: 1.6, padding: "7px 9px", background: `${T.red}0f`, border: `1px solid ${T.red}55`, borderRadius: 6 }}>
          ⚠ {ms.reason} The app will not PROPOSE a structure priced like this. On the desk it is yours to
          send, and this is what you are accepting.
        </div>
      )}
      {/* >>> THE MARKET OPTION EARNS ITS WARNING. <<< The fourth order this app
          sent was a MARKET order on a structure with an unquoted leg, on boards
          this repository has measured at 66-166% of the mid. Everything above —
          the sliders, the net, the verdict band — is bypassed the moment it is
          chosen, and nothing said so. `marketOrderNote()` in rules.js. */}
      {type === "market" && (
        <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, lineHeight: 1.55, padding: "7px 9px", background: `${T.amber}12`, border: `1px solid ${T.amber}88`, borderRadius: 6 }}>
          ⚠ {marketOrderNote(book)}
        </div>
      )}
      {notional != null && (
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 7, lineHeight: 1.6 }}>
          {notionalNote(notional, risk, ticker)}
        </div>
      )}
    </div>
  );
}

/**
 * THE ORDER TICKET, REBUILT — designed with the owner against his own
 * screenshots, on a 390px phone, top to bottom:
 *
 *   1. THE MARKET, READ-ONLY, FIRST — one row per leg, its bid and its ask and
 *      the SIZE at each, the two sides that trade in full contrast.
 *   2. ONE SLIDER PER LEG, in one-cent steps, each labelled with that leg's
 *      bid, mid and ask. The user prices the legs; the app computes the net.
 *   3. THE NET, BIG, BESIDE ITS OWN ARITHMETIC — `0.52 − 0.30 → $22` — so it
 *      is never a number that appears from nowhere.
 *   4. TIME IN FORCE AS PART OF THE VERDICT, not a dropdown with a paragraph
 *      underneath it.
 *   5. ONE VERDICT BAND, three states, naming the distance.
 *   6. FOUR NUMBERS THAT MOVE, at the effective price and never at the mid.
 *
 * NEITHER THE PRICE NOR THE SIZE IS THE TICKET'S ANY MORE. `cfg.qty` went up
 * to the Build screen in PR #23 for the reason the price goes up now: the
 * screen above was computing every figure it printed from the mid while this
 * panel two thousand pixels down knew the real price and said nothing. Type,
 * time in force and one price per leg are Build-screen state; this is a
 * controlled input on them, and `verdict` and `effective` are handed in from
 * the one place they are worked out.
 *
 * `model` is the `modelSanity()` verdict, computed once from `analyze()`'s own
 * marks — see `ComboBookPanel` above.
 */
export function OrderTicket({
  /* `buildOcc` IS GONE FROM THIS SIGNATURE AND IT IS NOT AN OVERSIGHT. It was
     the fallback behind `quoteFn(l).occ`, and a formatter that turns a strike
     the app chose into a symbol cannot know whether anybody issued it: on SOYB
     2026-11-20 it produced SOYB261120C00027500, which the broker refused by
     name before the order reached the market. The CHAIN is the only thing that
     knows which contracts exist, and it travels on `quotes[i].occ`. */
  creds, legs, expKey, ticker, quoteFn, estNet, setMsg, onSent, gate, dte,
  maxLoss, maxProfit, spot, entryOverride, qty = 1, onQty, model = null, feed = null,
  /* The price, from the screen above. `net` is signed per share.

     `cfg` HAS A DISPLAY DEFAULT AND IT IS NOT A SECOND HOME. The real one is
     `ticket` in App.jsx; this only keeps a ticket rendered without it from
     blanking the screen, and such a ticket cannot send anything — with no
     `legPrices` the net is null and the limit branch of `send()` refuses it by
     name, the same way `runGate(undefined, …)` fails closed. */
  cfg = { type: "limit", tif: "day" }, onCfg, quotes = [], legPrices = [], net = null,
  verdict = null, effective = null, seed = null, onReseed,
  /* THE GATE'S OWN LIMITS, from the one gate call on the Build screen. Never
     re-derived here: the figure beside the send has to be the figure the card
     printed, or the two are two answers to one question. */
  limits = null,
}) {
  const qtyNum = Math.max(1, Math.round(Number(qty) || 1));
  const setQty = (v) => { if (onQty) onQty(Math.max(1, Math.min(20, Math.round(Number(v) || 1)))); };
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const arith = netFromLegs(legs, legPrices);
  // THE MAGNITUDE IS WHAT `orderBody()` SENDS, and it is on the tick because
  // every leg price it was summed from is (`onTick()` in rules.js).
  const limit = Number.isFinite(net) ? Math.abs(net) : null;
  const limitStr = limit == null ? "" : limit.toFixed(2);
  const setLeg = (i, px) => {
    if (!onCfg) return;
    const next = (legPrices || []).slice();
    next[i] = px;
    onCfg({ legPx: next });
  };
  // Il cancello gira PRIMA di costruire l'ordine: quello che si vede nel
  // pannello e' esattamente quello che decide se l'ordine parte.
  /* >>> THE EVIDENCE THE SCREEN ABOVE ALREADY HAS. <<< These two calls used to
     pass the maximum loss alone, so the gate guarding the SEND was weaker than
     the `guard` memo the user had just read at the top of the screen:
     `priceability()` could not see an unquoted leg and nothing could see a
     contract the chain never listed. `riskGate.test.js` fails the build if an
     open-intent gate call leaves `quotes`, `net` or `occs` out. */
  const occs = (quotes || []).map((x) => (x && x.occ) || null);
  const evidence = { ticker, intent: "open", legs, dte, contracts: qtyNum, maxLoss, maxProfit,
    quotes, net: estNet, occs, entryOverride };
  const preview = runGate(gate, evidence);
  // THE SIZE GOES IN THE ORDER'S QTY, THE SHAPE GOES IN THE LEG RATIOS.
  // Alpaca refused a five-lot vertical with 422 / 42210000, "leg ratio
  // quantities should be relatively prime: GCD[5 5] = 5", because the ticket
  // wrote the multiplier into every leg. `reduceRatios` divides it out and
  // `orderQty` puts it back where the broker expects it; a genuine 1:2:1
  // butterfly has a GCD of 1 and comes through untouched. See src/order.js.
  const shape = reduceRatios(legs);
  const sendQty = orderQty(qtyNum, shape.factor);
  const send = async () => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 2 of six
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setBusy(true); setOutcome(null);
    try {
      const g = runGate(gate, evidence);
      if (!g.pass) {
        const why = g.violations.map((v) => v.message).join(" ");
        setMsg(`Risk gate: order not sent. ${why}`);
        setOutcome({ label: "NOT SENT · THE RISK GATE REFUSED IT", tone: T.red,
          headline: "Nothing was sent to Alpaca.", detail: why });
        setBusy(false); return;
      }
      // NO FALLBACK. An unlisted leg is UNKNOWN, the gate above has already
      // refused it by name, and this is the belt to that pair of braces.
      const listing = contractListing({ legs, occs });
      if (listing.checked && !listing.listed) throw new Error(listing.reasons[0]);
      if (occs.length > 4) throw new Error("Alpaca takes at most 4 legs per order: split the strategy in two");
      // A limit of nothing is not a limit. An empty field coerces to 0 and
      // would leave as limit_price "0.00" — the same disease as the $0 debit
      // in rules.js: a missing number sent as if it were a price.
      if (cfg.type === "limit" && !(limit > 0)) throw new Error("price the legs first — $0.00 is a missing price, not a cheap one");
      // The price on screen is the price of the structure AS BUILT, and
      // `orderBody` divides it by the same factor it took out of the ratios,
      // so the money at stake is what the ticket says it is.
      const body = orderBody({ legs, occs, userQty: qtyNum, type: cfg.type, limit: limitStr, tif: cfg.tif, intent: "open" });
      const o = await alpacaReq("/v2/orders", "POST", body);
      if (onSent) onSent(o, { ...cfg, limit: limitStr, qty: qtyNum });
      // ACCEPTED IS NOT FILLED. A limit at the mid of a wide market, or any
      // order sent outside market hours, comes back accepted with nothing
      // bought — that is a third outcome, not a failure, and it says where
      // the order is waiting rather than claiming a position.
      const res = orderOutcome(o);
      const tone = res.kind === "filled" ? T.green : res.kind === "dead" ? T.red : res.kind === "unknown" ? T.amber : T.blue;
      const label = res.kind === "filled" ? "FILLED" : res.kind === "partial" ? "PARTLY FILLED"
        : res.kind === "dead" ? `ALPACA ${String(res.status).toUpperCase().replace(/_/g, " ")} IT`
          : res.kind === "unknown" ? "SENT · THE REPLY DID NOT SAY" : "SENT · WORKING, NOT FILLED";
      setOutcome({ label, tone, headline: res.headline, detail: res.detail });
      setMsg(`${cfg.type === "limit" ? "Limit" : "Market"} order ×${sendQty} sent to your Alpaca paper account · id ${o.id?.slice(0, 8)}… · ${res.headline}`);
    } catch (e) {
      const sentence = alpacaErrorText(e);
      setMsg(`The order was not sent: ${sentence}`);
      // A precondition that failed here never reached the broker, and saying
      // Alpaca refused it would be a lie about which of the two said no.
      setOutcome({ label: e.status ? "NOT SENT · ALPACA REFUSED IT" : "NOT SENT · THE ORDER COULD NOT BE BUILT",
        tone: T.red, headline: sentence,
        detail: e.status ? "Nothing was bought and nothing is working. The whole of Alpaca's reply is below." : null,
        body: e.body || null });
    }
    setBusy(false);
  };
  const seedDiffers = Array.isArray(seed) && seed.length === (legPrices || []).length
    && seed.some((v, i) => Math.abs(Number(v) - Number(legPrices[i])) > 0.0049);
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: T.bg, border: `1px solid ${T.violet}44`, borderRadius: 7 }}>
      <Lbl>SEND THE ORDER · ALPACA PAPER ACCOUNT</Lbl>

      {/* 1 — THE MARKET, READ-ONLY, FIRST. */}
      <LegMarketTable legs={legs} quotes={quotes} ticker={ticker} expKey={expKey} feed={feed} />

      {/* 2 — ONE SLIDER PER LEG. */}
      {cfg.type === "limit" && (
        <>
          <div style={{ ...mono, fontSize: 9.5, color: T.dim, letterSpacing: 0.4, fontWeight: 700, marginTop: 12 }}>
            YOUR PRICE, LEG BY LEG · ONE-CENT STEPS
          </div>
          <LegPriceSliders legs={legs} quotes={quotes} prices={legPrices} onPrice={setLeg} />
        </>
      )}

      {/* 3 — THE NET, BIG, BESIDE ITS OWN ARITHMETIC. */}
      {cfg.type === "limit" && (
        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4 }}>
              {Number.isFinite(net) && net < 0 ? "YOUR LIMIT · YOU RECEIVE" : "YOUR LIMIT · YOU PAY"}
            </div>
            <div style={{ ...mono, fontSize: 26, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>
              {limit == null ? "—" : money(limit * 100)}
            </div>
          </div>
          <div style={{ ...mono, fontSize: 12, color: T.mut }}>{arith.line || "price every leg and the net appears here"}</div>
          {seedDiffers && onReseed && (
            <button onClick={onReseed}
              style={{ ...mono, fontSize: 9.5, color: T.blue, background: "transparent", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
              back to the suggested prices
            </button>
          )}
        </div>
      )}

      {/* 4 — ORDER TYPE, TIME IN FORCE AND SIZE. The time in force is an input
          to the verdict band below, not a dropdown with a paragraph under it. */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>QTY</div><Inp type="number" min={1} max={20} value={qtyNum} onChange={(e) => setQty(e.target.value)} style={{ width: 56 }} /></div>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>ORDER TYPE</div>
          <Sel value={cfg.type} onChange={(e) => onCfg({ type: e.target.value })}><option value="limit">Limit — set my price</option><option value="market">Market — take what is there</option></Sel></div>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>HOW LONG IT STANDS</div>
          <Sel value={cfg.tif} onChange={(e) => onCfg({ tif: e.target.value })}><option value="day">Today only</option><option value="gtc">Until I cancel</option></Sel></div>
        <Btn color={confirm ? T.red : T.violet} onClick={send} disabled={busy || !preview.pass || DEMO}
          title={DEMO ? DEMO_TOOLTIP : undefined}>
          <Send size={12} /> {busy ? "Sending…" : DEMO ? DEMO_TOOLTIP : !preview.pass ? "BLOCKED BY THE RISK GATE" : confirm ? "TAP AGAIN TO CONFIRM" : "Send the order"}
        </Btn>
      </div>

      {/* 5 and 6 — THE BOOK, THE VERDICT BAND, THE CEILING SENTENCE, THE FOUR
          NUMBERS AT THE EFFECTIVE PRICE, THE MODEL AND THE NOTIONAL. */}
      <ComboBookPanel
        legs={legs} quotes={quotes} verdict={verdict} effective={effective} type={cfg.type} qty={qtyNum}
        spot={spot} ticker={ticker} estNet={estNet} maxLoss={maxLoss} maxProfit={maxProfit} model={model}
        limits={limits} />

      {/* A SIZED STRUCTURE IS PRICED TWO WAYS AND BOTH ARE ON SCREEN. The
          price above is the price of the structure as it is built; Alpaca is
          sent the price of ONE of the relatively-prime combinations, times
          the quantity. Silence here is what made "x5" look like a fifth of
          the trade the user was reading. */}
      {shape.factor > 1 && (
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 7 }}>
          {`This structure is ${shape.factor} × (${shape.ratios.join(":")}). Alpaca is sent ${sendQty} combination${sendQty === 1 ? "" : "s"}${cfg.type === "limit" && limit != null ? ` at $${unitLimit(limitStr, shape.factor)} each` : ""} — the same trade, written the way the broker requires.`}
        </div>
      )}
      {/* ONE TAP MUST NEVER LOOK LIKE NOTHING. The first tap arms the
          confirmation; what it armed is written out here, at the button, so
          the second tap is made against the order itself and not against a
          button whose label changed. */}
      {confirm && (
        <OrderPending
          lines={orderPreviewLines({ legs, ratios: shape.ratios, factor: shape.factor, ticker, expKey,
            qty: qtyNum, type: cfg.type, limit: limitStr, tif: cfg.tif })}
          onCancel={() => setConfirm(false)} />
      )}
      <OrderOutcome outcome={outcome} onDismiss={() => setOutcome(null)} />
      {!preview.pass && (
        <div style={{ display: "grid", gap: 3, marginTop: 7 }}>
          {preview.violations.map((v) => (
            <div key={v.code} style={{ ...mono, fontSize: 10.5, color: T.red }}>✗ {v.message}</div>
          ))}
        </div>
      )}
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Paper account only. The price is for the whole combination, not one leg. Every order asks you twice, and every order goes through the risk gate first.</div>
    </div>
  );
}

export function AlpacaDesk({ creds, setMsg, gate }) {
  const [pos, setPos] = useState(null);
  const [ords, setOrds] = useState(null);
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const [p, o] = await Promise.all([
        alpacaReq("/v2/positions"),
        alpacaReq("/v2/orders?status=open&limit=30&nested=true"),
      ]);
      setPos(p); setOrds(o);
    } catch (e) { setMsg(`Could not sync with Alpaca: ${alpacaErrorText(e)}`); }
    setBusy(false);
  };
  useEffect(() => { sync(); }, []); // eslint-disable-line
  const cancel = async (id) => { try { await alpacaReq(`/v2/orders/${id}`, "DELETE"); setMsg("Order cancelled."); sync(); } catch (e) { setMsg(`The cancellation did not go through: ${alpacaErrorText(e)}`); } };
  // Chiusura strategia intera: 1) cancella ordini aperti sugli stessi contratti (evita "wash trade detected")
  // 2) invia UN ordine complesso di chiusura (mleg) — mai gambe separate
  const closeGroup = async (grp) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 3 of six
    try {
      // Anche una chiusura e' un ordine: passa dal cancello (intent "close",
      // quindi le regole d'ingresso non si applicano, quella paper si).
      const g = runGate(gate, {
        intent: "close", ticker: String(grp.key || "").split(" ")[0],
        legs: grp.items.map((x) => ({ side: +x.qty > 0 ? 1 : -1, qty: Math.abs(+x.qty), type: /C\d{8}$/.test(x.symbol) ? "call" : "put" })),
        maxLoss: grp.items.reduce((a, x) => a + Math.abs(+x.cost_basis || 0), 0), contracts: 1,
      });
      if (!g.pass) { setMsg(`Risk gate: the close was not sent. ${g.violations.map((v) => v.message).join(" ")}`); return; }
      const syms = new Set(grp.items.map((x) => x.symbol));
      for (const o of ords || []) {
        const oSyms = o.order_class === "mleg" ? (o.legs || []).map((l) => l.symbol) : [o.symbol];
        if (oSyms.some((sy) => syms.has(sy))) { try { await alpacaReq(`/v2/orders/${o.id}`, "DELETE"); } catch { /* già chiuso */ } }
      }
      // A five-lot spread is five of a 1:1 combination, not one of a 5:5:
      // the same GCD rule that refused the opening order refuses the close,
      // and being unable to close what you opened is the worse half of it.
      // Same `orderBody` as the ticket — one implementation, five paths.
      const items = grp.items.slice(0, 4);
      const body = orderBody({
        legs: items.map((x) => ({ side: +x.qty > 0 ? 1 : -1, qty: Math.abs(+x.qty) })),
        occs: items.map((x) => x.symbol),
        userQty: 1, type: "market", tif: "day", intent: "close",
      });
      const co = await alpacaReq("/v2/orders", "POST", body);
      setMsg(`Closing ${grp.key} — sent as a single order. ${orderOutcome(co).headline}`);
      setTimeout(sync, 1500);
    } catch (e) { setMsg(`The close was not sent: ${alpacaErrorText(e)}`); }
  };
  return (
    <Panel style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Lbl>ON YOUR ALPACA PAPER ACCOUNT</Lbl>
        <Btn small ghost onClick={sync} disabled={busy}><RefreshCw size={11} /> Sync</Btn>
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>OPEN POSITIONS ({pos ? pos.length : "…"})</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {(() => {
          const groups = {};
          for (const x of pos || []) {
            const m = (x.symbol || "").match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
            const key = m ? `${m[1]} · 20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}` : x.symbol;
            if (!groups[key]) groups[key] = { key, items: [], pl: 0 };
            groups[key].items.push(x); groups[key].pl += +x.unrealized_pl;
          }
          return Object.values(groups).map((g) => (
            <div key={g.key} style={{ padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{g.key} · {g.items.length} leg{g.items.length === 1 ? "" : "s"}</div>
                  {g.items.map((x) => (
                    <div key={x.symbol} style={{ ...mono, fontSize: 10, color: T.dim }}>{+x.qty > 0 ? "+" : ""}{x.qty} {x.symbol.slice(-9)} · avg ${(+x.avg_entry_price).toFixed(2)} → ${(+x.current_price).toFixed(2)}</div>
                  ))}
                </div>
                <Stat k="PROFIT NOW" v={fmt$(g.pl)} c={g.pl >= 0 ? T.green : T.red} />
                <Btn small ghost color={T.red} onClick={() => closeGroup(g)} disabled={DEMO}
                  title={DEMO ? DEMO_TOOLTIP : undefined}><XCircle size={11} /> Close the whole trade</Btn>
              </div>
            </div>
          ));
        })()}
        {pos && pos.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>Nothing open on Alpaca.</div>}
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>ORDERS WAITING ({ords ? ords.length : "…"})</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {(ords || []).map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12 }}>{o.order_class === "mleg" ? `MULTILEG x${o.qty} (${(o.legs || []).length} legs)` : `${o.symbol} ${o.side} ${o.qty}`}</div>
              <div style={{ ...mono, fontSize: 10, color: T.dim }}>{o.type}{o.limit_price ? ` @ ${o.limit_price}` : ""} · {o.time_in_force} · {o.status}</div>
            </div>
            <Btn small ghost color={T.red} onClick={() => cancel(o.id)}><Trash2 size={11} /> Cancel</Btn>
          </div>
        ))}
        {ords && ords.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>No orders waiting.</div>}
      </div>
    </Panel>
  );
}

/* ================================================================
   4) AI COPILOT: chat con skill trader precaricate
================================================================ */
// Un solo posto per le regole, anche nei prompt: il testo qui sotto e' generato
// da src/rules.js, quindi il modello non puo' citare un numero che il codice
// non applica piu' (era il caso di "regola del 5%" e "exit 7 DTE").
const SYSTEM_PROMPT = `You are the copilot of an options trader working on commodity ETFs (SOYB, CORN, UNG, BOIL, WEAT, SPY) in PAPER TRADING.
${copilotRulesBlock()}
These rules are enforced in code by src/riskGate.js before any order is sent. Never propose a trade that breaks them, and never present a rule number that differs from the ones above.
WHO YOU ARE WRITING FOR: someone who is learning, not a professional trader. Plain English sentences. Define any term the first time you use it, in the same sentence — "open interest (how many contracts are actually open)". Never guarantee an outcome: this is educational analysis on a paper account, not financial advice. Always state the risk and what would make the idea wrong.

METHOD (follow in order): 1 Discovery (seasonal scanner + trend) → 2 Construction (real chain, strikes, Greeks, R/R, breakevens) → 3 Execution (only after explicit human confirmation, check buying power) → 4 Monitoring (P&L against the rules, % of max profit) → 5 Reporting.

DECISION TREES: (A) strong bullish seasonal signal + uptrend → bull call spread (small capital) or long call (larger capital), moderate conviction → call calendar; (B) neutral/range market with low volatility → iron condor (never naked strangles: defined risk only); (C) event ahead with low IV → long ATM straddle/strangle; IV already high → sell premium with defined risk, or wait; directional bias → vertical spread.

MANAGEMENT: scale in and out → start with 1 contract, add if it works, close half at ${pctText(RULES.takeProfitPct)} of max profit and the rest at ${pctText(RULES.scaleOutPct)}; roll near expiration with a calendar; if the underlying moves against you → re-examine the thesis: if it is invalidated, close, do not average down.

OUTPUT FORMAT — READ THIS TWICE, IT IS THE MOST IGNORED PART.
The screen ALREADY shows the legs, the strikes, the greeks, the max profit, the max loss and the breakevens, right next to your answer. Do NOT repeat them as a specification. Refer to them ("the $22/$23 call spread above") and spend your words on what the numbers MEAN.
- Write prose. Short paragraphs. NO tables, NO pipe characters, NO code fences, NO leg-by-leg listings.
- At most four short sections. Head each one with "## " and a plain-English title — "What this trade is betting on", not "STRUCTURE".
- Bullets with "- " only where a list is genuinely a list. **Bold** for the one number that matters in a paragraph, sparingly.
- Open with one sentence that answers the question asked. Close with what you would watch, and what would tell you the idea is wrong.
- Ask for confirmation before any execution.`;
/* ================================================================
   MARKDOWN, RENDERED — not printed

   The model answers in markdown. The panel used to drop it on screen with
   `white-space: pre-wrap`, so the reader got `## 1. STRUCTURE`, `**Ticker:**`
   and a wall of `|---|---|` pipes. The content was fine; it was being shown as
   source code. This is a deliberately small renderer — headings, bullets,
   numbered lists, bold, inline code, rules and tables — because the prompt now
   asks for prose and anything more elaborate is a sign the prompt drifted.
================================================================ */

/** `**bold**` and `` `code` `` inside a line. Returns React nodes. */
function inlineMd(text, keyBase = "i") {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<b key={`${keyBase}-b${n++}`} style={{ color: T.ink }}>{tok.slice(2, -2)}</b>);
    } else {
      out.push(<code key={`${keyBase}-c${n++}`} style={{ ...mono, fontSize: "0.92em", background: T.bg, padding: "1px 4px", borderRadius: 3 }}>{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const mdTableRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ text, style }) {
  if (!text) return null;
  // Code fences carry no meaning in an analysis; the prompt forbids them and a
  // stray one must not swallow the rest of the answer.
  const lines = String(text).replace(/```[a-z]*\n?/gi, "").split("\n");
  const blocks = [];
  let para = [], list = null;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={`p${blocks.length}`} style={{ margin: "0 0 9px", lineHeight: 1.6 }}>{inlineMd(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={`l${blocks.length}`} style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.6 }}>
      {list.items.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{inlineMd(it, `l${blocks.length}-${i}`)}</li>)}
    </Tag>);
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const t = line.trim();

    if (!t) { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push(<hr key={`h${blocks.length}`} style={{ border: "none", borderTop: `1px solid ${T.line}`, margin: "12px 0" }} />); continue; }

    const head = t.match(/^(#{1,4})\s+(.*)$/);
    if (head) {
      flush();
      const lvl = head[1].length;
      blocks.push(<div key={`hd${blocks.length}`} style={{
        ...(lvl <= 2 ? { ...mono, fontSize: 10.5, letterSpacing: "0.12em", color: T.amber, textTransform: "uppercase" } : { fontSize: 13.5, fontWeight: 700, color: T.ink }),
        margin: blocks.length ? "14px 0 6px" : "0 0 6px",
      }}>{inlineMd(head[2].replace(/^\d+[.)]\s*/, ""), `hd${blocks.length}`)}</div>);
      continue;
    }

    // a table: a header row, a separator row, then body rows
    if (t.startsWith("|") && /^\|[\s:|-]+\|?$/.test((lines[i + 1] || "").trim())) {
      flush();
      const header = mdTableRow(t);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(mdTableRow(lines[i])); i++; }
      i--;
      blocks.push(
        <div key={`t${blocks.length}`} style={{ overflowX: "auto", margin: "0 0 10px" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: "100%" }}>
            <thead><tr>{header.map((h, j) => (
              <th key={j} style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: T.dim, textAlign: "left", padding: "5px 9px", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>{rows.map((r, j) => (
              <tr key={j}>{r.map((c, k) => (
                <td key={k} style={{ padding: "5px 9px", borderBottom: `1px solid ${T.line}`, color: T.body, verticalAlign: "top" }}>{inlineMd(c, `t${j}-${k}`)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>);
      continue;
    }

    const bullet = t.match(/^[-*•]\s+(.*)$/);
    const numbered = t.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet || numbered)[1]);
      continue;
    }

    flushList();
    para.push(t);
  }
  flush();
  return <div style={{ fontSize: 13, color: T.body, ...style }}>{blocks}</div>;
}

export const SKILLS = [
  { id: "pretrade", label: "Pre-trade analysis", prompt: `Run the pre-trade analysis of the current strategy: structure, Greeks, risk/reward, breakevens against support and resistance, seasonal alignment and news. Finish with a GO/NO-GO checklist and a position size within the per-trade limit (${perTradeCapLabel()}).` },
  { id: "positions", label: "Position review", prompt: `Review the open positions against the rules (${ruleBadge()}): for each one give → HOLD / CLOSE / ROLL with the reasoning and the levels to watch. Remember the ${stopLossLabel()} rule is a warning, never an automatic close.` },
  { id: "news", label: "News impact", prompt: "Analyse the tagged news in context: which items affect my positions and the underlyings on the radar? Separate noise from signal, with cause→effect and a time horizon." },
  { id: "radar", label: "Opportunity radar", prompt: `From the seasonal scanner and the weather signals, propose the 2 best opportunities of this week with a suggested structure (relative strikes, ~${RULES.targetEntryDTE} DTE), the thesis, the risk and the entry trigger. Nothing below ${RULES.minEntryDTE} DTE at entry: the risk gate refuses it.` },
];
/**
 * Pull the text deltas out of one or more SSE frames.
 *
 * Pure, and separate from the fetch, so the parsing can be tested without a
 * network: the frame shape is Anthropic's contract and a mistake here is
 * silent — text simply goes missing.
 *
 * @param chunk raw bytes decoded to text; may end mid-frame
 * @param final when true the chunk is everything that is left, so the trailing
 *   frame is COMPLETE rather than partial and must be parsed instead of kept.
 *   See `askAI` below: without this the last frame of every stream is thrown
 *   away, and the last frame is where `message_stop` lives.
 * @returns { text, rest, stopped, stopReason } — the deltas found, the unparsed
 *   tail to keep, whether Anthropic said the message was FINISHED, and WHY it
 *   ended. The last two are different facts and the screen owes both: a stream
 *   that just stops is indistinguishable from one that finished unless the end
 *   is announced, and an answer that ran out of TOKEN BUDGET announces its end
 *   perfectly while still stopping mid-thought.
 */
export function sseDeltas(chunk, { final = false } = {}) {
  const frames = String(chunk).split("\n\n");
  // A PARTIAL FRAME IS ONLY PARTIAL WHILE MORE BYTES ARE COMING. On the last
  // read there is nothing more to arrive, so the tail is a whole frame and
  // discarding it drops the end of the message.
  const rest = final ? "" : (frames.pop() || "");
  let text = "", stopped = false, stopReason = null;
  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev = null;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
      // `message_delta` IS WHERE THE REASON LIVES, and it was being ignored.
      // Anthropic reports `stop_reason: "max_tokens"` here when the answer hit
      // the budget — and it still sends `message_stop` afterwards, so a
      // truncated answer arrived looking exactly like a finished one and was
      // filed in the Journal as complete.
      else if (ev.type === "message_delta" && ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
      else if (ev.type === "message_stop") stopped = true;
      else if (ev.type === "error") throw new Error(ev.error?.message || "The copilot stream failed part-way through.");
    }
  }
  return { text, rest, stopped, stopReason };
}

/**
 * Is this response body a GATEWAY talking rather than the API? Returns the
 * sentence to show, or null when the body is something else.
 *
 * A proxy timeout, a block page or a login wall all arrive as HTML. Dumping the
 * markup on screen — which is what happened — tells the reader nothing, and the
 * page title is usually the only part that names the cause.
 */
export function gatewayPageMessage(raw) {
  if (!/^\s*<(?:!doctype|html)/i.test(String(raw))) return null;
  const title = (String(raw).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  return `The request never reached the copilot: a gateway answered with a web page` +
    `${title ? ` titled \u201c${title.trim()}\u201d` : ""} instead of an answer. ` +
    `That is almost always a timeout on a long analysis rather than a problem with the key.`;
}

/**
 * Ask the copilot. STREAMS, always.
 *
 * A full analysis takes tens of seconds to write. Waiting for the whole thing
 * before the first byte moves leaves the connection silent, and a gateway in
 * the middle kills a silent connection: the reader gets an HTML page saying
 * "Too much time has passed without sending any data for document" where the
 * analysis should have been. Streaming keeps bytes flowing from the first
 * token, so there is no silence to time out — and the answer can be shown as it
 * is written instead of all at once at the end.
 *
 * @param onDelta called with the text SO FAR each time more of it arrives
 * @returns the finished text
 */
export async function askAI(_key, messages, contextStr, onDelta) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      stream: true,
      system: SYSTEM_PROMPT + "\n\nLIVE CONTEXT (JSON):\n" + contextStr,
      messages,
    }),
  });

  // The happy path: server-sent events, one text delta at a time.
  if (r.ok && r.body && /text\/event-stream/i.test(r.headers.get("content-type") || "")) {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", finished = false, why = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { text: more, rest, stopped, stopReason } = sseDeltas(buf);
      buf = rest;
      if (stopped) finished = true;
      if (stopReason) why = stopReason;
      if (more) { text += more; if (onDelta) onDelta(text); }
    }
    // FLUSH BEFORE DECIDING. `sseDeltas` holds the trailing frame back on every
    // read because TCP does not respect frame boundaries — but once the reader
    // says `done` there is no next read to hand it to, and Anthropic's closing
    // `message_stop` does not always arrive with a blank line after it. Without
    // this the last frame of every stream is discarded as partial, so a
    // COMPLETE answer was reported as cut off every single time.
    if (buf.trim()) {
      const tail = sseDeltas(buf, { final: true });
      if (tail.stopped) finished = true;
      if (tail.stopReason) why = tail.stopReason;
      if (tail.text) { text += tail.text; if (onDelta) onDelta(text); }
    }
    if (!text.trim()) throw new Error("The copilot returned an empty answer.");
    // RUNNING OUT OF ROOM IS NOT A DROPPED CONNECTION. Both stop the answer
    // mid-thought and neither may be filed as finished, but they need different
    // things from the reader: a cut connection is worth asking again, a budget
    // that ran out will do the same thing next time unless the question is
    // narrower. This is checked FIRST, because such a stream DOES carry
    // `message_stop` — Anthropic announces the end perfectly, and the answer is
    // still truncated — so without reading `stop_reason` it passes as whole.
    if (finished && why === "max_tokens") {
      const err = new Error(
        "The copilot ran out of room before it finished: this answer hit its length limit rather than " +
        "reaching an end. What arrived is kept below and stops mid-thought — a narrower question gets a " +
        "whole answer, where asking the same one again would hit the same limit.");
      err.partial = text;
      err.reason = "max_tokens";
      throw err;
    }
    if (!finished) {
      // The stream stopped without Anthropic saying the message was done: the
      // connection was cut mid-sentence. Returning what arrived would file half
      // an analysis in the Journal as a finished one. The words are kept — they
      // are still worth reading — but they travel WITH the fact that they stop
      // early, and the caller decides what to do about it.
      const err = new Error(
        "The copilot was cut off before it finished this answer: the connection ended without the copilot " +
        "ever saying it was done. What arrived is kept below, but it stops mid-thought — ask again to get " +
        "the whole thing.");
      err.partial = text;
      err.reason = "cut";
      throw err;
    }
    return text;
  }
  // The real API message is the only useful thing when this fails — a missing
  // workspace id, an expired key, a rate limit all say exactly what to fix.
  // Never replace it with a generic sentence.
  const raw = await r.text();
  let j = null;
  try { j = JSON.parse(raw); } catch { /* the proxy returned something that is not JSON */ }
  if (!j) {
    // An HTML page here is a GATEWAY talking, not the API: a timeout, a proxy
    // block or a login wall. Dumping its markup on screen tells the reader
    // nothing — keep the title, which usually names what happened, and say what
    // kind of failure it is.
    const gateway = gatewayPageMessage(raw);
    if (gateway) throw new Error(gateway);
    throw new Error(raw.trim().slice(0, 300) || `The copilot endpoint answered HTTP ${r.status} with an empty body.`);
  }
  if (j.error) {
    // The API's own sentence, plus what the proxy actually sent. Without the
    // second half "workspace id required" and "wrong key" read the same on
    // screen, and the person who has to fix it cannot tell which it is.
    const d = j.error.sent;
    const detail = d
      ? ` [ai.mjs sent: model ${d.model || "none"}, headers ${(d.headers || []).join(" ")}, anthropic-workspace-id ${d.workspaceHeader}]`
      : "";
    throw new Error((j.error.message || JSON.stringify(j.error).slice(0, 300)) + detail);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.trim().slice(0, 300)}`);
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
export function buildContext(ctx) {
  const { store, scan, news, ticker, legs, expKey, A, spot, seasonalSrc } = ctx;
  return JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    currentTicker: ticker,
    spot,
    // A BEST CASE THE APP DOES NOT HAVE IS `null` IN THE JSON, not a number.
    // `+null.toFixed(0)` also throws, so this is the crash guard as well as the
    // honesty one: a model handed a maximum profit of 0 for a long call would
    // write a take-profit target of $0 into the report.
    currentStrategy: A ? { legs, expKey, entry: +(A.entry * 100).toFixed(0), maxProfit: dollarsOrNull(A.maxProfit), maxLoss: dollarsOrNull(A.maxLoss), breakevens: A.breakevens, greeks: { delta: +A.greeks.delta.toFixed(2), theta: +A.greeks.theta.toFixed(0), vega: +A.greeks.vega.toFixed(0) } } : null,
    // THE MODEL'S BOOK IS THE BOOK. `reportNarrativePrompt()` tells it that
    // `paperPositions` is AUTHORITATIVE, so a trade the broker never filled
    // handed over in this array is a position the model is entitled to write
    // about — the §4c fault ("entered at $68 debit" under a section saying
    // "No open positions") rebuilt one array across.
    paperPositions: bookPositions(store.positions).map((p) => ({ ticker: p.ticker, name: p.name, legs: p.legs, exp: p.expKey, entry: +(p.entryNet * 100).toFixed(0), maxProfit: dollarsOrNull(p.maxProfit), maxLoss: dollarsOrNull(p.maxLoss), openedAt: p.openedAt.slice(0, 10), thesis: p.thesis || null,
      // THE MODEL READS THE TIMELINE, so it reads the warning too: an entry
      // whose simulation ran to a horizon the app no longer uses must not be
      // quoted back as if it described today's rule.
      // ...and the volatility warning too, for the same reason: the figures the
      // rationale is written on were walked at it, and a record that cannot say
      // which must not be quoted back as if it could.
      timeline: (p.timeline || []).slice(-5).map((e) => [e.text, autopilotHorizonNote(e), autopilotVolNote(e)].filter(Boolean).join(" ")) })),
    // WHICH SEASONAL TABLE EACH MARKET IS ON, IN THE MODEL'S OWN CONTEXT. It
    // read "real history" or "estimate" with no age and no year count, and the
    // per-position `thesis` it is handed below now carries the same stamp for
    // the chance recorded at entry — so the model cannot describe a
    // hand-written guess as a measurement of the market.
    // NULL, NEVER A ROUNDED NOTHING. A market with no seasonal reading must not
    // reach the model as `seasonalMonthPct: 0` — `Number(null).toFixed(1)` is
    // "0.0", and the model would read that as a measurement of no edge.
    scanner: (scan || []).map((s) => ({ tk: s.tk, seasonalMonthPct: s.seasonalScore == null ? null : +s.seasonalScore.toFixed(1), sentiment: s.sugg, source: seasonalStampNote(s, s.tk),
      fourFactorSignal: s.fused ? { score: s.fused.score, confidence: s.fused.confidence, agreement: s.fused.agreement, narrative: s.fused.narrative } : null })),
    taggedNews: (news || []).slice(0, 10).map((n) => ({ title: n.title, geo: !!n.geo,
      impacts: (n.impacts || []).map((im) => ({ tk: im.tk, dir: ARROW[im.dir], why: im.why })) })),
    seasonalitySource: seasonalSrc,
  });
}
/**
 * THE CONVERSATION DOES NOT LIVE HERE.
 *
 * This panel is one of the five evidence panels on the Build screen, and it is
 * rendered only while it is the open one. Every other chip in that strip
 * UNMOUNTS it — so when `msgs`, `busy` and `err` were local state, tapping
 * another chip destroyed the answer, and an answer that arrived while the panel
 * was closed was thrown away by React before it could be shown. The reported
 * symptom was exactly that: "the analysis starts, nothing appears in the
 * Copilot tab, and if I change tab the run seems already finished or gone."
 *
 * So the conversation is owned by App.jsx and passed in. The panel is a view of
 * it, nothing more: a request that finishes while the panel is shut lands in the
 * app's state and is waiting when it is opened again, and the chip that opens it
 * can say so.
 *
 * @param convo    { msgs, busy, err } — owned by the caller
 * @param setConvo the caller's setter
 */
export function CopilotTab({ ctx, apiKey, convo, setConvo, onAnalysis }) {
  const { msgs = [], busy = false, err = null, partial = "" } = convo || {};
  const [input, setInput] = useState("");
  const send = async (text, label) => {
    if (!text.trim() || busy) return;
    if (!apiKey) { setConvo((c) => ({ ...c, err: "The copilot is not configured on the server." })); return; }
    const next = [...msgs, { role: "user", content: text }];
    setConvo({ msgs: next, busy: true, err: null, partial: "" });
    setInput("");
    try {
      // The answer is shown AS IT ARRIVES. A pre-trade analysis takes tens of
      // seconds to write, and a motionless "Thinking…" for that long is
      // indistinguishable from a hang — which is how the gateway timeout got
      // reported as "it does nothing" in the first place.
      const reply = await askAI(
        apiKey,
        next.map((m) => ({ role: m.role, content: m.content })),
        buildContext(ctx),
        (sofar) => setConvo((c) => ({ ...c, partial: sofar })));
      setConvo({ msgs: [...next, { role: "assistant", content: reply }], busy: false, err: null, partial: "" });
      // THE JOURNAL IS THE RECORD OF WHAT THE APP DID. An analysis run here is
      // part of that record — the Journal's report was already quoting "the
      // copilot's read" while these runs left no trace at all, so the two told
      // different stories about the same day.
      if (onAnalysis) onAnalysis({ label: label || "Question", prompt: text, answer: reply, ticker: ctx?.ticker || null });
    } catch (e) {
      // KEEP the question. Rolling `msgs` back to what it was before also
      // deleted what the user had just asked, so a failure looked like the tap
      // had never happened. And keep a CUT-OFF answer, marked as cut off: the
      // words that did arrive are worth reading, they are just not the whole
      // thing, and the difference has to be visible rather than assumed.
      const cut = e && e.partial;
      // WHICH OF THE TWO HAPPENED travels with the words. Running out of room
      // and losing the connection both leave half an answer, and the label has
      // to say which — "ask again" is the right advice for one of them and
      // useless for the other.
      setConvo({
        msgs: cut ? [...next, { role: "assistant", content: cut, truncated: true, reason: e.reason || "cut" }] : next,
        busy: false, err: String(e.message || e), partial: "",
      });
    }
  };
  /** Print what is on screen. The browser's own dialog also saves to PDF. */
  const printConvo = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const body = msgs.map((m) => m.role === "user"
      ? `<h2>${esc(m.content)}</h2>`
      : `<div class="a">${esc(m.content)
        .replace(/^#{1,4}\s+(.*)$/gm, "<h3>$1</h3>")
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/^[-*]\s+(.*)$/gm, "<li>$1</li>")
        .replace(/\n{2,}/g, "<br/><br/>")}</div>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Copilot analysis</title><style>
      body{font-family:Georgia,serif;color:#1c2128;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6}
      h1{font-size:20px;border-bottom:2px solid #b07d18;padding-bottom:6px}
      h2{font-size:13px;color:#555;font-family:ui-monospace,monospace;margin:22px 0 6px}
      h3{font-size:12px;color:#b07d18;letter-spacing:.06em;text-transform:uppercase;margin:14px 0 4px}
      .a{font-size:13.5px} li{font-size:13px}
      @media print{.noprint{display:none}}</style></head><body>
      <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">Print or save as PDF</button>
      <h1>Copilot analysis — ${esc(ctx?.ticker || "")} · ${esc(new Date().toLocaleString("en-GB"))}</h1>
      ${body}
      <p style="font-size:11px;color:#777;margin-top:24px">Paper trading only. Educational analysis, not financial advice.</p>
      </body></html>`);
    w.document.close();
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><Sparkles size={11} style={{ verticalAlign: "-1px" }} /> AI COPILOT · IT ALREADY KNOWS YOUR POSITIONS</Lbl>
          {msgs.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small ghost color={T.blue} onClick={printConvo}><FileText size={11} /> Print</Btn>
              <Btn small ghost onClick={() => setConvo({ msgs: [], busy: false, err: null })}><Trash2 size={11} /> Clear</Btn>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {SKILLS.map((sk) => <Btn key={sk.id} small ghost color={T.blue} onClick={() => send(sk.prompt, sk.label)} disabled={busy}>{sk.label}</Btn>)}
        </div>
        {/* No fixed-height window. An analysis is meant to be READ, and a 420px
            box on a desktop turned every answer into a peephole. It grows with
            the answer; the page scrolls, as pages do. */}
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {msgs.length === 0 && !busy && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Pick one above or just ask. The copilot already knows your open positions, the trade on the Build screen, the Radar, the tagged news and your own risk rules.</div>}
          {msgs.map((m, i) => (
            <div key={i} style={{ padding: m.role === "user" ? "9px 11px" : "11px 13px", borderRadius: 7, background: m.role === "user" ? `${T.blue}14` : T.bg, border: `1px solid ${m.role === "user" ? T.blue + "44" : T.line}` }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: m.role === "user" ? T.blue : T.amber, marginBottom: m.role === "user" ? 3 : 7 }}>{m.role === "user" ? "YOU ASKED" : m.truncated ? (m.reason === "max_tokens" ? "COPILOT · RAN OUT OF ROOM" : "COPILOT · CUT OFF") : "COPILOT"}</div>
              {m.role === "user"
                ? <div style={{ fontSize: 12.5, color: T.body, lineHeight: 1.5 }}>{m.content}</div>
                : <>
                  <Markdown text={m.content} />
                  {m.truncated && (
                    <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.amber}44`, lineHeight: 1.6 }}>
                      This answer stops here because the connection was cut, not because the copilot had finished.
                    </div>
                  )}
                </>}
            </div>
          ))}
          {busy && (
            partial
              ? (
                <div style={{ padding: "11px 13px", borderRadius: 7, background: T.bg, border: `1px solid ${T.line}` }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: T.amber, marginBottom: 7 }}>COPILOT · WRITING</div>
                  <Markdown text={partial} />
                </div>
              )
              : (
                <div style={{ ...mono, fontSize: 11, color: T.amber }}>
                  Thinking… you can close this panel: the answer waits here, it is not lost.
                </div>
              )
          )}
        </div>
        {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Inp value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask a question… (Enter to send)" style={{ flex: 1 }} />
          <Btn onClick={() => send(input)} disabled={busy}><Send size={13} /></Btn>
        </div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
          Every analysis you run here is filed in the Journal with its question, so the Journal and this panel tell the
          same story about the same day. Educational analysis on a paper account, not financial advice.
        </div>
      </Panel>
    </div>
  );
}

/* ================================================================
   5) REPORT CENTER: routine schedulata + export + webhook
================================================================ */
export function buildReportMd(ctx, weatherSig, aiText) {
  const { store, scan, news, seasonalSrc } = ctx;
  const d = new Date().toLocaleString("en-GB");
  const L = [];
  L.push(`# Commodity Options Report — ${d}\n`);
  L.push(`## 1 · Opportunities (seasonal scanner)`);
  // WHICH TABLE EACH FIGURE CAME FROM, PER MARKET. "(real history)" against
  // "(estimate)" was two words with no age and no year count behind them, and
  // the footer then asserted ONE seasonality source for a document covering
  // five markets that routinely have two. `seasonalStampNote()` is the same
  // sentence every screen prints, read off the row's own stamp — and a row with
  // no stamp is one written before the app recorded one, which the sentence
  // says rather than guessing.
  (scan || []).slice(0, 3).forEach((s, i) => L.push(
    `${i + 1}. **${s.tk}** — seasonal ${s.seasonalScore == null ? "not read" : `${s.seasonalScore > 0 ? "+" : ""}${s.seasonalScore.toFixed(1)}%/mo`} → leaning **${s.sugg.toUpperCase()}**\n   _${seasonalStampNote(s, s.tk)}_`));
  L.push(`\n## 2 · Positions against the rules (${ruleBadge()})`);
  /* THE SAME BOOK THE RISK GATE MEASURES, AND THE SAME UNITS.
     Two faults in one paragraph, both read on the phone on 21 September 2026:
     it listed `store.positions` whole — so three orders that came back with
     nothing bought were reported as positions, in a document whose job is to
     say what is open — and it summed `maxLoss` RAW. `maxLoss` describes ONE
     combination (`analyze()` multiplies by each leg's own qty, never by the
     order's); the size lives on the record and is read through
     `positionSize()`, which is what the gate multiplies by. A ten-lot spread
     was therefore reported at a tenth of the money it risks. */
  const book = bookPositions(store.positions);
  if (!book.length) L.push("No open positions.");
  book.forEach((p) => {
    const dte = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
    const n = positionSize(p).contracts;
    L.push(`- **${p.ticker} · ${p.name}** — expires ${p.expKey || "n/a"} (${dte} days)${dte <= RULES.exitDTE ? ` ⚠ **${RULES.exitDTE} days or fewer: close or roll**` : ""} · opened at ${fmt$(Math.abs(p.entryNet) * 100)} · can make ${Number.isFinite(p.maxProfit) ? fmt$(p.maxProfit) : NO_CEILING} / can lose ${fmt$(p.maxLoss)}${n > 1 ? ` · per combination, ×${n} on this position` : ""}`);
  });
  if (book.length) {
    const totRisk = book.reduce((a, p) => a + Math.abs(p.maxLoss) * positionSize(p).contracts, 0);
    // A TOTAL CANNOT INCLUDE AN UNKNOWN AND STILL BE A TOTAL. `Math.max(0, null)`
    // is 0, which would quietly report a position with no ceiling as adding
    // nothing to what can be made.
    const noCeil = book.filter((p) => !Number.isFinite(p.maxProfit)).length;
    const totMaxP = book.reduce((a, p) => a + (Number.isFinite(p.maxProfit) ? Math.max(0, p.maxProfit) * positionSize(p).contracts : 0), 0);
    L.push(`\n**Across everything:** ${fmt$(totRisk)} at risk · up to ${fmt$(totMaxP)} to be made` +
      (noCeil ? ` from the ${book.length - noCeil} with a ceiling, plus ${noCeil} with ${NO_CEILING} on the profit, which cannot be added to a total` : ""));
  }
  L.push(`\n## 3 · Headlines that matter (cause → effect, politics included)`);
  (news || []).filter((n) => (n.impacts || []).length).slice(0, 8).forEach((n) => {
    L.push(`- ${n.title} ${n.geo ? "(policy)" : ""}\n  ${(n.impacts || []).map((im) => `**${im.tk} ${ARROW[im.dir]}** (${im.why})`).join(" · ")}`);
  });
  L.push(`\n## 4 · Weather → commodities (next 14 days)`);
  (weatherSig || []).forEach((s) => L.push(`- **${s.tks.join("+")} ${s.dir}** — ${s.region}: ${s.why}`));
  if (aiText) { L.push(`\n## 5 · The copilot\u2019s read`); L.push(aiText); }
  // The analyses run from the Copilot panel are part of the same record. The
  // report used to carry only its OWN model call, so a day with three pre-trade
  // analyses on it produced a report that mentioned none of them.
  const runs = (store.copilotLog || []).slice(0, 5);
  if (runs.length) {
    L.push(`\n## 6 \u00b7 Analyses you ran in the copilot`);
    runs.forEach((c) => {
      L.push(`\n### ${c.label || "Question"}${c.ticker ? ` \u2014 ${c.ticker}` : ""} \u00b7 ${new Date(c.t).toLocaleString("en-GB")}`);
      L.push(`_Asked:_ ${String(c.prompt).slice(0, 300)}`);
      L.push(String(c.answer || ""));
    });
  }
  // The footer names the screen the report was generated from, and NOT the
  // whole document's seasonality: each market above carries its own, because
  // four of five can be on the hand-written estimate while the fifth is not.
  L.push(`\n---\n_Generated from the ${seasonalSrc} reading on screen; each market above states its own seasonal source. Paper trading only. Educational software, not financial advice._`);
  return L.join("\n");
}
function svgPayoff(legs, entryNet, S0) {
  const lo = S0 * 0.8, hi = S0 * 1.2, W = 300, H = 80, N = 60;
  const ys = [];
  for (let i = 0; i <= N; i++) {
    const s = lo + (i / N) * (hi - lo);
    ys.push((legs.reduce((a, l) => a + Math.sign(l.side) * l.qty * (l.type === "call" ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0)), 0) - entryNet) * 100);
  }
  const ymin = Math.min(...ys), ymax = Math.max(...ys), yr = Math.max(1, ymax - ymin);
  const pt = (i) => `${(i / N * W).toFixed(1)},${(H - (ys[i] - ymin) / yr * H).toFixed(1)}`;
  const d = ys.map((_, i) => (i ? "L" : "M") + pt(i)).join("");
  const zy = H - (0 - ymin) / yr * H;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><line x1="0" x2="${W}" y1="${zy}" y2="${zy}" stroke="#bbb"/><path d="${d}" fill="none" stroke="#b07d18" stroke-width="2"/></svg>`;
}
export function exportPdf(ctx, md) {
  const { store } = ctx;
  // THE PDF DRAWS THE SAME BOOK THE MARKDOWN LISTS. A payoff chart for a trade
  // nobody bought is the §4m fault in a picture.
  const posHtml = bookPositions(store.positions).map((p2) => `
    <div class="pos"><h3>${p2.ticker} · ${p2.name}</h3>
      ${svgPayoff(p2.legs, p2.entryNet, p2.entrySpot)}
      <p class="m">${p2.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · exp ${p2.expKey || "n/d"} · max profit ${Number.isFinite(p2.maxProfit) ? `$${p2.maxProfit.toFixed(0)}` : NO_CEILING} · max loss $${Math.abs(p2.maxLoss)?.toFixed(0)}</p>
      ${(p2.timeline || []).slice(-4).map((e) => `<p class="tl">${new Date(e.t).toLocaleDateString("en-GB")} · ${e.text.replace(/\[approva:.*?\]/, "")}${[autopilotHorizonNote(e), autopilotVolNote(e)].filter(Boolean).map((n) => ` <b>\u26a0 ${n}</b>`).join("")}</p>`).join("")}
    </div>`).join("");
  const body = md
    .replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\n{2,}/g, "<br/>");
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Report</title><style>
    body{font-family:Georgia,serif;color:#1c2128;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.5}
    h1{font-size:22px;border-bottom:2px solid #b07d18;padding-bottom:6px} h2{font-size:15px;color:#b07d18;letter-spacing:.05em;margin-top:22px}
    h3{font-size:13px;margin:14px 0 4px} li{font-size:12.5px} .m{font-family:monospace;font-size:11px;color:#555;margin:4px 0}
    .tl{font-family:monospace;font-size:10.5px;color:#777;margin:2px 0} .pos{page-break-inside:avoid;border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin:10px 0}
    @media print {.noprint{display:none}}</style></head><body>
    <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">Print or save as PDF</button>
    ${body}<h2>Positions in detail</h2>${posHtml || "<p>No open positions.</p>"}
    </body></html>`);
  w.document.close();
}
export function ReportTab({ ctx, apiKey, setSetting }) {
  const { store } = ctx;
  const cfg = { freq: store.settings.reportFreq || "weekly", last: store.settings.reportLast || 0 };
  const [md, setMd] = useState(store.settings.reportLastMd || "");
  const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(!!apiKey);
  // A report that writes ITSELF has to say that it did. This one runs on the
  // effect below whenever one is due, so a user who opened the Journal and
  // found a document where there had been nothing had no way to know whether he
  // had caused it, whether the copilot had put it there, or what it was.
  const [autoRan, setAutoRan] = useState(false);
  const dueMs = cfg.freq === "daily" ? 864e5 : 6048e5;
  const isDue = Date.now() - cfg.last > dueMs;
  const gen = async () => {
    setBusy(true);
    let wsig = [];
    try { wsig = weatherSignals(await fetchWeather()); } catch { /* meteo opzionale */ }
    let ai = null;
    if (useAI && apiKey) {
      // THE PROMPT IS GENERATED FROM THE BOOK, not written as if there were
      // always one. `reportNarrativePrompt()` in src/rules.js: with no open
      // positions it does not ask about them and states that `paperPositions`
      // is authoritative, which is how "the BOIL $20.50/$22.50 call spread
      // entered at $68 debit" appeared in a report whose own section 2 said
      // "No open positions."
      try { ai = await askAI(apiKey, [{ role: "user", content: reportNarrativePrompt(bookPositions(store.positions)) }], buildContext(ctx)); }
      catch (e) { ai = `(the copilot could not be reached: ${e.message})`; }
    }
    const out = buildReportMd(ctx, wsig, ai);
    setMd(out);
    setSetting("reportLast", Date.now());
    setSetting("reportLastMd", out);
    setBusy(false);
  };
  useEffect(() => { if (isDue && (ctx.scan || []).length) { setAutoRan(true); gen(); } }, []); // eslint-disable-line — auto all'apertura se scaduto
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
  };
  const toWebhook = async () => {
    try {
      await fetch(store.settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "Commodity Options Report", markdown: md, generatedAt: new Date().toISOString() }) });
      ctx.setMsg("Report sent to your webhook.");
    } catch (e) { ctx.setMsg(`The webhook failed: ${e.message}`); }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><FileText size={11} style={{ verticalAlign: "-1px" }} /> REPORTS · {cfg.freq === "daily" ? "DAILY" : "WEEKLY"} {isDue ? "· ⚠ DUE NOW" : "· ✓ UP TO DATE"}</Lbl>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Sel value={cfg.freq} onChange={(e) => setSetting("reportFreq", e.target.value)}>
              <option value="daily">Every day</option><option value="weekly">Every week</option>
            </Sel>
            <Btn small onClick={gen} disabled={busy}><RefreshCw size={11} /> {busy ? "Writing…" : "Write it now"}</Btn>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...mono, fontSize: 11, color: T.mut, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> include the copilot's read
          </label>
          <span style={{ ...mono, fontSize: 10, color: T.dim }}>last one: {cfg.last ? new Date(cfg.last).toLocaleString("en-GB") : "never"}</span>
        </div>
        {autoRan && (
          <div style={{ ...mono, fontSize: 10.5, color: T.blue, marginTop: 8, padding: "7px 9px", background: `${T.blue}0f`, border: `1px solid ${T.blue}44`, borderRadius: 6, lineHeight: 1.6 }}>
            This report wrote ITSELF just now, because the {cfg.freq === "daily" ? "daily" : "weekly"} one was due and
            you opened the Journal. Nothing was sent anywhere{useAI ? ", and section 5 is the copilot's read — the same model as the Copilot panel, asked a different question" : ""}. Press "Write it now" to redo it.
          </div>
        )}
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>
          Each report covers: scanner opportunities, your positions against the rules, tagged headlines, weather effects, and optionally the copilot's read. It rewrites itself when you reopen the app and one is due.
        </div>
      </Panel>
      {md && (
        <Panel style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Lbl>PREVIEW</Lbl>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small ghost onClick={download}><Download size={11} /> .md</Btn>
              <Btn small color={T.amber} onClick={() => exportPdf(ctx, md)}><FileText size={11} /> Export PDF</Btn>
              {store.settings.webhook && <Btn small ghost color={T.violet} onClick={toWebhook}><Send size={11} /> Send to webhook</Btn>}
            </div>
          </div>
          <pre style={{ ...mono, fontSize: 11.5, color: T.body, whiteSpace: "pre-wrap", marginTop: 10, maxHeight: 460, overflowY: "auto" }}>{md}</pre>
        </Panel>
      )}
    </div>
  );
}

/* ================================================================
   6) OPTIMIZER: scaling per obiettivo di ricavo o budget di premio
================================================================ */
export function scaleStrategy(a, mode, amt) {
  const risk = Math.abs(a.maxLoss);              // capitale a rischio per 1 combo ($)
  const prem = Math.abs(a.entry) * 100;          // premio per 1 combo ($, da chain reale)
  const isCredit = a.entry < 0;
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(a.maxProfit) || a.maxProfit <= 0) return null;
  // Budget = premio max da pagare (debit) oppure capitale a rischio (credit, dove il premio si incassa)
  const unit = isCredit ? risk : prem;
  // NOTHING IS EVER DIVIDED BY A COST THE APP COULD NOT READ. `Math.max(prem, 1)`
  // used to stand in for a premium of zero, and on the BOIL butterfly that
  // turned a $250 budget into 250 contracts of a structure whose price was a
  // placeholder. A unit under the minimum is not a cheap trade: it is an
  // unpriced one (`priceability()` in rules.js), and the caller says so instead
  // of printing a quantity.
  if (!Number.isFinite(unit) || unit < MIN_NET_DOLLARS) {
    return { n: 0, ok: false, unpriceable: true, risk, prem, isCredit, unit };
  }
  let n;
  if (mode === "budget") n = Math.floor(amt / unit);
  else n = Math.ceil(amt / a.maxProfit);
  if (!Number.isFinite(n) || n < 1) return { n: 0, ok: false, risk, prem, isCredit, unit };
  return { n, ok: true, isCredit, totProfit: n * a.maxProfit, totRisk: n * risk, totPrem: n * prem, prem, risk, unit };
}
/* `probProfit(curve, S, sigma, dte)` LIVED HERE AND IS DELETED.

   CLAUDE.md used to say this duplication was deliberate and must not be merged
   with `probProfit` in engine.js, because the two had different signatures and
   this one worked on an already-built payoff `curve` rather than on `legs`.
   That note was about the SHAPE of the two functions and it was true; it was
   never a defence of the ANSWER, and the answer was the problem. Both of them
   integrated the expiry payoff against a lognormal with a risk-neutral drift of
   0.045, while the Build screen's own Monte Carlo drifted on the app's seasonal
   thesis and `chanceInProfit()` drifted on nothing at all. Four arithmetics,
   one question, four numbers.

   There is one now: `terminalMC()` in engine.js, through `chanceOf()` in
   rules.js, seeded from the position so every screen lands on the same figure.
   This file is handed the answer (`popNow` / `chanceNow` on `GuardianPanel`)
   rather than working one out of its own.

   `exitPathSim` below KEEPS its own body and its own signature, and that note
   still stands: it answers a different question — what happens along the path
   under the exit rule — and the UI depends on the extra fields it returns.
*/

/* ================================================================
   7) POSITION GUARDIAN — TIS, Exit Path Simulator, Exit Ladder, Timeline
================================================================ */
// Thesis Integrity Score 0-100, scomposto
export function computeTIS(pos, cur) {
  // cur: { pop, ivNow, seasonalNow, dteLeft, vegaSign }
  const th = pos.thesis || {};
  const comp = [];
  // 1) PoP vs entry (40)
  let popPts = 20;
  if (th.pop != null && cur.pop != null && th.pop > 0) popPts = Math.round(Math.max(0, Math.min(1.2, cur.pop / th.pop)) / 1.2 * 40);
  comp.push({ k: "Chance of profit", pts: popPts, max: 40, note: cur.pop != null ? `${chanceText(cur.pop)} now versus ${th.pop != null ? chanceText(th.pop) : "?"} when you opened it` : "n/a" });
  // 2) Stagionalità (20)
  let seaPts = 10;
  if (th.seasonal != null && cur.seasonalNow != null) {
    const same = Math.sign(th.seasonal) === Math.sign(cur.seasonalNow) || th.seasonal === 0;
    seaPts = same ? (Math.abs(cur.seasonalNow) >= Math.abs(th.seasonal) * 0.5 ? 20 : 12) : 4;
  }
  comp.push({ k: "Season", pts: seaPts, max: 20, note: `${th.seasonal?.toFixed?.(1) ?? "?"}%/mo when you opened it → ${cur.seasonalNow?.toFixed?.(1) ?? "?"}%/mo now` });
  // 3) IV a favore (20): vega+ vuole IV su, vega- IV giù
  let ivPts = 10;
  if (th.iv != null && cur.ivNow != null && cur.vegaSign) {
    const dIV = cur.ivNow - th.iv;
    const fav = cur.vegaSign * dIV;
    ivPts = fav > 0.01 ? 20 : fav < -0.02 ? 2 : 10;
  }
  comp.push({ k: "Market nerves", pts: ivPts, max: 20, note: `${th.iv != null ? (th.iv * 100).toFixed(0) : "?"}% → ${cur.ivNow != null ? (cur.ivNow * 100).toFixed(0) : "?"}%, and this trade ${cur.vegaSign > 0 ? "wants that to rise" : "wants that to fall"}` });
  // 4) Tempo (20)
  const dtePts = cur.dteLeft > RULES.exitDTE * 2 ? 20 : cur.dteLeft > RULES.exitDTE ? 10 : 0;
  comp.push({ k: "Time left", pts: dtePts, max: 20, note: `${cur.dteLeft} days (the rule closes it at ${RULES.exitDTE})` });
  const tis = comp.reduce((a, c) => a + c.pts, 0);
  return { tis, comp };
}

/**
 * Exit Path Simulator: MC giornaliero DA OGGI, regole da src/rules.js.
 *
 * AND THE VOLATILITY IS A PROVENANCE, NOT A NUMBER — the same change `exitSim`
 * took in engine.js, for the same reason. `sigma` used to arrive here as
 * `seasonal[tk]?.sigma || getU(tk).sigma` from App.jsx while the brief's
 * `exitSim` read `SIGMA[pos.ticker]` with no measured value available to it at
 * all, so the Guardian and the autopilot walked ONE position on TWO
 * volatilities and every figure below moved with it. `sigmaProvenance()` in
 * rules.js is the one home; this takes its RESULT and returns the sigma and the
 * source it used, so the panel prints which volatility produced its own
 * numbers instead of the caller asserting it.
 *
 * @param vol  a `sigmaProvenance()` result: { sigma, source, ... }
 */
export function exitPathSim(pos, S, dteLeft, iv, vol, nSim = 2000) {
  const { legs, entryNet, maxProfit, maxLoss } = pos;
  const { sigma, source: sigmaSource } = vol || {};
  if (!Number.isFinite(sigma) || sigma < 0 || typeof sigmaSource !== "string" || !sigmaSource) {
    throw new TypeError(
      "exitPathSim needs a sigmaProvenance() result as `vol`, never a bare SIGMA lookup: see src/rules.js",
    );
  }
  // `RULES.takeProfitPct * null` is 0: without this the simulator would count
  // every path that ever touched break-even as a take-profit exit, and report a
  // rule the app never applied.
  const tp = Number.isFinite(maxProfit) ? RULES.takeProfitPct * maxProfit : null;
  const sl = RULES.stopLossPct * maxLoss;
  const days = Math.max(1, dteLeft - RULES.exitDTE);
  const dt = 1 / 365, sq = sigma * Math.sqrt(dt);
  let nTP = 0, nSL = 0, nTimePos = 0, nTimeNeg = 0, sumExit = 0;
  const tpDays = [];
  for (let i = 0; i < nSim; i++) {
    let s = S, done = false;
    for (let d = 1; d <= days; d++) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      s = s * Math.exp(-0.5 * sigma * sigma * dt + sq * z);
      const pnl = (netBS(legs, s, dteLeft - d, iv) - entryNet) * 100;
      if (tp != null && pnl >= tp) { nTP++; tpDays.push(d); sumExit += pnl; done = true; break; }
      if (pnl <= sl) { nSL++; sumExit += pnl; done = true; break; }
    }
    if (!done) {
      // THE SURVIVORS ARE MARKED WHERE THE RULE ENDS THE TRADE, and this was a
      // bare 7 — the fourth copy of the fault `exitSim` carried in engine.js.
      // The walk above already stops at `RULES.exitDTE`; marking the survivors
      // at 7 priced them fourteen days past the day the app closes them.
      const pnl = (netBS(legs, s, RULES.exitDTE, iv) - entryNet) * 100;
      if (pnl > 0) nTimePos++; else nTimeNeg++;
      sumExit += pnl;
    }
  }
  tpDays.sort((a, b) => a - b);
  return {
    pTP: nTP / nSim, pSL: nSL / nSim, pTimePos: nTimePos / nSim, pTimeNeg: nTimeNeg / nSim,
    evExit: sumExit / nSim, medTPdays: tpDays.length ? tpDays[Math.floor(tpDays.length / 2)] : null,
    pWin: (nTP + nTimePos) / nSim, horizon: days,
    // WHAT THESE FIGURES ARE AN ANSWER ABOUT, from the walk itself.
    sigma, sigmaSource,
  };
}

// Exit Ladder: prezzo netto combo per target P&L
export const ladderNet = (entryNet, targetPnl) => entryNet + targetPnl / 100;

export function GuardianPanel({ pos, spot, dteLeft, ivNow, vol, seasonalNow, pnlNow, popNow, chanceNow, seasonalNote, thesisSeasonalNote, vegaSign, alpaca, quoteFn, setMsg, logEvent, gate }) {
  // How many combinations this position is. `pos.maxProfit`, `pos.maxLoss` and
  // `pos.entryNet` are all per combination; `pnlNow` is the whole position's.
  const size = contractsOf(pos);
  const [sim, setSim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ladderBusy, setLadderBusy] = useState(null);
  const { tis, comp } = computeTIS(pos, { pop: popNow, ivNow, seasonalNow, dteLeft, vegaSign });
  // The chance is HANDED to this file, sentence included — `chanceOf()` stamps
  // its own result, so the panel reads the answer rather than deciding again
  // which seasonal table it was drifted on. The caller may pass the sentence
  // directly; `chanceNow` is the object it came from and is the fallback.
  const nowSeasonalNote = seasonalNote || (chanceNow ? chanceNow.seasonalNote : null);
  const tisColor = tis >= 70 ? T.green : tis >= 40 ? T.amber : T.red;
  useEffect(() => {
    if (tis < 40) logEvent(pos.id, "tis-low", `The reason you opened this has weakened to ${tis}/100 — consider trimming or closing`);
  }, [tis]); // eslint-disable-line
  const runSim = () => {
    setBusy(true);
    // WHICH IMPLIED VOLATILITY THE WALK PRICES THE LEGS AT, DECIDED ONCE. This
    // was a bare `ivNow || 0.25` — a rule number with no home, and a DIFFERENT
    // quantity from the `sigma` beside it, which is the realised volatility the
    // price itself is walked on. `ivProvenance()` is that home and says which
    // of the three sources produced the number.
    const ivUsed = ivProvenance(ivNow, pos.thesis?.iv, pos.ticker);
    // AND THE REALISED ONE IS HANDED IN AS ITS PROVENANCE, NOT AS A NUMBER.
    // `sigma` used to arrive here as `seasonal[tk]?.sigma || getU(tk).sigma`
    // from App.jsx while the autopilot's `exitSim` read `SIGMA[pos.ticker]`:
    // one position, two volatilities, and the panel below printed neither.
    setTimeout(() => { setSim({ ...exitPathSim(pos, spot, dteLeft, ivUsed.iv, vol),
      ivSource: ivUsed.source, ivNote: ivUsed.fromFallback ? ivUsed.note : null,
      volNote: vol?.note || null }); setBusy(false); }, 30);
  };
  const placeExit = async (label, targetPnl) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 4 of six
    setLadderBusy(label);
    try {
      // Ogni gradino della scala e' un ordine su Alpaca: passa dal cancello.
      // THE LADDER CLOSES THE WHOLE POSITION, SO IT IS SIZED LIKE IT.
      // `contracts: 1` here meant a seven-lot position was gated — and sent —
      // as a one-lot close: six lots would have been left open by a rung the
      // screen called the exit. `pnlNow` is the whole position's, and the
      // gate scales `maxLoss` to the same size before comparing them.
      const g = runGate(gate, { intent: "close", ticker: pos.ticker, legs: pos.legs,
        dte: dteLeft, contracts: size, maxLoss: pos.maxLoss, maxProfit: pos.maxProfit, pnl: pnlNow });
      if (!g.pass) { setMsg(`Risk gate: the ${label} order was not sent. ${g.violations.map((v) => v.message).join(" ")}`); setLadderBusy(null); return; }
      for (const w of g.warnings) logEvent(pos.id, "gate-warning", w.message);
      const net = ladderNet(pos.entryNet, targetPnl);
      // Same GCD rule as the opening ticket: the size belongs in qty, the
      // shape in the ratios, and the price the ladder computed is the price
      // of the WHOLE position, so it is divided by the same factor.
      // THE CHAIN NAMES THE CONTRACTS, HERE TOO. `buildOcc()` was the fallback
      // and it is gone from every order path: a close sent for a symbol nobody
      // lists is refused by the broker and leaves the position open in silence,
      // which is the worse half of the SOYB 422. The gate does NOT test this on
      // a close — refusing to let somebody out of a position because a feed is
      // quiet would be worse still — so the refusal is here, by name, where the
      // button is.
      const occs = pos.legs.map((l) => (quoteFn ? quoteFn(l)?.occ : null) || null);
      const missing = contractListing({ legs: pos.legs, occs }).missing;
      if (missing.length) {
        throw new Error(`${unlistedContractNote(missing, pos.legs.length)} Until the chain lists ` +
          `${missing.length === 1 ? "it" : "them"} again, close this from the broker's own screen.`);
      }
      if (occs.length > 4) throw new Error("Alpaca takes at most 4 legs per order");
      const body = orderBody({ legs: pos.legs, occs, userQty: size, type: "limit", limit: net, tif: "gtc", intent: "close" });
      const o = await alpacaReq("/v2/orders", "POST", body);
      const res = orderOutcome(o);
      // The ladder's price is the price of the WHOLE position; the broker was
      // sent the price of one combination. Both are true and printing only
      // one of them next to Alpaca's own echo reads as a contradiction.
      const per = +body.qty > 1 ? ` — sent as ${body.qty} × $${body.limit_price}` : "";
      setMsg(`${label} exit order placed at $${Math.abs(net).toFixed(2)}${per}, standing until you cancel it (${o.id?.slice(0, 8)}…). ${res.headline}`);
      logEvent(pos.id, "ladder", `${label} exit order placed at $${Math.abs(net).toFixed(2)} — ${res.headline}`);
    } catch (e) { setMsg(`The ${label} exit order failed: ${alpacaErrorText(e)}`); }
    setLadderBusy(null);
  };
  const pct = pos.maxProfit > 0 && pnlNow != null ? Math.max(-100, Math.min(130, (pnlNow / (pos.maxProfit * size)) * 100)) : null;
  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: `${T.bg}`, border: `1px solid ${tisColor}44`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>IS THE REASON STILL GOOD?</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: tisColor }}>{tis}<span style={{ fontSize: 11, color: T.dim }}>/100</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {comp.map((c) => (
            <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ ...mono, fontSize: 9, color: T.mut, width: 130 }}>{c.k}</span>
              <div style={{ flex: 1, height: 4, background: T.line, borderRadius: 2 }}>
                <div style={{ width: `${(c.pts / c.max) * 100}%`, height: 4, background: c.pts / c.max >= 0.7 ? T.green : c.pts / c.max >= 0.4 ? T.amber : T.red, borderRadius: 2 }} />
              </div>
              <span title={c.note} style={{ ...mono, fontSize: 9, color: T.dim, cursor: "help" }}>{c.pts}/{c.max}</span>
            </div>
          ))}
        </div>
      </div>
      {/* WHICH SEASONAL TABLE THE CHANCE WAS DRIFTED ON, ON BOTH SIDES OF THE
          COMPARISON. The first bar above divides today's chance by the one
          recorded at entry; if the market was on the hand-written estimate then
          and on measured prices now, that bar reads a change in the TABLE as a
          change in the trade. The two sentences make that visible instead of
          scoring it. `chanceNow` is passed in and never recomputed here — this
          file is handed the answer (see the note above `computeTIS`). */}
      {(nowSeasonalNote || thesisSeasonalNote) && (
        <div style={{ ...mono, fontSize: 9, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
          {nowSeasonalNote ? <div>NOW · {nowSeasonalNote}</div> : null}
          {thesisSeasonalNote ? <div>AT ENTRY · {thesisSeasonalNote}</div> : null}
        </div>
      )}
      {pct != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>PROGRESS TOWARDS THE MAXIMUM · {takeProfitLabel()} · rest out at {scaleOutLabel()}</div>
          <div style={{ position: "relative", height: 10, background: T.line, borderRadius: 5, marginTop: 3 }}>
            <div style={{ position: "absolute", left: `${(RULES.takeProfitPct * 100 + 100) / 230 * 100}%`, width: 1, top: -2, bottom: -2, background: T.amber }} title={takeProfitLabel()} />
            <div style={{ position: "absolute", left: `${(RULES.scaleOutPct * 100 + 100) / 230 * 100}%`, width: 1, top: -2, bottom: -2, background: T.green }} title={scaleOutLabel()} />
            <div style={{ width: `${Math.max(0, (pct + 100) / 230 * 100)}%`, height: 10, borderRadius: 5, background: pnlNow >= 0 ? `${T.green}bb` : `${T.red}bb` }} />
          </div>
          <div style={{ ...mono, fontSize: 10, color: pnlNow >= 0 ? T.green : T.red, marginTop: 2 }}>{pct.toFixed(0)}% of the maximum ({fmt$(pnlNow)})</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small ghost color={T.blue} onClick={runSim} disabled={busy}>{busy ? "Simulating…" : "▶ How does this end?"}</Btn>
        {alpaca && (<>
          {/* THE PROFIT RUNGS OF THE LADDER NEED A MAXIMUM TO BE A SHARE OF.
              With no ceiling they priced at $0 and would have sent an order to
              close the position for nothing. The stop rung stays: the maximum
              LOSS is always known, which is non-negotiable rule 2. */}
          {Number.isFinite(pos.maxProfit) ? (<>
            <Btn small ghost color={T.green} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(takeProfitLabel(), RULES.takeProfitPct * pos.maxProfit)} disabled={!!ladderBusy || DEMO}>GTC {takeProfitLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.takeProfitPct * pos.maxProfit)).toFixed(2)}</Btn>
            <Btn small ghost color={T.green} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(`TP ${scaleOutLabel()}`, RULES.scaleOutPct * pos.maxProfit)} disabled={!!ladderBusy || DEMO}>GTC TP {scaleOutLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.scaleOutPct * pos.maxProfit)).toFixed(2)}</Btn>
          </>) : (
            <span style={{ ...mono, fontSize: 10, color: T.dim }}>
              {`No profit rung: this position has ${NO_CEILING}, so ${pctText(RULES.takeProfitPct)} of the maximum is not a price. The ${RULES.exitDTE}-day exit still applies.`}
            </span>
          )}
          <Btn small ghost color={T.red} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(stopLossLabel(), RULES.stopLossPct * pos.maxLoss)} disabled={!!ladderBusy || DEMO}>{stopLossLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.stopLossPct * pos.maxLoss)).toFixed(2)}</Btn>
        </>)}
      </div>
      {sim && (
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", padding: "8px 10px", background: `${T.blue}0d`, borderRadius: 6 }}>
          <Stat k={`HITS ${takeProfitLabel()} FIRST`} v={`${(sim.pTP * 100).toFixed(0)}%`} c={T.green} />
          <Stat k={`HITS ${stopLossLabel()} FIRST`} v={`${(sim.pSL * 100).toFixed(0)}%`} c={T.red} />
          <Stat k={`RUNS TO ${exitDTELabel()} IN PROFIT`} v={`${(sim.pTimePos * 100).toFixed(0)}%`} c={T.green} />
          <Stat k={`RUNS TO ${exitDTELabel()} AT A LOSS`} v={`${(sim.pTimeNeg * 100).toFixed(0)}%`} c={T.red} />
          <Stat k="TYPICAL DAYS TO TARGET" v={sim.medTPdays ?? "—"} c={T.blue} />
          <Stat k="AVERAGE RESULT FOLLOWING THE RULES" v={fmt$(sim.evExit)} c={sim.evExit >= 0 ? T.green : T.red} />
          <Stat k="TAKE IT NOW OR WAIT?" v={pnlNow != null ? (pnlNow >= sim.evExit ? "→ TAKE IT NOW" : "→ WAIT") : "—"} c={T.amber} />
        </div>
      )}
      {/* WHICH VOLATILITY EVERY FIGURE ABOVE WAS WALKED ON, AND HOW OLD THAT
          READING IS. One sentence, from `sigmaProvenance()` — the same string
          the autopilot's brief carries, so the panel and the brief cannot
          describe one position two ways. It is amber only when nobody measured
          the number: a measured reading is a statement, not a warning. */}
      {sim && sim.volNote && (
        <div style={{ ...mono, fontSize: 9.5, color: sim.sigmaSource === MEASURED_SIGMA_SOURCE ? T.dim : T.amber, marginTop: 6, lineHeight: 1.6 }}>
          {sim.sigmaSource === MEASURED_SIGMA_SOURCE ? "" : "⚠ "}{sim.volNote}
        </div>
      )}
      {/* THE TIMELINE IS ALL OF IT, WITH THE RECENT SIX IN FRONT.
          It used to be `slice(-6)` and nothing else, so everything a position
          was told in its first weeks was simply not reachable from the screen
          that manages it — and the Journal, where it might have been read
          later, was throwing the timeline away at close. Six is a sensible
          number to have open on a live screen with a chart under it; it is not
          a sensible number to be able to see at all. */}
      {(pos.timeline || []).length > 0 && (() => {
        const tl = pos.timeline || [];
        const recent = tl.slice(-6);
        const earlier = tl.slice(0, Math.max(0, tl.length - 6));
        // AN ENTRY WRITTEN BEFORE THE SIMULATOR WAS CORRECTED SAYS SO, IN ONE
        // SENTENCE. `autopilotHorizonNote()` returns null for every entry that
        // carries its horizon and for every entry that never quoted one, so
        // this is a line that appears exactly where it is true.
        const Line = ({ e }) => {
          // TWO FACTS ABOUT THE RECORD, BOTH READ OFF ITS OWN ABSENCES: the
          // horizon its simulation ran to, and the volatility it walked on.
          const notes = [autopilotHorizonNote(e), autopilotVolNote(e)].filter(Boolean);
          return (
            <div style={{ marginTop: 2 }}>
              <div style={{ ...mono, fontSize: 10, color: T.mut, lineHeight: 1.5 }}>
                {e.seq ? <span style={{ color: T.blue }}>{e.seq} </span> : null}
                <span style={{ color: T.dim }}>{new Date(e.t).toLocaleDateString("en-GB")}</span> · {e.text}
              </div>
              {notes.map((n) => (
                <div key={n} style={{ ...mono, fontSize: 9.5, color: T.amber, lineHeight: 1.5 }}>⚠ {n}</div>
              ))}
            </div>
          );
        };
        return (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...mono, fontSize: 9, color: T.dim }}>
              TIMELINE{pos.ref ? ` · ${pos.ref}` : ""} · {tl.length} ENTR{tl.length === 1 ? "Y" : "IES"}
            </div>
            {earlier.length > 0 && (
              <details style={{ marginTop: 2 }}>
                <summary style={{ ...mono, fontSize: 10, color: T.blue, cursor: "pointer" }}>
                  {`Show the earlier ${earlier.length} ${earlier.length === 1 ? "entry" : "entries"}`}
                </summary>
                {earlier.map((e, i) => <Line key={e.seq || `e${i}`} e={e} />)}
              </details>
            )}
            {recent.map((e, i) => <Line key={e.seq || `r${i}`} e={e} />)}
          </div>
        );
      })()}
    </div>
  );
}

/* ================================================================
   8) PRICE CHART — candele sottostante stile piattaforma pro
================================================================ */

export function PriceChart({ ticker, levels, breakevens, entrySpot, legLines, height = 320 }) {
  const ref = React.useRef(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);
  const [range, setRange] = useState(180);
  useEffect(() => {
    let chart, dead = false;
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?sym=${encodeURIComponent(ticker)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (dead || !ref.current) return;
        ref.current.innerHTML = "";
        chart = createChart(ref.current, {
          height,
          layout: { background: { color: T.bg }, textColor: T.mut, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 },
          grid: { vertLines: { color: T.line }, horzLines: { color: T.line } },
          rightPriceScale: { borderColor: T.line },
          timeScale: { borderColor: T.line },
          crosshair: { mode: 0 },
        });
        const bars = j.bars.slice(-range);
        const candles = chart.addSeries(CandlestickSeries, {
          upColor: T.green, downColor: T.red, borderUpColor: T.green, borderDownColor: T.red,
          wickUpColor: T.green, wickDownColor: T.red,
        });
        candles.setData(bars);
        const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", color: T.dim, priceFormat: { type: "volume" } });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: `${b.close >= b.open ? T.green : T.red}44` })));
        const line = (price, color, title) => candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
        (legLines || []).forEach((lg) => {
          candles.createPriceLine({ price: lg.price, color: lg.side > 0 ? T.green : T.red, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: lg.label });
        });
        (levels?.supports || []).forEach((p) => line(p, T.green, "support"));
        (levels?.resistances || []).forEach((p) => line(p, T.red, "resistance"));
        (breakevens || []).forEach((p) => line(p, T.blue, "break even"));
        if (entrySpot) line(entrySpot, T.amber, "your entry");
        chart.timeScale().fitContent();
        setMeta({ n: bars.length, source: j.source, last: bars[bars.length - 1] });
        const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth || 600 }));
        ro.observe(ref.current);
      } catch (e) { if (!dead) setErr(String(e.message || e)); }
    })();
    return () => { dead = true; chart?.remove?.(); };
  }, [ticker, range, JSON.stringify(levels), JSON.stringify(breakevens), JSON.stringify(legLines), entrySpot]); // eslint-disable-line
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>{ticker} · DAILY PRICES {meta ? `· ${meta.source} (delayed)` : ""}</Lbl>
        <div style={{ display: "flex", gap: 4 }}>
          {[90, 180, 365].map((d) => (
            <Btn key={d} small ghost={range !== d} onClick={() => setRange(d)}>{d === 90 ? "3M" : d === 180 ? "6M" : "1Y"}</Btn>
          ))}
        </div>
      </div>
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8, borderRadius: 6, overflow: "hidden" }} />
      {meta?.last && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Latest: {meta.last.time} · open {meta.last.open} high {meta.last.high} low {meta.last.low} close {meta.last.close} · the lines are where the market is positioned (green and red), your break-even (blue) and your entry (amber)</div>}
    </div>
  );
}

/* ================================================================
   9) CHAIN MATRIX — tabella chain completa cliccabile (stile pro)
================================================================ */
export function ChainMatrix({ chain, expKey, spot, legs, onCell }) {
  const [width, setWidth] = useState(0.12);
  if (!chain || !expKey || !chain.byExp[expKey] || !spot) return null;
  const e = chain.byExp[expKey];
  // No open interest, no OI column. A column of dashes is a promise the feed
  // cannot keep, and it costs width the strikes need on a phone.
  const oi = hasOpenInterest(chain);
  const ks = Array.from(new Set([...Object.keys(e.calls), ...Object.keys(e.puts)].map(Number)))
    .sort((a, b) => a - b)
    .filter((k) => k >= spot * (1 - width) && k <= spot * (1 + width));
  const legAt = (k, t) => legs.find((l) => l.strike === k && l.type === t);
  const cell = (k, t) => {
    const q = e[t === "call" ? "calls" : "puts"][k];
    const lg = legAt(k, t);
    const bgc = lg ? (lg.side > 0 ? `${T.green}26` : `${T.red}26`) : "transparent";
    const itm = t === "call" ? k < spot : k > spot;
    return (
      <td key={t + k} onClick={() => onCell(k, t)}
        style={{ padding: "4px 6px", cursor: "pointer", background: bgc, borderBottom: `1px solid ${T.line}`, textAlign: t === "call" ? "right" : "left", opacity: q ? 1 : 0.35, borderLeft: t === "put" ? `1px solid ${T.line}` : "none", borderRight: t === "call" ? `1px solid ${T.line}` : "none", boxShadow: itm ? `inset 0 0 0 100px ${T.blue}0a` : "none" }}>
        {q ? (
          <span style={{ ...mono, fontSize: 10.5 }}>
            <b style={{ color: lg ? (lg.side > 0 ? T.green : T.red) : T.ink }}>{q.mid != null ? q.mid.toFixed(2) : "—"}</b>
            <span style={{ color: T.dim }}> · {q.iv ? (q.iv * 100).toFixed(0) + "%" : "—"}{oi ? ` · OI ${q.oi ?? "—"}` : ""}</span>
            {lg && <b style={{ color: lg.side > 0 ? T.green : T.red }}> {lg.side > 0 ? "＋BUY" : "−SELL"}{lg.qty > 1 ? "×" + lg.qty : ""}</b>}
          </span>
        ) : <span style={{ ...mono, fontSize: 10, color: T.dim }}>—</span>}
      </td>
    );
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>{expKey} · TAP A PRICE: ONCE TO BUY · TWICE TO SELL · A THIRD TIME TO REMOVE</Lbl>
        <div style={{ display: "flex", gap: 4 }}>
          {[[0.06, "±6%"], [0.12, "±12%"], [0.25, "±25%"]].map(([v, l]) => (
            <Btn key={l} small ghost={width !== v} onClick={() => setWidth(v)}>{l}</Btn>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 8, border: `1px solid ${T.line}`, borderRadius: 7 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: T.bg }}>
          <thead>
            <tr style={{ ...mono, fontSize: 9, color: T.dim }}>
              <th style={{ padding: "5px 6px", textAlign: "right" }}>CALL · mid · IV{oi ? " · OI" : ""}</th>
              <th style={{ padding: "5px 6px", textAlign: "center" }}>STRIKE</th>
              <th style={{ padding: "5px 6px", textAlign: "left" }}>PUT · mid · IV{oi ? " · OI" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => (
              <tr key={k} style={{ background: Math.abs(k - spot) === Math.min(...ks.map((x) => Math.abs(x - spot))) ? `${T.amber}12` : "transparent" }}>
                {cell(k, "call")}
                <td style={{ ...mono, fontSize: 11.5, fontWeight: 800, color: T.ink, textAlign: "center", padding: "4px 8px", borderBottom: `1px solid ${T.line}` }}>{k}</td>
                {cell(k, "put")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* This was written as JSX text containing `\u2019` and `${spot.toFixed(2)}`,
          neither of which JSX interpolates: the escape and the expression were
          both printed on screen, literally. It is one expression now. */}
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>
        {`The highlighted row is the strike nearest today\u2019s price ($${spot.toFixed(2)}). A blue tint means the option already has value. ${sourceNote(chain)}.${oi ? ` ${openInterestNote(chain)}` : ""}`}
      </div>
    </div>
  );
}

/* ================================================================
   10) OPTION PANEL — storico prezzo del singolo contratto (stile Fiuto)
================================================================ */
export function OptionPanel({ occ, label, quote, onClose }) {
  const ref = React.useRef(null);
  const [err, setErr] = useState(null);
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let chart, dead = false;
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?occ=${encodeURIComponent(occ)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (dead || !ref.current) return;
        ref.current.innerHTML = "";
        chart = createChart(ref.current, {
          height: 190,
          layout: { background: { color: T.bg }, textColor: T.mut, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 },
          grid: { vertLines: { color: T.line + "55" }, horzLines: { color: T.line + "55" } },
          rightPriceScale: { borderColor: T.line }, timeScale: { borderColor: T.line },
        });
        const ls = chart.addSeries(LineSeries, { color: T.violet, lineWidth: 2 });
        ls.setData(j.bars);
        chart.timeScale().fitContent();
        setSrc(j.source);
      } catch (e) { if (!dead) setErr(String(e.message || e)); }
    })();
    return () => { dead = true; chart?.remove?.(); };
  }, [occ]);
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: T.bg, border: `1px solid ${T.violet}44`, borderRadius: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>THIS CONTRACT OVER TIME · {label} {src ? `· ${src}` : ""}</Lbl>
        <Btn small ghost onClick={onClose}>✕ close</Btn>
      </div>
      {quote && (
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
          now: {quote.mid?.toFixed(2) ?? "—"} · volatility {quote.iv ? (quote.iv * 100).toFixed(0) + "%" : "—"}{quote.oi != null ? ` · ${quote.oi} contracts open at the last close` : ""}{quote.vol != null ? ` · ${quote.vol} traded today` : ""}
        </div>
      )}
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8 }} />
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>
        This tells you whether you are buying near the top of its price range or after it has deflated — something the payoff chart cannot show you.
      </div>
    </div>
  );
}

/* ================================================================
   11) VISTA UNIFICATA — Prezzo storico × Cono probabilità × Zone strategia
   Un solo asse prezzi: candele, proiezione MC, zone P&L, strike, breakeven.
================================================================ */
// ---- Trend read: the SMA/RSI math is taRead() in src/signals.js, the technical
// factor of fuseSignals(). Here we only add the sentence the Build screen prints. ----
export function taSignals(bars) {
  const ta = taRead(bars);
  if (!ta) return null;
  return { ...ta,
    trendTxt: ta.trend > 0 ? "rising" : ta.trend < 0 ? "falling" : "going sideways" };
}
export function confluence(seasonalM, ta) {
  if (!ta) return null;
  const seaDir = seasonalM > 0.8 ? 1 : seasonalM < -0.8 ? -1 : 0;
  let verdict, c, advice;
  if (seaDir !== 0 && ta.trend === seaDir) { verdict = "BOTH AGREE"; c = T.green; advice = `The season points ${seaDir > 0 ? "up" : "down"} and the price is already moving that way. A ${seaDir > 0 ? "bullish" : "bearish"} spread makes sense, at your full per-trade limit.`; }
  else if (seaDir !== 0 && ta.trend === -seaDir) { verdict = "THEY DISAGREE"; c = T.amber; advice = `The season points ${seaDir > 0 ? "up" : "down"} but the price is moving the other way. Trade smaller, wait for the price to turn, or pick a trade that does not need a direction.`; }
  else if (seaDir === 0 && ta.trend === 0) { verdict = "QUIET MARKET"; c = T.blue; advice = "Neither the season nor the price is pushing. A trade that profits from things staying still suits this best — time works for you."; }
  else { verdict = "ONE SIGNAL ONLY"; c = T.mut; advice = seaDir !== 0 ? "Only the season is pushing and the price is flat. Trade smaller, or wait for the price to confirm it." : "Only the price is pushing and the season is flat. Follow the price, but trade smaller."; }
  const warn = ta.rsi >= 70 ? "⚠ The price has run hot recently (RSI " + ta.rsi.toFixed(0) + "). Buying here often means buying the top — waiting for a dip usually gets a better entry." : ta.rsi <= 30 ? "⚠ The price has been beaten down recently (RSI " + ta.rsi.toFixed(0) + "). Selling here often means selling the bottom — a bounce is common." : null;
  return { verdict, c, advice, warn };
}

export function UnifiedView({ ticker, dte, sigma, driftM, curve, legs, breakevens, spot, onTa }) {
  const [bars, setBars] = useState(null);
  const [allBars, setAllBars] = useState(null);
  const [range, setRange] = useState(180);
  const [err, setErr] = useState(null);
  const wrapRef = React.useRef(null);
  // This chart has a floor of 560px: below it the candles, the cone and the
  // rotated payoff stop being readable at all. On a 390px phone that floor used
  // to make the WHOLE PAGE scroll sideways — every other screen shifted with it
  // and nothing lined up. The width stays; what changes is that the overflow is
  // the CHART's, inside its own scroller, so the page never moves (CLAUDE.md:
  // this app is demoed on a phone).
  const MIN_W = 560;
  const [W, setW] = useState(MIN_W);
  useEffect(() => {
    // The observer must attach to a node that EXISTS ON MOUNT. The loading and
    // error states used to return before the wrapper was rendered, so `wrapRef`
    // was null when this ran, nothing was ever observed, and W kept its initial
    // value for the life of the component. That was invisible while the initial
    // value happened to be 1100 — about right on a desktop — and became a chart
    // frozen at 560px in a 1382px column the moment the initial value changed.
    // The wrapper is now always rendered and the states live inside it.
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(Math.max(MIN_W, el.clientWidth || MIN_W));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?sym=${encodeURIComponent(ticker)}&days=${range > 400 ? 1900 : 400}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setAllBars(j.bars);
        const ta = taSignals(j.bars);
        if (onTa && ta) onTa(ta);
      } catch (e) { setErr(String(e.message || e)); }
    })();
  }, [ticker, range > 400]); // eslint-disable-line
  useEffect(() => {
    if (!allBars) return;
    const n = range <= 180 ? 90 : range <= 400 ? 250 : allBars.length;
    setBars(allBars.slice(-n));
  }, [allBars, range]);
  // Rendered through the SAME wrapper as the chart, so the width is measured
  // from the moment the component mounts rather than whenever data arrives.
  const shell = (inner) => <div ref={wrapRef} style={{ maxWidth: "100%" }}>{inner}</div>;
  if (err) return shell(<div style={{ ...mono, fontSize: 11, color: T.red }}>Chart unavailable: {err}</div>);
  if (!bars || !spot || !curve?.length) return shell(<div style={{ ...mono, fontSize: 11, color: T.mut }}>Loading the chart…</div>);

  const H = 440, padL = 6, padR = 60, padT = 10, padB = 26;
  // THE PAYOFF, BESIDE THE PRICE CHART, ON THE SAME PRICE AXIS (PRD §6).
  // Price is the vertical axis here, so the multi-leg payoff belongs rotated
  // 90° in a strip on the right: at any height you read the price on the axis
  // and, straight across, what the trade is worth there. It was a separate
  // chart further down the page with its own axis, which meant comparing "where
  // the price could go" with "where this makes money" was a memory exercise.
  // ADAPTIVE: the strip needs real room to be worth anything, so it appears
  // only when there is some, and on a phone the full-width payoff chart below
  // carries it instead.
  const PAY_MIN_W = 820;
  const showPay = W >= PAY_MIN_W;
  const payGap = showPay ? 10 : 0;
  const payW = showPay ? Math.max(120, Math.min(210, (W - padL - padR) * 0.19)) : 0;
  const plotW = W - padL - padR - payW - payGap;
  const shareH = range > 400 ? 0.72 : 0.58;
  const histW = plotW * shareH;
  const projW = plotW * (1 - shareH);
  const x0 = padL, xToday = padL + histW, xEnd = padL + histW + projW;
  const payX0 = xEnd + payGap;
  const xRight = showPay ? payX0 + payW : xEnd;

  // cono lognormale: drift stagionale + IV reale
  const mu = Math.log(1 + (driftM || 0) / 100) * 12;
  const qz = { p5: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645 };
  const days = Math.max(1, dte);
  const cone = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (days / 365);
    const o = { x: xToday + (i / 24) * projW };
    for (const [k, z] of Object.entries(qz)) o[k] = spot * Math.exp((mu - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
    cone.push(o);
  }
  // dominio Y
  const ys = [
    ...bars.map((b) => b.low), ...bars.map((b) => b.high),
    ...cone.map((c) => c.p5), ...cone.map((c) => c.p95),
    ...legs.map((l) => l.strike), ...(breakevens || []),
  ];
  const yMin = Math.min(...ys) * 0.985, yMax = Math.max(...ys) * 1.015;
  const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const XH = (i) => x0 + (i / (bars.length - 1)) * histW;

  // zone profitto/perdita a scadenza (fasce orizzontali, solo lato proiezione)
  const zones = [];
  let zs = null;
  for (let i = 0; i < curve.length; i++) {
    const pos = curve[i].exp > 0;
    if (pos && zs == null) zs = curve[i].s;
    if ((!pos || i === curve.length - 1) && zs != null) { zones.push([zs, curve[i].s]); zs = null; }
  }
  // coerenza: P(prezzo a scadenza dentro zona verde) con lo stesso modello del cono
  const erf2 = (x) => { const sg = x < 0 ? -1 : 1; x = Math.abs(x); const t2 = 1 / (1 + 0.3275911 * x); return sg * (1 - (((((1.061405429 * t2 - 1.453152027) * t2) + 1.421413741) * t2 - 0.284496736) * t2 + 0.254829592) * t2 * Math.exp(-x * x)); };
  const Tyr = days / 365, sq = sigma * Math.sqrt(Tyr), muT = Math.log(spot) + (mu - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => 0.5 * (1 + erf2((Math.log(x) - muT) / (sq * Math.SQRT2)));
  const pIn = zones.reduce((a, [lo, hi]) => a + Math.max(0, cdf(Math.min(hi, yMax * 2)) - cdf(Math.max(lo, 0.01))), 0);

  /* ---- the payoff, rotated onto the shared price axis ----
     Same `curve` the zones above are cut from, so the strip and the green bands
     can never disagree: one is the other read sideways. Only the visible price
     range is drawn — a payoff that runs off the top of the axis would invite a
     comparison with a price the chart is not showing. */
  const payPts = showPay
    ? curve.filter((c) => c.s >= yMin && c.s <= yMax).map((c) => ({ y: Y(c.s), v: c.exp }))
    : [];
  const payMax = payPts.length ? Math.max(...payPts.map((p2) => Math.abs(p2.v)), 1) : 1;
  // Zero sits a third in from the left, so a credit spread's small win still has
  // somewhere to be drawn and the loss side is not squeezed to nothing.
  const payZero = payX0 + payW * 0.34;
  const PX = (v) => payZero + (v / payMax) * (v >= 0 ? payX0 + payW - 9 - payZero : payZero - payX0 - 9);
  const payPath = payPts.map((p2, i) => `${(i ? "L" : "M")}${PX(p2.v).toFixed(1)},${p2.y.toFixed(1)}`).join("");

  const poly = (ks) => cone.map((c) => `${c.x.toFixed(1)},${Y(c[ks[0]]).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c[ks[1]]).toFixed(1)}`).join(" ");
  const gTicks = 5;

  // The observer measures the OUTER box; the scroller is the inner one, so the
  // measured width is the space actually available rather than the chart's own.
  return (
    <div ref={wrapRef} style={{ maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "flex-end" }}>
        {[[180, "6M"], [365, "1Y"], [1825, "5Y"]].map(([v, l]) => (
          <Btn key={l} small ghost={range !== v} onClick={() => setRange(v)}>{l}</Btn>
        ))}
      </div>
      <div style={{ overflowX: "auto", overflowY: "hidden", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
      <svg width={W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.line}` }}>
        {/* griglia + asse prezzi */}
        {Array.from({ length: gTicks + 1 }, (_, i) => {
          const v = yMin + (i / gTicks) * (yMax - yMin);
          return (<g key={i}>
            <line x1={x0} x2={xRight} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
            <text x={xRight + 6} y={Y(v) + 3} fill={T.dim} fontSize={9.5} fontFamily="monospace">{v.toFixed(2)}</text>
          </g>);
        })}
        {/* zone strategia (proiezione): verde = profitto a scadenza */}
        <rect x={xToday} y={padT} width={projW} height={H - padT - padB} fill={T.red} opacity={0.055} />
        {zones.map(([lo, hi], i) => (
          <rect key={i} x={xToday} y={Y(hi)} width={projW} height={Math.max(0, Y(lo) - Y(hi))} fill={T.green} opacity={0.16} />
        ))}
        {/* cono probabilità */}
        <polygon points={poly(["p95", "p5"])} fill={T.violet} opacity={0.10} />
        <polygon points={poly(["p75", "p25"])} fill={T.violet} opacity={0.16} />
        <polyline points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p50).toFixed(1)}`).join(" ")} fill="none" stroke={T.violet} strokeWidth={1.3} strokeDasharray="4 3" />
        {/* candele storiche */}
        {bars.map((b, i) => {
          const x = XH(i), up = b.close >= b.open, cw = Math.max(1.4, histW / bars.length * 0.55);
          return (<g key={i}>
            <line x1={x} x2={x} y1={Y(b.high)} y2={Y(b.low)} stroke={up ? T.green : T.red} strokeWidth={0.8} />
            <rect x={x - cw / 2} y={Y(Math.max(b.open, b.close))} width={cw} height={Math.max(1, Math.abs(Y(b.open) - Y(b.close)))} fill={up ? T.green : T.red} />
          </g>);
        })}
        {/* separatore OGGI */}
        <line x1={xToday} x2={xToday} y1={padT} y2={H - padB} stroke={T.amber} strokeWidth={1} strokeDasharray="3 3" />
        <text x={xToday + 4} y={padT + 10} fill={T.amber} fontSize={9.5} fontFamily="monospace">TODAY ${spot.toFixed(2)}</text>
        <text x={xEnd - 4} y={padT + 10} fill={T.dim} fontSize={9.5} fontFamily="monospace" textAnchor="end">EXPIRY · {dte} DAYS</text>
        {/* strike delle gambe + breakeven */}
        {legs.map((l, i) => (<g key={"lg" + i}>
          <line x1={xToday} x2={xEnd} y1={Y(l.strike)} y2={Y(l.strike)} stroke={l.side > 0 ? T.green : T.red} strokeWidth={1.4} />
          <text x={xToday + 4} y={Y(l.strike) - 3} fill={l.side > 0 ? T.green : T.red} fontSize={9.5} fontFamily="monospace" fontWeight="700">{l.side > 0 ? "+" : "−"}{l.qty} {l.strike}{l.type === "call" ? "C" : "P"}</text>
        </g>))}
        {(breakevens || []).map((b, i) => (<g key={"be" + i}>
          <line x1={x0} x2={xRight} y1={Y(b)} y2={Y(b)} stroke={T.blue} strokeWidth={1.1} strokeDasharray="6 4" />
          <text x={x0 + 4} y={Y(b) - 3} fill={T.blue} fontSize={9.5} fontFamily="monospace">BE {b.toFixed(2)}</text>
        </g>))}
        {/* etichette date */}
        <text x={x0} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace">{bars[0]?.time}</text>
        <text x={xToday} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace" textAnchor="middle">{bars[bars.length - 1]?.time}</text>
        {/* ---- THE PAYOFF, BESIDE THE PRICE, ON THE SAME AXIS ---- */}
        {showPay && (
          <g>
            <rect x={payX0} y={padT} width={payW} height={H - padT - padB} fill={T.panel} opacity={0.5} />
            {/* the profit side and the loss side, tinted like the bands opposite */}
            <rect x={payZero} y={padT} width={Math.max(0, payX0 + payW - payZero)} height={H - padT - padB} fill={T.green} opacity={0.05} />
            <rect x={payX0} y={padT} width={Math.max(0, payZero - payX0)} height={H - padT - padB} fill={T.red} opacity={0.05} />
            <line x1={payZero} x2={payZero} y1={padT} y2={H - padB} stroke={T.mut} strokeWidth={0.9} />
            <path d={payPath} fill="none" stroke={T.amber} strokeWidth={2} />
            <text x={payX0 + payW / 2} y={padT + 10} fill={T.dim} fontSize={9} fontFamily="monospace" textAnchor="middle">
              AT EXPIRY
            </text>
            <text x={payZero - 3} y={H - padB - 4} fill={T.red} fontSize={8.5} fontFamily="monospace" textAnchor="end">lose</text>
            <text x={payZero + 3} y={H - padB - 4} fill={T.green} fontSize={8.5} fontFamily="monospace">make</text>
            {/* today's price, read straight across into the payoff */}
            <line x1={x0} x2={xRight} y1={Y(spot)} y2={Y(spot)} stroke={T.amber} strokeWidth={0.9} strokeDasharray="2 3" opacity={0.75} />
          </g>
        )}
      </svg>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        {[["■", T.green + "44", "where you make money at expiry"], ["■", T.violet + "55", "where the price could go (pale 5–95%, solid 25–75%)"], ["┅", T.violet, "the middle path"], ["—", T.blue, "break even"], ["—", T.green, "option you bought"], ["—", T.red, "option you sold"]].map(([g, c, l]) => (
          <span key={l} style={{ ...mono, fontSize: 9.5, color: T.mut }}><span style={{ color: c, fontWeight: 800 }}>{g}</span> {l}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, padding: "8px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
        <b style={{ color: T.ink }}>How to read it:</b> the purple cone is where the price can realistically get to by expiry; the green bands are where this trade makes money. They overlap about <b style={{ color: pIn >= 0.5 ? T.green : T.violet }}>{chanceText(pIn)}</b> of the time — which is the same number as the CHANCE shown above, worked out the same way.
      </div>
    </div>
  );
}
