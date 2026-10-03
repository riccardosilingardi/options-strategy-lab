// ============================================================================
// src/card.jsx — THE CONTROLS, THE ONE CANDIDATE CARD, AND THE LIST THAT HOLDS THEM.
//
// ROADMAP P10 §2 and §3-bis. The owner sent two captures of a tool he finds clear and said "vedi com'e chiaro?".
// What those screens DO is two things:
//
//   1. EVERY CONTROL IS ABOVE EVERY RESULT, IN ONE BLOCK.
//   2. EVERY RESULT IS THE SAME CARD — a name, the legs in plain words, four figures always in the same places, a
//      small picture, one button. No prose. Not one sentence.
//
// >>> WHY THIS IS ITS OWN FILE. <<< It cannot live in `steps.jsx`: that file is the navigation and CLAUDE.md says
// it holds nothing about a trade, and a candidate card is nothing BUT a trade. It cannot live in `App.jsx` either:
// `wizard.jsx` and `find.jsx` render the same card and App.jsx imports them — that way round is a cycle. So it is
// a leaf: it imports `rules.js`, `visuals.jsx`, `ui.jsx` and `theme.js`, and App.jsx, find.jsx and wizard.jsx
// import it.
//
// >>> PR #45 MOVED THIS FILE ONTO `ui.jsx` AND THE TYPE TOKENS. <<< It imports its atoms and its sizes, defines no
// copy of either, and `ui.test.jsx` fails the build if that changes.
//
// IT DECIDES NOTHING AND COMPUTES NOTHING. Every figure it renders is handed to it already worked out, at the price
// that fills, by the caller that owns `analyze()` — and sized by `sizedFigures()` in rules.js, the one function Find
// and Build both call. A component that derives a figure is a second home for it.
// ============================================================================
import React from "react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Chip, Panel, Label, Stat, Note, Fold, NumberInput, TextArea, RangeField, Info, CheckField } from "./ui.jsx";
import { readingLine, unreadInputsAria, inputName, numbersFitLines, badgeText } from "./signals.js";
export { badgeText };
import { MARKET_CATEGORIES } from "./markets.js";
import { Gauge, UnifiedPosition, UnifiedFigure } from "./visuals.jsx";
import { RULES, money, chanceText, returnText, NO_CEILING,
  requestAmountLabel, amountNote, freeAmountNote, chanceAskLabel, chanceAskText, rewardAskLabel, controlsFoldNote,
  targetPriceOf, stopSigns, sizedHeading, CARD_LABELS,
  meetsRequest, resultsLine, missReasonLine, nearestRelaxation, fillPriceHeading,
  futureTile, pastTileText, futureInfo, pastInfo, HIDE_MISSES_TOGGLE } from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

/* A label over a value, which is the shape every figure in this file takes. Label above, value below, always in the
   same place — that is the whole of §3-bis point 5, and it is why nothing here takes a sentence.
   >>> NAMED `CardFigure`, NOT `Figure`. <<< `visuals.jsx` already exports a `Figure` — the tap-to-explain frame — and
   two components with one name in a tree this size is how a reader, a grep and `src/wordcount.mjs` all resolve to
   the wrong one. */
const CardFigure = ({ k, v, c, lines = null, info = null, sorted = false, muted = false, wide = false, words = false }) => (
  /* A TILE (PR #49): its name, its value, up to two short lines under it, a ⓘ in the name where it has one
     (`iconOnly`: the tile's name is the label), and — on the tile the list is sorted by — an accent ring and
     "sorted by" above the name, so the order is visible at rest (TASK 1). A miss is quieter: `T.mut`, which the
     theme test holds at 4.5:1 on both surfaces. */
  <div data-tile={k} data-sorted={sorted ? "true" : undefined}
    style={{ flex: wide ? "1 1 148px" : "1 1 72px", minWidth: wide ? 148 : 72, borderRadius: 6,
      ...(sorted ? { outline: `2px solid ${T.blue}`, outlineOffset: 3 } : null) }}>
    {sorted && <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, lineHeight: LH.tight, color: T.blue }}>sorted by</div>}
    <div style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", lineHeight: LH.tight, color: T.dim, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
      {k}{info}
    </div>
    <div style={{ ...(words ? sans : mono), fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: muted ? T.mut : (c || T.ink) }}>{v}</div>
    {lines && lines.map((l) => <div key={l} style={{ ...sans, fontSize: FS.xs, lineHeight: LH.tight, color: T.dim, marginTop: 2 }}>{l}</div>)}
  </div>
);

