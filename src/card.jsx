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
  targetPriceOf, targetPriceNote, amountChips, stopSigns,
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
   1) THE CONTROLS, ABOVE EVERY RESULT — ONE REQUEST BLOCK (PR #40, TASK 1)

   Modelled on OptionStrat's Optimize: one block of questions above one ranked
   list, and every control re-filters the list LIVE. There is no "Search"
   button: a control that only acts after another tap is a control whose
   effect the reader cannot see.

     MARKETS    which of the basket to read, all by default.
     DIRECTION  one for every market, or "Season decides" per market.
     SIZE BY    what I can spend, or what I want to make — and the quick
                amounts relabel for the mode ("risk $250" / "make $250").
                The per-trade limit is editable inline; above the capped figure
                it asks for a typed reason, the same override `sizing()` has
                always read. No RULES value moves.
     HORIZON    days to expiry; each market is built on its buildable board
                nearest this. It replaces the single-market expiry dropdown and
                the wide search's slider — two answers to one question.
     CHANCE     a minimum chance of profit. It GROUPS the list; it removes
                nothing, and `minRewardRisk` is not in it and never will be.

   The target price is a read-out, shown only when there is one market and
   one direction to read it for.
==================================================================== */
export function RequestControls({
  // Which controls this mount renders; null is all of them.
  only = null,
  request, onChange,
  sentiments = [], direction = "season", onDirection,
  universe = [], markets = [], onMarkets,
  horizon = RULES.targetEntryDTE, onHorizon,
  ticker = null, spot = null,
  limits = null, onLimit,
  style,
}) {
  const fixed = sentiments.find((s) => s.id === direction) || null;
  const target = targetPriceOf(spot, fixed);
  const pct = Math.round(request.minChance * 100);
  const shows = (id) => !only || only.includes(id);
  const chips = limits ? amountChips(request, limits.perTradeLimit) : [];
  const Chip = ({ on, onClick, children, color = T.amber, label }) => (
    <button onClick={onClick} aria-label={label}
      style={{ ...mono, fontSize: 11, fontWeight: 700, padding: "8px 10px", minHeight: 38, borderRadius: 20,
        cursor: "pointer", border: `1.5px solid ${color}`, background: on ? color : "transparent",
        color: on ? T.onAccent : color }}>{children}</button>
  );
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.amber}`,
      borderRadius: 8, padding: "12px 14px", ...style }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>WHAT DO YOU WANT?</div>

      {shows("markets") && universe.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Ctl k={`MARKETS · ${markets.length} OF ${universe.length}`}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {universe.map((tk) => (
                <Chip key={tk} on={markets.includes(tk)} color={T.blue} label={tk}
                  onClick={() => onMarkets && onMarkets(markets.includes(tk) ? markets.filter((x) => x !== tk) : [...markets, tk])}>
                  {tk}
                </Chip>
              ))}
            </div>
          </Ctl>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "flex-start" }}>
        {shows("direction") && (
        <Ctl k="DIRECTION" grow={2}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Chip on={direction === "season"} label="Season decides" onClick={() => onDirection && onDirection("season")}>
              Season decides
            </Chip>
            {sentiments.map((s) => (
              <Chip key={s.id} on={direction === s.id} color={s.color} label={s.label}
                onClick={() => onDirection && onDirection(s.id)}>{s.icon} {s.label}</Chip>
            ))}
          </div>
        </Ctl>
        )}

        {shows("target") && fixed && ticker && (
        <Ctl k="TARGET PRICE">
          <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: target.known ? T.blue : T.dim }}>
            {target.known ? `$${target.price.toFixed(2)}` : "not loaded"}
          </div>
          <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
            {target.known ? `${target.movePct >= 0 ? "+" : ""}${target.movePct.toFixed(0)}% on ${ticker}` : "prices not in"}
          </div>
        </Ctl>
        )}

        {shows("size") && (
        <Ctl k="SIZE BY" grow={2}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Chip on={request.mode === "budget"} onClick={() => onChange({ mode: "budget" })}>What I can spend</Chip>
            <Chip on={request.mode === "target"} onClick={() => onChange({ mode: "target" })}>What I want to make</Chip>
          </div>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim, margin: "7px 0 3px" }}>
            {requestAmountLabel(request.mode)}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <input type="number" min={25} step={25} inputMode="numeric"
              aria-label={requestAmountLabel(request.mode)}
              value={request.amt == null ? "" : request.amt}
              onChange={(e) => onChange({ amt: e.target.value === "" ? null : Math.max(0, +e.target.value) })}
              style={{ ...mono, width: 96, background: T.bg, color: T.ink, border: `1px solid ${T.line}`,
                borderRadius: 6, padding: "9px 10px", fontSize: 14, minHeight: 38 }} />
            {chips.map((c) => (
              <Chip key={c.amt} on={request.amt === c.amt} onClick={() => onChange({ amt: c.amt })}>{c.label}</Chip>
            ))}
          </div>
          <div style={{ ...mono, fontSize: 9.5, color: request.amtAnswered ? T.green : T.dim, marginTop: 3 }}>
            {requestAmountOwner(request)}
          </div>
          {limits && onLimit && <PerTradeLimit limits={limits} onLimit={onLimit} />}
        </Ctl>
        )}

        {shows("horizon") && (
        <Ctl k={`HORIZON · ~${horizon} DAYS`}>
          <input type="range" aria-label="horizon in days" min={RULES.minEntryDTE} max={RULES.maxEntryDTE} step={1}
            value={horizon} onChange={(e) => onHorizon && onHorizon(+e.target.value)}
            style={{ width: "100%", height: 30, accentColor: T.amber, cursor: "pointer", minHeight: 38 }} />
          <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 9.5, color: T.dim }}>
            <span>{RULES.minEntryDTE}d</span><span>{RULES.maxEntryDTE}d</span>
          </div>
        </Ctl>
        )}
      </div>

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
      <Fold summary={`What these do — and what they cannot do`} label="why" tone={T.dim}
        style={{ marginTop: 8 }}>
        <div style={{ ...sans, fontSize: 12.5, color: T.mut, lineHeight: 1.55, marginTop: 6 }}>
          {controlsFoldNote(request)}
        </div>
      </Fold>
    </div>
  );
}

/* THE PER-TRADE LIMIT, EDITABLE WHERE THE BUDGET IS (PR #40, TASK 1).
   Lowering it is one number. Raising it past the capped figure — 5% of capital
   unless the capital answers make it lower — asks for the typed reason, and the
   value goes through `sizing()`'s existing override, which is what the risk
   gate reads. Nothing here decides: `sizing()` accepts or refuses. */
export function PerTradeLimit({ limits, onLimit }) {
  const [edit, setEdit] = React.useState(null);   // { v, reason } while editing
  const cap = Number(limits.cappedPerTrade);
  const v = edit ? Number(edit.v) : null;
  const needsReason = edit && Number.isFinite(v) && v > cap;
  const reasonOk = !needsReason || (edit.reason || "").trim().length >= RULES.minOverrideReasonChars;
  return (
    <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 5 }}>
      {!edit ? (
        <span>
          per-trade limit {money(limits.perTradeLimit)}{" "}
          <button onClick={() => setEdit({ v: Math.round(limits.perTradeLimit), reason: "" })}
            style={{ ...mono, fontSize: 9.5, color: T.blue, background: "transparent", border: "none", cursor: "pointer", padding: "4px 2px", minHeight: 38 }}>
            edit
          </button>
        </span>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          <input type="number" min={1} step={25} aria-label="per-trade limit" value={edit.v}
            onChange={(e) => setEdit({ ...edit, v: e.target.value })}
            style={{ ...mono, width: 96, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 9px", fontSize: 13, minHeight: 38 }} />
          {needsReason && (
            <textarea rows={2} aria-label="reason for raising the per-trade limit" value={edit.reason}
              placeholder={`Above ${money(cap)}: why? (${RULES.minOverrideReasonChars}+ characters, stored)`}
              onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
              style={{ ...mono, fontSize: 11, background: T.bg, color: T.ink, border: `1px solid ${reasonOk ? T.green : T.amber}`, borderRadius: 6, padding: "6px 8px" }} />
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button disabled={!(v > 0) || !reasonOk}
              onClick={() => { onLimit({ perTrade: v, reason: (edit.reason || "").trim() }); setEdit(null); }}
              style={{ ...mono, fontSize: 10.5, minHeight: 38, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: T.amber, color: T.onAccent, border: "none", opacity: !(v > 0) || !reasonOk ? 0.5 : 1 }}>
              Set
            </button>
            <button onClick={() => setEdit(null)}
              style={{ ...mono, fontSize: 10.5, minHeight: 38, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: "transparent", color: T.dim, border: `1px solid ${T.line}` }}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
   2) THE ONE CANDIDATE CARD (ROADMAP P10 §3-bis, points 2-4)

   The owner sent two captures of a tool he finds clear: "vedi com'e chiaro?".
   Every result on that screen is THE SAME CARD — the name of the structure,
   the legs in plain words on one line, then exactly FOUR figures always in
   the same four places, a small payoff picture, and one button.

   >>> NO PROSE ON A CARD. NOT ONE SENTENCE. <<< Everything a card says, it
   says with a label and a number. `card.test.jsx` fails the build on a text
   node over six words anywhere on one, except the name and the legs line.
   The explanations and the warnings live on Build, and they are not on the
   way to anything.

   >>> THE FOUR FIGURES ANSWER THREE QUESTIONS AND NOTHING ELSE <<< — what do
   I get, what do I risk, how likely is it: RETURN ON RISK, CHANCE, PROFIT,
   RISK. Anything that is not one of those three is not on the card.

   >>> AND EVERY ONE OF THEM IS READ AT THE PRICE THAT FILLS <<<
   (`fillNet()` = `openLimitPrice()` on `comboBook()`), never at the mid. The
   section header says so once. §4l is the whole argument: on UNG the same
   structure is 2.6:1 at the mid and 1.1:1 at the price that trades, and the
   mid is a price this app has proved nobody gives you.

   IT COMPUTES NOTHING. Every figure is handed in, already worked out, by the
   caller that owns `analyze()`. A component that derives a figure is a second
   home for it.
==================================================================== */
export function CandidateCard({
  name, legs = "", rr = null, pop = null, profit = null, risk = null,
  noCeiling = false, bands = null, bars = [], ticker = null,
  misses = [], actions = null, badge = null, flags = [], signs = null, size = null, style,
}) {
  return (
    <div style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`,
      borderRadius: 8, ...style }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...sans, fontSize: 14, fontWeight: 700, color: T.ink }}>{name}</span>
        {badge}
      </div>
      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>{legs}</div>
      {/* STOP SIGNS, ABOVE THE NUMBERS (PR #40, TASK 2): what the guided door
          used to drop in silence, and the facts that decide, in three labels. */}
      <StopSigns signs={signs || stopSigns({ flags })} />
      <MissLine misses={misses} />
      {bands && (
        <div style={{ display: "flex", gap: 10, marginTop: 7, flexWrap: "wrap", alignItems: "center" }}>
          <BandThumbnail bands={bands} bars={bars} width={190} height={40}
            title={bandTakeaway(bands, { ticker: ticker || "this market" })} />
          <Gauge bands={bands} size={96} ticker={ticker || "this market"} />
        </div>
      )}
      {/* FOUR FIGURES, ALWAYS THE SAME FOUR, ALWAYS IN THE SAME PLACES —
          and THEIR UNIT, said once above them (PR #40, TASK 0). */}
      <div style={{ ...mono, fontSize: 8.5, letterSpacing: "0.08em", color: T.dim, marginTop: 8 }}>PER CONTRACT</div>
      <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
        <CardFigure k="RETURN ON RISK" v={rr == null ? "\u2014" : `${Math.round(rr * 100)}%`} c={T.amber} />
        <CardFigure k="CHANCE" v={chanceText(pop)} c={pop >= 0.5 ? T.green : T.violet} />
        <CardFigure k="PROFIT" v={noCeiling ? NO_CEILING : money(profit)} c={T.green} />
        <CardFigure k="RISK" v={money(Math.abs(Number(risk)))} c={T.red} />
      </div>
      {/* TARGET MODE VISIBLY CHANGES EVERY CARD (PR #40, TASK 1). */}
      {size && <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: T.blue, marginTop: 6 }}>{size}</div>}
      {actions && <div style={{ marginTop: 8 }}>{actions}</div>}
    </div>
  );
}

