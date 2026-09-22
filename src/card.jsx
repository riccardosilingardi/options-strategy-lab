// ============================================================================
// src/card.jsx — THE CONTROLS, AND THE ONE CANDIDATE CARD.
//
// ROADMAP P10 §2 and §3-bis. The owner sent two captures of a tool he finds
// clear and said "vedi com'e chiaro?". What those screens DO is two things:
//
//   1. EVERY CONTROL IS ABOVE EVERY RESULT, IN ONE BLOCK.
//   2. EVERY RESULT IS THE SAME CARD — a name, the legs in plain words, four
//      figures always in the same places, a small picture, one button. No
//      prose. Not one sentence.
//
// >>> WHY THIS IS ITS OWN FILE. <<< It cannot live in `steps.jsx`: that file is
// the navigation and CLAUDE.md says it holds nothing about a trade, and a
// candidate card is nothing BUT a trade. It cannot live in `App.jsx` either,
// because `wizard.jsx` renders the same card for the guided roads and App.jsx
// imports wizard.jsx — that way round is a cycle. So it is a leaf: it imports
// `rules.js`, `path.js`, `visuals.jsx`, `steps.jsx` and `theme.js`, and both
// App.jsx and wizard.jsx import it.
//
// IT DECIDES NOTHING AND COMPUTES NOTHING. Every figure it renders is handed
// to it already worked out, at the price that fills, by the caller that owns
// `analyze()`. A component that derives a figure is a second home for it.
// ============================================================================
import React from "react";
import { T } from "./theme.js";
import { Fold } from "./steps.jsx";
import { legsLine } from "./path.js";
import { BandThumbnail, Gauge, bandTakeaway } from "./visuals.jsx";
import { RULES, money, chancePct, chanceText, rewardRisk, NO_CEILING,
  requestAmountLabel, requestAmountOwner, chanceAskLabel, controlsFoldNote,
  targetPriceOf, targetPriceNote,
  splitByRequest, meetsHeading, otherwiseHeading, missReasonLine, fillPriceHeading } from "./rules.js";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sans = { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };

/* A label over a value, which is the shape every figure in this file takes.
   Label above, value below, always in the same place — that is the whole of
   §3-bis point 5, and it is why nothing here takes a sentence. */
/* >>> NAMED `CardFigure`, NOT `Figure`. <<< `visuals.jsx` already exports a
   `Figure` — the tap-to-explain frame — and two components with one name in a
   tree this size is how a reader, a grep and `src/wordcount.mjs` all resolve to
   the wrong one. The counter did: it scored this card's block at the visual
   frame's copy and reported a screen growing by 174 words it does not render. */
const CardFigure = ({ k, v, c, w = 0 }) => (
  <div style={{ minWidth: w || 62, flex: w ? `0 0 ${w}px` : "1 1 62px" }}>
    <div style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim }}>{k}</div>
    <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: c || T.ink, lineHeight: 1.25 }}>{v}</div>
  </div>
);

const Ctl = ({ k, children, grow = 1 }) => (
  <div style={{ flex: `${grow} 1 140px`, minWidth: 130 }}>
    <div style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim, marginBottom: 4 }}>{k}</div>
    {children}
  </div>
);