/* ====================================================================
   1) THE CONTROLS, ABOVE EVERY RESULT — ONE REQUEST BLOCK

   Modelled on OptionStrat's Optimize: one block of questions above one ranked list, and every control re-filters the
   list LIVE. There is no "Search" button: a control that only acts after another tap is a control whose effect the
   reader cannot see.

     MARKETS    which of the basket to read, all by default, grouped by the registry's categories (PR #48).
     DIRECTION  one for every market, or "Signals decide" per market (PR #48): its signals' family plus Neutral.
     SIZE BY    what I can spend, or what I want to make — two chips. The amount is a slider (PR #45): its top is the
                per-trade limit, or the trading capital under free sizing, and the limit is editable beside it.
     CHANCE     a minimum chance of profit; its leftmost position is "any", the default (PR #49).
     RETURN     a minimum return on risk. It can only TIGHTEN the reward floor (`minRewardRisk`), never loosen it,
                and the floor itself is not here and never will be.
     HORIZON    days to expiry; each market is built on its buildable board nearest this.

   Chance, return and size HIDE what misses (`MatchList`); the quality floors still REMOVE and say which did it.
   The target price is a read-out, shown only when there is one market and one direction to read it for.
==================================================================== */
export function RequestControls({
  // Which controls this mount renders; null is all of them.
  only = null,
  request, onChange,
  sentiments = [], direction = "signals", onDirection,
  universe = [], markets = [], onMarkets,
  horizon = RULES.targetEntryDTE, onHorizon,
  ticker = null, spot = null,
  limits = null, onLimit,
  // `controlReadings()` over the candidates on screen: each slider's histogram and its "N pass". Null draws neither.
  readings = null,
  style,
}) {
  const fixed = sentiments.find((s) => s.id === direction) || null;
  const target = targetPriceOf(spot, fixed);
  const shows = (id) => !only || only.includes(id);
  const free = request.riskCap == null;
  const amtMax = request.amtMax;
  const amtMin = amtMax != null ? Math.min(RULES.amountAskStep, amtMax) : null;
  const budget = request.mode === "budget";
  return (
    <Panel accent={T.amber} style={style}>
      <Label>WHAT DO YOU WANT?</Label>

      {shows("markets") && universe.length > 0 && (
        <MarketPicker universe={universe} markets={markets} onMarkets={onMarkets} />
      )}

      {shows("direction") && (
        <div style={{ marginTop: 8 }}>
          <Note color={T.dim}>DIRECTION</Note>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip on={direction === "signals"} label="Signals decide" onClick={() => onDirection && onDirection("signals")}>
              Signals decide
            </Chip>
            {sentiments.map((s) => (
              <Chip key={s.id} on={direction === s.id} color={s.color} label={s.label}
                onClick={() => onDirection && onDirection(s.id)}>{s.icon} {s.label}</Chip>
            ))}
          </div>
        </div>
      )}

      {shows("target") && fixed && ticker && (
        <Stat style={{ marginTop: 8 }} k="TARGET PRICE" c={target.known ? T.blue : T.dim}
          v={target.known ? `$${target.price.toFixed(2)} (${target.movePct >= 0 ? "+" : ""}${target.movePct.toFixed(0)}% on ${ticker})` : "not loaded"} />
      )}

      {shows("size") && (
        <div style={{ marginTop: 8 }}>
          <Note color={T.dim}>SIZE BY</Note>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip on={budget} onClick={() => onChange({ mode: "budget" })}>What I can spend</Chip>
            <Chip on={!budget} onClick={() => onChange({ mode: "target" })}>What I want to make</Chip>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "10px 24px", marginTop: 10 }}>
        {shows("size") && (
          <RangeField label={requestAmountLabel(request.mode)}
            value={request.amt} onChange={(v) => onChange({ amt: v })}
            min={amtMin == null ? 0 : amtMin} max={amtMax == null ? 0 : amtMax} step={RULES.amountAskStep}
            format={(v) => money(v)} parse={(t) => Number(String(t).replace(/[$,\s]/g, ""))} toInput={(v) => String(Math.round(v))}
            maxCaption={amtMax == null ? "" : `${money(amtMax)} ${free ? "capital" : "limit"}`}
            values={readings ? readings.size.values : null} passWhen={budget ? "below" : "above"}
            pass={readings ? readings.size.pass : null}
            aside={limits && !free && onLimit ? <PerTradeLimit limits={limits} onLimit={onLimit} /> : (free ? <Note>{freeAmountNote()}</Note> : null)}
            note={amountNote(request)} />
        )}
        {shows("chance") && (
          /* THE LEFTMOST POSITION IS "ANY" (PR #49, TASK 2): no minimum, the default. `requestOf()` reads it as null. */
          <RangeField label={chanceAskLabel()} color={T.violet}
            value={request.minChance == null ? RULES.chanceAskMin : request.minChance} onChange={(v) => onChange({ minChance: v })}
            min={RULES.chanceAskMin} max={RULES.chanceAskMax} step={RULES.chanceAskStep}
            format={(v) => chanceAskText(v)} parse={(t) => (/^\s*any\s*$/i.test(String(t)) ? RULES.chanceAskMin : Number(t) / 100)}
            toInput={(v) => (chanceAskText(v) === "any" ? "any" : String(Math.round(v * 100)))}
            values={readings ? readings.chance.values : null} pass={readings ? readings.chance.pass : null} />
        )}
        {shows("return") && (
          <RangeField label={rewardAskLabel()} color={T.blue}
            value={request.minReturn} onChange={(v) => onChange({ minReturn: v })}
            min={RULES.minRewardRisk} max={RULES.rewardAskMax} step={RULES.rewardAskStep}
            format={(v) => returnText(v)} parse={(t) => Number(t) / 100} toInput={(v) => String(Math.round(v * 100))}
            values={readings ? readings.return.values : null} pass={readings ? readings.return.pass : null} />
        )}
        {shows("horizon") && (
          <RangeField label="Horizon"
            value={horizon} onChange={(v) => onHorizon && onHorizon(Math.round(v))}
            min={RULES.minEntryDTE} max={RULES.maxEntryDTE} step={1}
            format={(v) => `${Math.round(v)} days`} parse={(t) => Number(t)} toInput={(v) => String(Math.round(v))}
            valueText={`${horizon} days to expiry`} />
        )}
      </div>

      {/* THE EXPLANATION FOLDS. A control that asks a question earns its words; a paragraph explaining the control
          does not (ROADMAP P10 §5). */}
      <Fold summary="What these do — and what they cannot do" label="why" tone={T.dim} style={{ marginTop: 8 }}>
        <Note style={{ marginTop: 6 }}>{controlsFoldNote(request)}</Note>
      </Fold>
    </Panel>
  );
}