/* ONE BADGE PER CARD: agreement · score · confidence. It is a button: the
   four readings behind it (seasonality, trend, weather, news) open in "Why
   this market" for that market. It replaces the separate four-factor list,
   which read as a second verdict beside the structures (PR #40, TASK 1). */
export function SignalBadge({ fused, onClick }) {
  if (!fused) return null;
  const c = fused.agreement === "CONFLICT" ? T.red : fused.agreement === "CONFLUENT" ? T.green : T.blue;
  return (
    <button onClick={onClick} aria-label="why this market"
      style={{ ...mono, fontSize: 9.5, color: c, border: `1px solid ${c}66`, borderRadius: 5, padding: "4px 8px",
        background: "transparent", cursor: "pointer", minHeight: 28 }}>
      {fused.agreement} · {fused.score > 0 ? "+" : ""}{fused.score} · conf {fused.confidence}
    </button>
  );
}

/* ====================================================================
   3) THE LIST, IN TWO SECTIONS (ROADMAP P10 §3)

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

/* THE STOP-SIGNS STRIP (PR #40, TASK 2). At most three short labels, from
   `stopSigns()` in rules.js; "+N" says there are more, and on Build the full
   sentences sit behind one "why" beside it. Nothing here decides anything. */
export function StopSigns({ signs, children, style }) {
  if (!signs || !signs.labels || !signs.labels.length) return null;
  return (
    <div style={{ marginTop: 6, ...style }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...mono, fontSize: 8.5, letterSpacing: "0.08em", color: T.red, fontWeight: 800 }}>STOP SIGNS</span>
        {signs.labels.map((f) => (
          <span key={f.id} style={{ ...mono, fontSize: 9.5, color: T.red, border: `1px solid ${T.red}66`, borderRadius: 4, padding: "1px 6px" }}>{f.label}</span>
        ))}
        {signs.more > 0 && <span style={{ ...mono, fontSize: 9.5, color: T.red }}>+{signs.more}</span>}
      </div>
      {children}
    </div>
  );
}