/* ====================================================================
   1) THE CONTROLS, ABOVE EVERY RESULT (ROADMAP P10 §2)

   Five things, one block, nothing between them and the results: direction,
   target price, budget or target profit, expiry, and one slider trading
   RETURN against PROBABILITY.

   >>> THE TARGET PRICE IS A READ-OUT AND NOT A SECOND INPUT, DELIBERATELY.
   <<< It is `spot x (1 + the direction's move)` — the direction expressed as
   a price, which is the figure the Shortlist has printed as IMPLIED TARGET all
   along. Nothing in this app generates structures from a typed price: every
   generation site builds from the direction and the board. A free-text target
   that no generation site reads would be a control that does nothing, which is
   the one thing this repository refuses to ship. With no spot it says so
   rather than printing a number.

   >>> THE SLIDER SETS A MINIMUM CHANCE OF PROFIT. <<< It is read off
   `chanceOf()`'s Monte Carlo, the one source every chance in this app comes
   from, and it decides ONE thing: which HEADING a candidate sits under. It
   creates no structure, bypasses no floor, and `RULES.minRewardRisk` is NOT in
   it and never will be — a user-movable quality floor would be the app letting
   somebody switch off the reason it can be trusted.

   THE GUIDED JOURNEY GETS THE SAME BLOCK WITH TWO CONTROLS READING AS
   READ-OUTS, because the guided run decides the direction and the board
   itself, per market, from the four factors. A control that claims to steer a
   run which ignores it is worse than no control at all.
==================================================================== */
export function RequestControls({
  journey = "desk",
  // Which of the five this mount renders (see the header note).
  only = null,
  request, onChange,
  sentiments = [], sentiment, onSentiment,
  ticker = null, spot = null,
  expiries = null, expKey = null, onExpiry, expiryLabel,
  style,
}) {
  const target = targetPriceOf(spot, sentiments.find((s) => s.id === sentiment));
  const guided = journey === "guided";
  const pct = Math.round(request.minChance * 100);
  const shows = (id) => !only || only.includes(id);
  const anyTop = shows("direction") || shows("target") || shows("size") || shows("expiry");
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.amber}`,
      borderRadius: 8, padding: "12px 14px", ...style }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>WHAT DO YOU WANT?</div>

      {anyTop && (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "flex-start" }}>
        {/* 1 — DIRECTION */}
        {shows("direction") && (
        <Ctl k="DIRECTION" grow={2}>
          {guided ? (
            <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Each market, from its four factors</div>
          ) : (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {sentiments.map((s) => (
                <button key={s.id} onClick={() => onSentiment && onSentiment(s.id)}
                  aria-label={s.label}
                  style={{ ...mono, fontSize: 11, fontWeight: 700, padding: "8px 10px", minHeight: 38,
                    borderRadius: 20, cursor: "pointer", border: `1.5px solid ${s.color}`,
                    background: sentiment === s.id ? s.color : "transparent",
                    color: sentiment === s.id ? T.onAccent : s.color }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          )}
        </Ctl>
        )}

        {/* 2 — TARGET PRICE */}
        {shows("target") && (
        <Ctl k="TARGET PRICE">
          <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: target.known ? T.blue : T.dim }}>
            {target.known ? `$${target.price.toFixed(2)}` : "not loaded"}
          </div>
          <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
            {target.known ? `${target.movePct >= 0 ? "+" : ""}${target.movePct.toFixed(0)}%${ticker ? ` on ${ticker}` : ""}` : (guided ? "picked per market" : "prices not in")}
          </div>
        </Ctl>
        )}

        {/* 3 — BUDGET, OR TARGET PROFIT */}
        {shows("size") && (
        <Ctl k="SIZE BY" grow={2}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => onChange({ mode: "budget" })}
              style={chipStyle(request.mode === "budget")}>What I can spend</button>
            <button onClick={() => onChange({ mode: "target" })}
              style={chipStyle(request.mode === "target")}>What I want to make</button>
          </div>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim, margin: "7px 0 3px" }}>
            {requestAmountLabel(request.mode)}
          </div>
          <input type="number" min={25} step={25} inputMode="numeric"
            aria-label={requestAmountLabel(request.mode)}
            value={request.amt == null ? "" : request.amt}
            onChange={(e) => onChange({ amt: e.target.value === "" ? null : Math.max(0, +e.target.value) })}
            style={{ ...mono, width: 110, background: T.bg, color: T.ink, border: `1px solid ${T.line}`,
              borderRadius: 6, padding: "9px 10px", fontSize: 14, minHeight: 38 }} />
          <div style={{ ...mono, fontSize: 9.5, color: request.amtAnswered ? T.green : T.dim, marginTop: 3 }}>
            {requestAmountOwner(request)}
          </div>
        </Ctl>
        )}

        {/* 4 — EXPIRY, FROM buildableExpiries() ONLY */}
        {shows("expiry") && (
        <Ctl k={expiryLabel || (ticker ? `EXPIRY · ${ticker}` : "EXPIRY")}>
          {guided || !expiries || !expiries.length ? (
            <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>
              {guided ? "Nearest your horizon" : "No board loaded"}
            </div>
          ) : (
            <select value={expKey || ""} onChange={(e) => onExpiry && onExpiry(e.target.value)}
              aria-label="expiry"
              style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`,
                borderRadius: 6, padding: "9px 10px", fontSize: 13, minHeight: 38, maxWidth: 200 }}>
              {expiries.map((e) => (
                <option key={e.key} value={e.key} disabled={!e.buildable}>{e.label}</option>
              ))}
            </select>
          )}
        </Ctl>
        )}
      </div>
      )}

      {/* 5 — RETURN AGAINST PROBABILITY */}
      {shows("chance") && (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim }}>{chanceAskLabel(request)}</span>
          <span style={{ ...mono, fontSize: 15, fontWeight: 800, color: T.violet }}>{pct}%</span>
        </div>
        <input type="range" aria-label="minimum chance of profit"
          min={RULES.chanceAskMin} max={RULES.chanceAskMax} step={RULES.chanceAskStep}
          value={request.minChance}
          onChange={(e) => onChange({ minChance: +e.target.value })}
          style={{ width: "100%", height: 30, marginTop: 4, accentColor: T.violet, cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 9.5, color: T.dim }}>
          <span>pays more</span><span>works more often</span>
        </div>
      </div>
      )}

      {/* THE EXPLANATION FOLDS. A control that asks a question earns its words;
          a paragraph explaining the control does not (ROADMAP P10 §5). */}
      <Fold summary={`What these five do — and what they cannot do`} label="how" tone={T.dim}
        style={{ marginTop: 8 }}>
        <div style={{ ...sans, fontSize: 12.5, color: T.mut, lineHeight: 1.55, marginTop: 6 }}>
          {controlsFoldNote(request)}
        </div>
      </Fold>
    </div>
  );
}