/* THE MARKETS, BY CATEGORY (PR #48, TASK 1). One row per category of the registry (src/markets.js): its name, how
   many of its markets are selected ("2 of 3"), "all" and "none", then its tickers. The groups come from the
   registry, so a new market appears in its group with no change here. */
export function MarketPicker({ universe = [], markets = [], onMarkets }) {
  const groups = MARKET_CATEGORIES.map((c) => ({ id: c.id, tickers: c.tickers.filter((tk) => universe.includes(tk)) }))
    .filter((c) => c.tickers.length);
  const set = (m) => onMarkets && onMarkets(universe.filter((tk) => m.includes(tk)));
  return (
    <div style={{ marginTop: 8 }}>
      <Note color={T.dim}>{`MARKETS · ${markets.length} OF ${universe.length}`}</Note>
      {groups.map((g) => {
        const on = g.tickers.filter((tk) => markets.includes(tk)).length;
        return (
          <div key={g.id} role="group" aria-label={`${g.id} markets`} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
            <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.ink, minWidth: 56 }}>{g.id}</span>
            <span style={{ ...sans, fontSize: FS.xs, color: T.dim }}>{on} of {g.tickers.length} ·</span>
            <Btn small ghost color={T.blue} aria-label={`all ${g.id}`} disabled={on === g.tickers.length}
              onClick={() => set([...markets, ...g.tickers])}>all</Btn>
            <Btn small ghost color={T.blue} aria-label={`no ${g.id}`} disabled={on === 0}
              onClick={() => set(markets.filter((tk) => !g.tickers.includes(tk)))}>none</Btn>
            {g.tickers.map((tk) => (
              <Chip key={tk} on={markets.includes(tk)} color={T.blue} label={tk} monoText
                onClick={() => set(markets.includes(tk) ? markets.filter((x) => x !== tk) : [...markets, tk])}>
                {tk}
              </Chip>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* THE RESULTS FILTER, BY CATEGORY (PR #48, TASK 1): "All N · Grains n · Energy n · Metals n". Tapping a category
   filters the list to it and opens its tickers' counts; tapping a ticker filters to that one market (what the
   Shortlist was). A market still loading, failed or with no board says so instead of a count. */
export function ResultsFilter({ counts = [], total = 0, cat = null, market = null, statusOf = () => null, onCat, onMarket }) {
  const open = counts.find((c) => c.id === cat) || null;
  return (
    <div style={{ marginTop: 10 }}>
      <div role="group" aria-label="filter the results" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Chip on={!cat && !market} onClick={() => onCat && onCat(null)}>All {total}</Chip>
        {counts.map((c) => (
          <Chip key={c.id} on={cat === c.id} onClick={() => onCat && onCat(cat === c.id ? null : c.id)}>
            {c.id} {c.n}
          </Chip>
        ))}
      </div>
      {open && (
        <div role="group" aria-label={`${open.id} markets`} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
          {open.tickers.map((t) => (
            <Btn key={t.tk} small ghost={market !== t.tk} color={t.n ? T.amber : T.dim}
              onClick={() => onMarket && onMarket(market === t.tk ? null : t.tk)}>
              <span style={mono}>{t.tk}</span> {statusOf(t.tk) || String(t.n)}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

/* THE PER-TRADE LIMIT, EDITABLE WHERE THE BUDGET IS. Lowering it is one number. Raising it past the capped figure —
   5% of capital unless the capital answers make it lower — asks for the typed reason, and the value goes through
   `sizing()`'s existing override, which is what the risk gate reads. Nothing here decides: `sizing()` accepts or
   refuses. */
export function PerTradeLimit({ limits, onLimit }) {
  const [edit, setEdit] = React.useState(null);   // { v, reason } while editing
  const cap = Number(limits.cappedPerTrade);
  const v = edit ? Number(edit.v) : null;
  const needsReason = edit && Number.isFinite(v) && v > cap;
  const reasonOk = !needsReason || (edit.reason || "").trim().length >= RULES.minOverrideReasonChars;
  if (!edit) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Note>limit <span style={mono}>{money(limits.perTradeLimit)}</span> ·</Note>
        <Btn small ghost color={T.blue} aria-label="edit the per-trade limit"
          onClick={() => setEdit({ v: Math.round(limits.perTradeLimit), reason: "" })}>edit</Btn>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
      <NumberInput min={1} step={RULES.amountAskStep} aria-label="per-trade limit" value={edit.v}
        onChange={(e) => setEdit({ ...edit, v: e.target.value })} style={{ width: 128 }} />
      {needsReason && (
        <TextArea rows={2} aria-label="reason for raising the per-trade limit" value={edit.reason}
          placeholder={`Above ${money(cap)}: why? (${RULES.minOverrideReasonChars}+ characters, stored)`}
          onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
          style={{ border: `1px solid ${reasonOk ? T.green : T.amber}` }} />
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <Btn small disabled={!(v > 0) || !reasonOk}
          onClick={() => { onLimit({ perTrade: v, reason: (edit.reason || "").trim() }); setEdit(null); }}>Set</Btn>
        <Btn small ghost color={T.dim} onClick={() => setEdit(null)}>Cancel</Btn>
      </div>
    </div>
  );
}

export { CardFigure };

/* ====================================================================
   2) THE ONE CANDIDATE CARD (ROADMAP P10 §3-bis, points 2-4; PR #45, TASKS 3-4)

   Every result on the screen is THE SAME CARD — the name of the structure, the legs in plain words on one line, a
   picture beside a gauge, then exactly FOUR figures always in the same four places, and one button.

   >>> NO PROSE ON A CARD. NOT ONE SENTENCE. <<< Everything a card says, it says with a label and a number.
   `card.test.jsx` fails the build on a text node over six words anywhere on one, except the name and the legs line.
   The explanations and the warnings live on Build, and they are not on the way to anything.

   >>> THE FOUR FIGURES ARE FOR THE SIZE THE BUDGET BUYS (PR #45, TASK 3) <<< — YOU RISK (n × the risk), MAX PROFIT
   (n × the maximum profit, or "no ceiling"), CHANCE, RETURN ON RISK — and ONE LINE under them says how: "25 contracts
   × $193 at risk each". The per-contract figures are behind the card's fold. A card with no size says PER CONTRACT.

   >>> AND EVERY ONE OF THEM IS READ AT THE PRICE THAT FILLS <<< (`fillNet()` = `openLimitPrice()` on
   `comboBook()`), never at the mid. §4l is the whole argument: on UNG the same structure is 2.6:1 at the mid and
   1.1:1 at the price that trades, and the mid is a price this app has proved nobody gives you.

   IT COMPUTES NOTHING. `figures` is a `sizedFigures()` result; `picture` is what the two drawings need.
==================================================================== */
export function CandidateCard({
  name, legs = "", rr = null, pop = null, basis = null, figures = null, sizeText = null,
  picture = null, misses = [], actions = null, badge = null, direction = null, flags = [], signs = null,
  future = null, past = null, ticker = null, sortedBy = null, placeAtRest = null,
  cardKey = null, more = null, style,
}) {
  const f = figures || { n: null, risk: null, profit: null, unbounded: false, perRisk: null, perProfit: null };
  const sized = f.n != null;
  // A CARD THAT MISSES WHAT YOU ASKED STAYS IN ITS PLACE, QUIETER (PR #49, TASK 1): its reason first, its name and
  // figures in `T.mut` (4.5:1 on both surfaces, the theme test's floor), never removed.
  const muted = misses.length > 0;
  const ft = futureTile(future);
  const tile = (id) => ({ sorted: sortedBy === id, muted });
  return (
    // `data-card-key` is how "Back to the list" finds this card again (PR #44, TASK 3).
    <article data-card-key={cardKey || undefined} data-miss={muted ? "true" : undefined} aria-label={name}
      style={{ padding: "12px 14px", background: T.bg, borderWidth: 1, borderStyle: muted ? "dashed" : "solid", borderColor: T.line, borderRadius: 8, minWidth: 0, ...style }}>
      <MissLine misses={misses} />
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: muted ? T.mut : T.ink }}>{name}</span>
        {badge}
      </div>
      <div style={{ ...mono, fontSize: FS.xs, lineHeight: LH.body, color: T.mut, marginTop: 2 }}>{legs}</div>
      {direction && <div style={{ ...sans, fontSize: FS.xs, lineHeight: LH.body, color: muted ? T.mut : T.blue, marginTop: 2 }}>{direction}</div>}
      {/* STOP SIGNS, ABOVE THE NUMBERS: what the guided door used to drop in silence, and the facts that decide. */}
      <StopSigns signs={signs || stopSigns({ flags })} />
      {picture && <CardPicture {...picture} />}
      {/* SIX FIGURES, ALWAYS IN THE SAME PLACES (PR #49: the future and the past join the four) — and THEIR UNIT,
          said once above them. The one the list is sorted by is ringed and says "sorted by". */}
      <Note color={T.dim} style={{ marginTop: 8, letterSpacing: "0.04em" }}>{sizedHeading(f.n)}</Note>
      <div style={{ display: "flex", gap: "12px 10px", marginTop: 4, flexWrap: "wrap" }}>
        <CardFigure k={CARD_LABELS.risk} v={f.risk == null ? "—" : money(f.risk)} c={T.red} {...tile("risk")} />
        <CardFigure k={CARD_LABELS.profit} v={f.unbounded ? NO_CEILING : f.profit == null ? "—" : money(f.profit)} c={T.green} {...tile("profit")} />
        <CardFigure k={CARD_LABELS.chance} v={chanceText(pop)} c={pop >= 0.5 ? T.green : T.violet} {...tile("chance")} />
        <CardFigure k={CARD_LABELS.rr} v={rr == null ? "—" : returnText(rr)} c={T.amber} {...tile("rr")} />
        <CardFigure k={CARD_LABELS.future} wide v={ft.value} lines={ft.lines}
          c={future && future.avg != null ? (future.avg >= 0 ? T.green : T.violet) : T.dim}
          info={<Info iconOnly label={CARD_LABELS.future.toLowerCase()}>{futureInfo()}</Info>} {...tile("future")} />
        <CardFigure k={CARD_LABELS.past} wide words v={pastTileText(past)}
          c={past ? (past.avg >= 0 ? T.green : T.violet) : T.dim}
          info={<Info iconOnly label={CARD_LABELS.past.toLowerCase()}>{pastInfo(past, ticker || "the ETF")}</Info>} {...tile("past")} />
      </div>
      {/* "FUTURE AVG + SIGNAL" SAYS ITS SUM AT REST (PR #49, TASK 1): `placeLine()`, out of the fold. */}
      {placeAtRest && <div data-place style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, lineHeight: LH.body, color: muted ? T.mut : T.blue, marginTop: 6 }}>{placeAtRest}</div>}
      {/* WHAT THE CHANCE IS MADE OF (PR #48): "prices + season" when a month in the window beat its noise, else
          "prices only". `chanceBasisLabel()` in rules.js; Find and Build pass the same one. */}
      {basis && <Note color={T.dim} style={{ marginTop: 2 }}>chance: {basis}</Note>}
      {sizeText && <div style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, lineHeight: LH.body, color: T.blue, marginTop: 6 }}>{sizeText}</div>}
      {(sized || more) && (
        <Fold summary={sized ? "Per contract" : "More"} label={sized ? "figures" : "more"} tone={T.dim} style={{ marginTop: 2 }}>
          {sized && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CardFigure k="RISK, ONE CONTRACT" v={f.perRisk == null ? "—" : money(f.perRisk)} c={T.red} />
            <CardFigure k="MAX PROFIT, ONE CONTRACT" v={f.unbounded ? NO_CEILING : f.perProfit == null ? "—" : money(f.perProfit)} c={T.green} />
          </div>
          )}
          {/* EVIDENCE HAS A SUBJECT (PR #46, TASK 2): this card's market, not Build's. */}
          {more && (
            <Btn small ghost color={T.blue} onClick={more.onOpen} style={{ marginTop: 6 }}>
              More on {more.tk}: levels · history
            </Btn>
          )}
        </Fold>
      )}
      {actions && <div style={{ marginTop: 8 }}>{actions}</div>}
    </article>
  );
}

/* THE PICTURE ROW (PR #45, TASK 4): the gauge, and beside it the unified picture — price history, the dispersion
   cone, the terminal distribution and the payoff on ONE price axis. `UnifiedPosition` already has two levels of
   detail by its own width (history and payoff only when narrow); on a card it is narrow, so it is the compact one,
   and the same component drawn wide is the full one. The band thumbnail is gone from the card: the unified picture
   contains it. A tap opens the full figure in place — `UnifiedFigure`, with its takeaway and its tap-to-explain —
   and a second button closes it, so there is no new screen for Back to know about.

   It is memoised: a slider moves the size, the count and the heading, and none of them touches a drawing. */
export const CardPicture = React.memo(function CardPicture({ bands, legs, entryNet, spot, bars, dte, sigma, driftAnnual, ticker }) {
  const [open, setOpen] = React.useState(false);
  if (!bands || !legs || !legs.length) return null;
  if (open) {
    return (
      <div style={{ marginTop: 8 }}>
        <UnifiedFigure legs={legs} entryNet={entryNet} spot={spot} bars={bars} dte={dte} sigma={sigma}
          driftAnnual={driftAnnual} ticker={ticker} height={300} />
        <Btn small ghost color={T.blue} aria-expanded="true" onClick={() => setOpen(false)} style={{ marginTop: 6 }}>Close the picture</Btn>
      </div>
    );
  }
  return (
    <button onClick={() => setOpen(true)} aria-expanded="false" aria-label={`Open the full picture for ${ticker || "this market"}`}
      style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", marginTop: 8, padding: 0, background: "transparent",
        border: "none", cursor: "pointer", minHeight: 44, textAlign: "left" }}>
      <span style={{ flex: "0 0 auto", display: "block" }}><Gauge bands={bands} size={104} labelSize={FS.xs} ticker={ticker || "this market"} /></span>
      <span style={{ flex: "1 1 0", minWidth: 0, display: "block" }}>
        <UnifiedPosition legs={legs} entryNet={entryNet} spot={spot} bars={bars} dte={dte} sigma={sigma}
          driftAnnual={driftAnnual} ticker={ticker || "this market"} height={104} labelSize={FS.xs} fallbackWidth={260} />
      </span>
    </button>
  );
});

/* ONE BADGE PER CARD: agreement · score · confidence. It is a button: the four readings behind it (seasonality,
   trend, weather, news) open in "Why this market" for that market. It replaces the separate four-factor list, which
   read as a second verdict beside the structures (PR #40, TASK 1). */
export function SignalBadge({ fused, state = null, ticker = null, onClick }) {
  const tk = ticker || (fused && fused.ticker) || "";
  /* READING. A market whose news, bars or seasonal series are still on the way shows no score at all (PR #44,
     TASK 4): a number printed before its inputs landed is the number that moves when the card is opened. Under
     "Signals decide" it shows its Neutral cards meanwhile (PR #48). */
  if (state && state.reading) {
    return (
      <span role="status" aria-label={readingLine(state)} style={{ ...sans, fontSize: FS.xs, color: T.dim, border: `1px dashed ${T.field}`, borderRadius: 5, padding: "4px 8px" }}>
        {tk ? `${tk} ` : ""}reading…
      </span>
    );
  }
  if (!fused) return null;
  // CONFLICT is amber, not red (PR #49, TASK 4): red is for errors and refusals only, and a disagreement is neither.
  const c = fused.agreement === "CONFLICT" ? T.amber : fused.agreement === "CONFLUENT" ? T.green : T.blue;
  // A FAILED INPUT IS NAMED ON THE BADGE; the factor is scored as neutral and the rest as usual.
  const failed = state && state.failed ? state.failed : [];
  // "<TK> ↑ +64 · conf 86" (PR #48, TASK 4): the market, the score's direction and sign, the confidence.
  return (
    <button onClick={onClick} aria-label={`why this market${unreadInputsAria(failed) ? `. ${unreadInputsAria(failed)}` : ""}`}
      style={{ ...sans, fontSize: FS.xs, color: c, border: `1px solid ${c}`, borderRadius: 5, padding: "4px 8px",
        background: "transparent", cursor: "pointer", minHeight: 44 }}>
      {badgeText(fused, tk)}
      {failed.length > 0 && <span style={{ color: T.amber }}> · {failed.map((f) => inputName(f.key)).join(", ")} not read</span>}
    </button>
  );
}

/* "HOW THE NUMBERS FIT" (PR #48, TASK 4): one ⓘ, beside the results line and on the Why sheet, written from the
   constants by `numbersFitLines()` (signals.js). */
export function NumbersFit({ order }) {
  return (
    <Info label="how the numbers fit">
      {numbersFitLines(order).map((l) => <span key={l.k} style={{ display: "block", marginTop: 2 }}>{l.text}</span>)}
    </Info>
  );
}

/* ====================================================================
   3) THE LIST: ONE LIST, SORTED, AND WHAT MISSES STAYS IN PLACE (PR #45, TASK 1; ONE LIST SINCE PR #49, TASK 1)

   PR #45: "the filters do not filter" — a card that missed the request was HIDDEN behind a count. PR #49, measured
   live: the list sorted inside two groups, matches first; with 1 match of 9 the top card never changed whichever
   order was chosen, and the rest re-sorted only once "the 8 that miss" was opened. The owner read it as "order by
   does not work". So: ONE list, in the chosen order across every card (the caller sorts it); a card that misses
   stays where the order puts it, quieter, with its reason at the top; "Hide cards that miss" (off by default) gives
   the old view. The line reads "N cards match what you asked · M shown as misses" (or "· M hidden").

   >>> IT NEVER REMOVES. <<< The quality floors remove, and say which floor did it; they are untouched. Membership is
   DERIVED on every render from `meetsRequest()` and is never stored on a candidate — a stored membership is a stale
   one the moment a slider moves, and these controls are meant to be dragged.

   With NOTHING matching, the line says which control binds and the nearest value that lets something in, read off
   the candidates' own figures (`nearestRelaxation()`).
==================================================================== */
export function MatchList({ items = [], request, sizeOf = () => null, renderItem, hideMisses = false, onHideMisses = null,
  /* THE PRICE NOTE IS OPT-IN AND MUST STAY THAT WAY. It says every figure below is read at the price that fills, and
     a section whose rows are still priced at the MID may not print it: a label asserting a price the arithmetic did
     not use is the fault §4l is named after. */
  priceNote = false, aside = null, style }) {
  const rows = React.useMemo(() => items.map((c) => ({ cand: c, misses: meetsRequest(c, request, sizeOf(c)).misses })),
    [items, request, sizeOf]);
  const n = rows.filter((r) => !r.misses.length).length, m = rows.length - n;
  const relax = React.useMemo(() => (n === 0 && m > 0 ? nearestRelaxation(items, request, sizeOf) : null), [n, m, items, request, sizeOf]);
  const line = resultsLine(n, m, hideMisses);
  const shown = hideMisses ? rows.filter((r) => !r.misses.length) : rows;
  return (
    <div style={style}>
      <div aria-live="polite" style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink, minHeight: 44, display: "flex", alignItems: "center" }}>{line}</div>
      {onHideMisses && m > 0 && (
        <CheckField checked={hideMisses} onChange={(e) => onHideMisses(e.target.checked)}>{HIDE_MISSES_TOGGLE}</CheckField>
      )}
      {aside}
      {priceNote && <Note color={T.dim}>{fillPriceHeading()}</Note>}
      {relax && <Note color={T.amber} style={{ marginTop: 2 }} role="status">{relax.text}</Note>}
      <CardGrid style={{ marginTop: 8 }}>{shown.map((r, i) => renderItem(r.cand, r.misses, i))}</CardGrid>
    </div>
  );
}

/** Cards in a grid: one column on a phone, as many ~340px columns as the screen holds on a desktop. */
export function CardGrid({ children, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 10, alignItems: "start", ...style }}>
      {children}
    </div>
  );
}

/** The one-line reason a row sits among the misses. Never a paragraph. */
export function MissLine({ misses = [] }) {
  if (!misses.length) return null;
  return (
    <div style={{ ...sans, fontSize: FS.xs, lineHeight: LH.body, color: T.amber, marginTop: 4 }}>
      {misses.map(missReasonLine).filter(Boolean).join(" · ")}
    </div>
  );
}

/* THE STOP-SIGNS STRIP (PR #40, TASK 2). At most three short labels, from `stopSigns()` in rules.js; "+N" says there
   are more, and on Build the full sentences sit behind one "why" beside it. Nothing here decides anything. */
export function StopSigns({ signs, children, style }) {
  if (!signs || !signs.labels || !signs.labels.length) return null;
  return (
    <div style={{ marginTop: 6, ...style }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", color: T.red, fontWeight: FW.bold }}>STOP SIGNS</span>
        {signs.labels.map((f) => (
          <span key={f.id} style={{ ...sans, fontSize: FS.xs, color: T.red, border: `1px solid ${T.red}`, borderRadius: 4, padding: "1px 6px" }}>{f.label}</span>
        ))}
        {signs.more > 0 && <span style={{ ...sans, fontSize: FS.xs, color: T.red }}>+{signs.more}</span>}
      </div>
      {children}
    </div>
  );
}

/* ====================================================================
   4) COMPARE AND KEEP — what is ticked, and the row of three buttons every card carries
   (moved here from steps.jsx in PR #45: they are nothing but candidates, and only Find mounts them)
==================================================================== */
export function CompareTray({ items = [], max = 3, onRemove, onClear, onCompare, showing, note }) {
  if (!items.length && !note) return null;
  return (
    <Panel accent={T.blue} style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${T.blue}55`, borderLeft: `3px solid ${T.blue}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Label color={T.blue}>COMPARING {items.length} OF {max}</Label>
        {items.map((c) => (
          <Btn small ghost key={c.key} onClick={() => onRemove && onRemove(c)} color={T.dim}
            aria-label={`Take ${c.ticker} ${c.name} out of the comparison`}>
            {c.ticker} {c.name} ✕
          </Btn>
        ))}
        <span style={{ flex: 1 }} />
        {items.length >= 2 && (
          <Btn color={T.blue} ghost={!!showing} onClick={onCompare}>{showing ? "Hide the comparison" : "Compare them"}</Btn>
        )}
        {items.length > 0 && <Btn small ghost color={T.mut} onClick={onClear}>clear</Btn>}
      </div>
      {items.length === 1 && <Note style={{ marginTop: 6 }}>Tick a second one to compare it with.</Note>}
      {note && <Note color={T.amber} style={{ marginTop: 6 }}>{note}</Note>}
    </Panel>
  );
}

/** The three controls every candidate row carries: tick, keep, and take it to Build. */
export function CandidateActions({ ticked, onTick, saved, onSave, onBuild }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <Btn small ghost={!ticked} color={T.blue} onClick={onTick}>{ticked ? "✓ comparing" : "Compare"}</Btn>
      <Btn small ghost={!saved} color={T.violet} disabled={saved} onClick={onSave} style={{ opacity: 1, cursor: saved ? "default" : "pointer" }}>
        {saved ? "✓ saved" : "Save for later"}
      </Btn>
      {onBuild && <Btn small ghost color={T.amber} onClick={onBuild}>Take to Build →</Btn>}
    </div>
  );
}