const chipStyle = (on) => ({
  ...mono, fontSize: 11, fontWeight: 700, padding: "8px 10px", minHeight: 38, borderRadius: 20,
  cursor: "pointer", border: `1.5px solid ${T.amber}`,
  background: on ? T.amber : "transparent", color: on ? T.onAccent : T.amber,
});

export { CardFigure };

/* ====================================================================
   2) THE LIST, IN TWO SECTIONS (ROADMAP P10 §3)

   Above: what MEETS what was asked for. Directly below, under its own
   heading, everything else that cleared the floors — never hidden, never
   folded, and every row saying what it missed.

   >>> IT GROUPS. IT DOES NOT REMOVE. <<< The quality floors remove and say
   which floor did it; they are untouched. Membership is DERIVED on every
   render from `splitByRequest()` and is never stored on a candidate — a
   stored membership is a stale one the moment the control moves, and these
   controls are meant to be dragged.
==================================================================== */
export function SplitSections({ items = [], request, sizeOf = () => null, renderItem,
  /* THE PRICE NOTE IS OPT-IN AND MUST STAY THAT WAY. It says every figure
     below is read at the price that fills, and a section whose rows are still
     priced at the MID may not print it: a label asserting a price the
     arithmetic did not use is the fault §4l is named after. */
  priceNote = false, emptyTop = null, style }) {
  const sp = splitByRequest(items, request, sizeOf);
  const Head = ({ children, tone }) => (
    <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: tone, marginTop: 12 }}>{children}</div>
  );
  return (
    <div style={style}>
      <Head tone={T.green}>{meetsHeading(request, sp.meets.length)}</Head>
      {priceNote && (
        <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 3 }}>{fillPriceHeading()}</div>
      )}
      {sp.meets.length === 0 && (
        <div style={{ ...mono, fontSize: 11, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
          {emptyTop || "Nothing answers all of it. What was found is below."}
        </div>
      )}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {sp.meets.map((m, i) => renderItem(m.cand, [], i))}
      </div>
      {sp.others.length > 0 && (
        <>
          <Head tone={T.amber}>{otherwiseHeading(sp.others.length)}</Head>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {sp.others.map((o, i) => renderItem(o.cand, o.misses, i))}
          </div>
        </>
      )}
    </div>
  );
}

/** The one-line reason a row sits in the second section. Never a paragraph. */
export function MissLine({ misses = [] }) {
  if (!misses.length) return null;
  return (
    <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 4 }}>
      {misses.map(missReasonLine).filter(Boolean).join(" \u00b7 ")}
    </div>
  );
}
