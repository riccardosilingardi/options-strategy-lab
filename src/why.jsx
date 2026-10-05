// ============================================================================
// src/why.jsx — "WHY THIS TRADE": the 4-factor read, in plain English.
//
// This panel used to live inside pro.jsx, which meant the evidence for a trade
// could only be shown on the desk. It is needed on the wizard's decision screen
// too — a road with no evidence under it is a recommendation, and this app does
// not make recommendations — so it lives in its own file rather than being
// written twice or dragging the whole desk into the wizard's bundle.
//
// Progressive disclosure (PRD §6): the verdict and the narrative are always
// visible; the four components sit behind a tap. Mobile has no hover, so every
// explanation opens on tap, closes on a tap outside, and on a narrow screen it
// renders below the bars instead of floating over them.
//
// Weather and News are not tabs (CLAUDE.md, navigation): they are the drill-down
// behind their own bars here — tapping the weather bar opens the regions and
// their anomalies, tapping the news bar opens the headlines with their tags.
//
// Every threshold and every number comes from src/signals.js. Nothing in this
// file decides anything: it renders what fuseSignals() already worked out.
// ============================================================================
import React, { useState, useEffect } from "react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Label, Stat } from "./ui.jsx";
// The fold lives in steps.jsx — chrome with no trade in it (P9, TASK 3).
import { Fold } from "./steps.jsx";
import { ARROW, regionSignals, newsLine, verdictLine, scoreWorking, confidenceWorking } from "./signals.js";
import { whyFindEffect, WEIGHTS_CHOSEN_LINE, seasonRowLines, chanceBasisLabel } from "./rules.js";
import { useNarrow } from "./visuals.jsx";
import { NumbersFit } from "./card.jsx";

// PR #48 SWEEP: Label, Stat and the stacks are ui.jsx's, the sizes are the type tokens. Mono only where the text is
// numbers or tickers (the verdict's figures, the season months, a factor's strength, a region's markets). RED IS FOR
// ERRORS AND REFUSALS: a down reading is violet, a CONFLICT and a low confidence amber (warnings, not errors).
const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

/* ================================================================
   The tags under a headline: which tickers it moves, and which way.
   Directions are NUMBERS (1 / 0 / -1) everywhere; ARROW turns them into
   something readable exactly once, here.
================================================================ */
export const ImpactTags = ({ item }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
    {item.geo && <span style={{ ...sans, fontSize: FS.xs, color: T.violet, border: `1px solid ${T.violet}55`, padding: "2px 6px", borderRadius: 4 }}>GEO/GOV</span>}
    {item.analysis && <span style={{ ...sans, fontSize: FS.xs, color: T.blue, border: `1px solid ${T.blue}55`, padding: "2px 6px", borderRadius: 4 }}>ANALYSIS</span>}
    {(item.impacts || []).length === 0 && <span style={{ ...sans, fontSize: FS.xs, color: T.dim, border: `1px solid ${T.line}`, padding: "2px 6px", borderRadius: 4 }}>general market</span>}
    {(item.impacts || []).map((im) => {
      const c = im.dir > 0 ? T.green : im.dir < 0 ? T.violet : T.mut;
      return (
        <span key={im.tk} title={im.why} style={{ ...sans, fontSize: FS.xs, color: c, border: `1px solid ${c}55`, padding: "2px 6px", borderRadius: 4, cursor: "help" }}>
          {im.tk} {ARROW[im.dir]} · {im.why}
        </span>
      );
    })}
  </div>
);

/* ================================================================
   WHY THIS TRADE — the 4-factor read
================================================================ */

const AGREEMENT_STYLE = {
  CONFLUENT: { c: T.green, label: "CONFLUENT", meaning: "three or more factors point the same way" },
  MIXED: { c: T.blue, label: "MIXED", meaning: "some factors push, the rest stay quiet" },
  CONFLICT: { c: T.amber, label: "CONFLICT", meaning: "the factors contradict each other" },
};
export const FACTOR_LABEL = { seasonal: "Seasonality", technical: "Price trend", weather: "Weather", news: "News flow" };
const FACTOR_ORDER = ["seasonal", "technical", "weather", "news"];
/** The weights this market was actually scored on, in words. */
const weightList = (fused) => {
  const w = fused.weights || {};
  const keys = (fused.factors || FACTOR_ORDER).filter((k) => Number.isFinite(w[k]));
  if (!keys.length) return "these factors weighted together";
  const parts = keys.map((k) => `${FACTOR_LABEL[k].toLowerCase()} ${Math.round(w[k] * 100)}%`);
  const excluded = (fused.excluded || []).map((k) => FACTOR_LABEL[k].toLowerCase());
  return `${keys.length === FACTOR_ORDER.length ? "these four" : `these ${keys.length}`} weighted together: ${parts.join(", ")}` +
    (excluded.length ? ` — ${excluded.join(" and ")} does not apply to this market, so it is not in the score and its share is spread over the rest` : "");
};

/** `Seasonality, Price trend, Weather and News flow` — generated, never typed. */
const FACTOR_LIST = FACTOR_ORDER.map((k) => FACTOR_LABEL[k])
  .reduce((acc, x, i, all) => (i === 0 ? x : i === all.length - 1 ? `${acc} and ${x}` : `${acc}, ${x}`), "");

// `useNarrow` lives in src/visuals.jsx with the rest of the tap-to-explain
// plumbing — one definition, re-exported here so old imports keep working.
export { useNarrow };

/* ---- the drill-down behind the weather and news bars ----
   Weather and News used to be tabs of their own, which meant the evidence for a
   trade lived two taps away from the trade. They are not destinations: they are
   what this panel is claiming. Tapping the weather bar opens the regions and
   their anomalies; tapping the news bar opens the headlines with their tags. */

function WeatherDrill({ ticker, weatherData, month }) {
  const rows = regionSignals(weatherData, month).filter((r) => !ticker || r.tks.includes(ticker));
  if (!weatherData) return <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 6 }}>The forecast has not loaded yet.</div>;
  if (!rows.length) return <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 6 }}>No region watched for {ticker} has a usable forecast right now.</div>;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {rows.map((r, i) => {
        const c = r.numDir > 0 ? T.green : r.numDir < 0 ? T.violet : T.mut;
        return (
          <div key={i} style={{ padding: "7px 9px", background: T.bg, border: `1px solid ${c}44`, borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: c }}>{r.dir}</span>
              <span style={{ ...sans, fontSize: FS.xs, color: T.ink }}>{r.region}</span>
              <span style={{ ...mono, fontSize: FS.xs, color: T.dim }}>{r.tks.join(" · ")} · {r.strength}</span>
            </div>
            <div style={{ fontSize: FS.xs, color: T.body, marginTop: 3, lineHeight: LH.body }}>{r.why}</div>
          </div>
        );
      })}
      {/* A METHODOLOGY FOOTNOTE UNDER A LIST OF REGIONS (P9, TASK 3): worth
          reading once, by somebody who has asked how the strength was got. */}
      <Fold label="how these are read" tone={T.dim} style={{ marginTop: 2 }}
        summary={`Each region is read against its OWN monthly norm, never a fixed temperature.`}>
        <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 5, lineHeight: LH.body }}>
          +30°C is ordinary in Dallas in July and extreme in Odessa in April.
        </div>
      </Fold>
    </div>
  );
}

function NewsDrill({ ticker, newsItems = [] }) {
  const rows = newsItems.filter((n) => (n.impacts || []).some((im) => !ticker || im.tk === ticker)).slice(0, 8);
  if (!newsItems.length) return <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 6 }}>No headlines have loaded yet.</div>;
  if (!rows.length) return <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 6 }}>None of the {newsItems.length} headlines loaded is tagged as moving {ticker}.</div>;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {rows.map((n, i) => (
        <a key={i} href={n.link} target="_blank" rel="noreferrer"
          style={{ textDecoration: "none", display: "block", padding: "7px 9px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6 }}>
          <div style={{ color: T.ink, fontSize: FS.sm, fontWeight: FW.bold, lineHeight: LH.body }}>{n.title}</div>
          <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 2 }}>{n.src}{n.geo ? " · government or geopolitics, so it weighs more" : ""}</div>
          <ImpactTags item={n} />
        </a>
      ))}
      {/* Same rule, under the headlines (P9, TASK 3). */}
      <Fold label="how these are weighted" tone={T.dim} style={{ marginTop: 2 }}
        summary={`A headline five days old counts half.`}>
        <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 5, lineHeight: LH.body }}>
          Government and geopolitical items weigh more than market chatter because they move supply, not the
          session.
        </div>
      </Fold>
    </div>
  );
}

/**
 * @param defaultDetail  start with the four factor bars already open. The desk
 *   keeps them behind a tap because the panel sits under a page of numbers; the
 *   wizard's decision screen opens them, because there the bars ARE the reason
 *   the road is on the page at all.
 * @param style  the caller places the panel; it does not place itself.
 */
/* ================================================================
   THE WHY SHEET'S TOP (PR #46, TASK 3): one verdict line, an ⓘ beside the score and beside the confidence that
   opens "How these are worked out" ON TAP (never a title attribute), and one sentence on what this changes in Find.
   The long narrative goes behind "The full reasoning".
================================================================ */
export function HowWorkedOut({ fused }) {
  const sw = scoreWorking(fused), cw = confidenceWorking(fused);
  if (!sw || !cw) return null;
  return (
    <div id="how-worked-out" role="region" aria-label="How these are worked out"
      style={{ marginTop: 8, padding: "9px 11px", background: T.panel, border: `1px solid ${T.blue}66`, borderRadius: 8 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>How these are worked out</div>
      <div style={{ fontSize: FS.sm, color: T.body, marginTop: 6, lineHeight: LH.body }}><b>Score.</b> {sw.sentence}</div>
      <div style={{ fontSize: FS.sm, color: T.body, marginTop: 6, lineHeight: LH.body }}><b>Confidence.</b> {cw.sentence}</div>
      <div style={{ fontSize: FS.xs, color: T.mut, marginTop: 6, lineHeight: LH.body }}>{WEIGHTS_CHOSEN_LINE}</div>
    </div>
  );
}

export function WhySheetTop({ fused, how, onHow }) {
  const v = verdictLine(fused);
  if (!v) return null;
  const col = fused.agreement === "CONFLICT" ? T.amber : fused.score > 0 ? T.green : fused.score < 0 ? T.violet : T.mut;
  const info = (label) => (
    <button onClick={onHow} aria-expanded={!!how} aria-controls="how-worked-out" aria-label={`How the ${label} is worked out`}
      style={{ ...sans, fontSize: FS.md, color: T.blue, background: "transparent", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, padding: 0 }}>ⓘ</button>
  );
  const [counted, scorePart, confPart] = v.numbers.split(" · ");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...sans, fontSize: FS.lg, fontWeight: FW.bold, color: col }}>{v.arrow}</span>
        <span style={{ fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{v.words}</span>
      </div>
      <div style={{ ...mono, fontSize: FS.sm, color: T.body, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <span>{counted} · {scorePart}</span>{info("score")}<span>· {confPart}</span>{info("confidence")}
      </div>
      {how && <HowWorkedOut fused={fused} />}
      <div style={{ fontSize: FS.sm, color: T.body, marginTop: 8, lineHeight: LH.body }}>{whyFindEffect()}</div>
    </div>
  );
}

/* ================================================================
   THE SEASON ROW (PR #48, TASK 2): the months in the window this market is read over, each with its measured mean,
   its own uncertainty and how many years carry it — "Oct +1.2% ± 1.6% (16 yrs) · not a signal" or "· counts" — and
   what the chance is made of. Every line comes from `seasonalSignal()` (rules.js), the one home for the season.
================================================================ */
export function SeasonRow({ season }) {
  const lines = seasonRowLines(season);
  return (
    <div role="group" aria-label="Season" style={{ marginTop: 8, padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>
        Season{season && season.span ? ` · ${season.span} month${season.span === 1 ? "" : "s"} held` : ""}
        <span style={{ fontWeight: FW.regular, color: T.mut }}> · chance: {chanceBasisLabel({ seasonCounts: !!(season && season.counts) })}</span>
      </div>
      {lines.map((l) => <div key={l} style={{ ...mono, fontSize: FS.sm, color: T.body, marginTop: 3 }}>{l}</div>)}
    </div>
  );
}

/**
 * THE WHY SHEET (PR #46, TASK 3) — "<TK> this month", the market and not this trade. The verdict line with its
 * two ⓘ, the one sentence on what it changes in Find, the news line, and the long narrative behind "The full
 * reasoning" (the `WhyThisTrade` panel, unchanged, the autopilot sentence inside it).
 */
export function WhySheet({ fused, title, note, ticker, weatherData, newsItems, month, defaultDetail = false, order = "ev", style }) {
  const [how, setHow] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  if (!fused) return null;
  return (
      <div style={{ marginTop: 4, ...(style || {}) }}>
        <WhySheetTop fused={fused} how={how} onHow={() => setHow((h) => !h)} />
        <SeasonRow season={fused.season || null} />
        <div style={{ marginTop: 4 }}><NumbersFit order={order} /></div>
        <button onClick={() => setNewsOpen((o) => !o)}
          style={{ ...sans, fontSize: FS.xs, marginTop: 6, background: "transparent", color: T.body, border: "none", padding: "4px 0", cursor: "pointer", textAlign: "left", lineHeight: LH.body, minHeight: 44 }}>
          {newsLine(ticker, newsItems).text} {newsOpen ? "▲" : "▼"}
        </button>
        {newsOpen && <NewsDrill ticker={ticker} newsItems={newsItems} />}
        {/* THE LONG NARRATIVE, behind one tap. The autopilot sentence is inside it. */}
        <Fold summary="The full reasoning" label="why" tone={T.blue} style={{ marginTop: 8 }}>
          <WhyThisTrade fused={fused} title={title} note={note} ticker={ticker} weatherData={weatherData}
            newsItems={newsItems} month={month} defaultDetail={defaultDetail} style={{ marginTop: 0 }} />
        </Fold>
      </div>
  );
}

export function WhyThisTrade({ fused, title = "WHY THIS TRADE", note, ticker, weatherData, newsItems, month, defaultDetail = false, style }) {
  const [detail, setDetail] = useState(defaultDetail);
  const [open, setOpen] = useState(null); // key of the factor whose explanation is open
  const [newsOpen, setNewsOpen] = useState(false);
  const narrow = useNarrow();
  const ref = React.useRef(null);

  // Tap outside closes the open explanation. Mobile has no hover, so this is
  // the only way back out of it.
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!fused) return null;
  const st = AGREEMENT_STYLE[fused.agreement] || AGREEMENT_STYLE.MIXED;
  const scoreCol = fused.score > 0 ? T.green : fused.score < 0 ? T.violet : T.mut;

  return (
    <div ref={ref} style={{ marginTop: 10, padding: "11px 13px", background: `${st.c}0d`, border: `1px solid ${st.c}55`, borderRadius: 8, ...(style || {}) }}>
      {/* ---- always visible: verdict, the two numbers, the narrative ---- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Label>{title}</Label>
        <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.onAccent, background: st.c, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.08em" }}>
          {st.label}
        </span>
        <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{st.meaning}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <Stat k="SIGNAL SCORE" v={`${fused.score > 0 ? "+" : ""}${fused.score} / 100`} c={scoreCol} />
          <Stat k="CONFIDENCE" v={`${fused.confidence} / 100`} c={fused.confidence >= 70 ? T.green : fused.confidence < 40 ? T.amber : T.blue} />
        </span>
      </div>

      <div style={{ fontSize: FS.sm, color: T.body, marginTop: 7, lineHeight: LH.body }}>{fused.narrative}</div>
      {/* NEWS, ONE LINE (PR #40, TASK 2): direction, how many headlines are
          tagged, the newest one's title. Tap for the list. */}
      <button onClick={() => setNewsOpen((o) => !o)}
        style={{ ...sans, fontSize: FS.xs, marginTop: 6, background: "transparent", color: T.body, border: "none", padding: "4px 0", cursor: "pointer", textAlign: "left", lineHeight: LH.body, minHeight: 32 }}>
        {newsLine(ticker, newsItems).text} {newsOpen ? "▲" : "▼"}
      </button>
      {newsOpen && <NewsDrill ticker={ticker} newsItems={newsItems} />}
      {note && <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 5 }}>{note}</div>}

      {/* ---- behind a tap: the four components as direction + strength ---- */}
      {/* THE TOGGLE NAMES WHAT IT OPENS. "show detail" is a door with no sign
          on it: nobody found the four readings behind it, which are the whole
          reason this panel exists. The label is built from FACTOR_ORDER and
          FACTOR_LABEL, so it cannot drift from the bars it reveals. */}
      <button onClick={() => { setDetail((d) => !d); setOpen(null); }}
        style={{ ...sans, fontSize: FS.xs, marginTop: 8, background: "transparent", color: T.blue, border: `1px solid ${T.blue}55`, borderRadius: 5, padding: "4px 9px", cursor: "pointer", textAlign: "left", lineHeight: LH.body }}>
        {detail ? "Hide the four readings ▲" : `Show the four readings: ${FACTOR_LIST} ▼`}
      </button>

      {detail && (
        <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
          {FACTOR_ORDER.map((k) => {
            const cp = fused.components[k];
            // DOES NOT APPLY IS NOT A READING OF ZERO (src/signals.js,
            // `factorsOf`). Weather on a metal has no bar, no strength and no
            // arrow: drawing an empty 0/100 bar for it says the app looked and
            // found nothing, where the truth is that the question does not
            // arise — and it was not in the score either.
            const na = cp.applies === false;
            const col = na ? T.dim : cp.dir > 0 ? T.green : cp.dir < 0 ? T.violet : T.mut;
            const isOpen = open === k;
            // Weather and News carry their own evidence with them: the same tap
            // that explains the bar shows what the bar is made of.
            const drill = k === "weather" ? <WeatherDrill ticker={ticker} weatherData={weatherData} month={month} />
              : k === "news" ? <NewsDrill ticker={ticker} newsItems={newsItems} />
                : null;
            const explanation = (
              <div style={{
                ...(narrow || drill
                  ? { position: "static", marginTop: 6 }
                  : { position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 20, boxShadow: `0 6px 18px rgba(0,0,0,${T.dark ? 0.45 : 0.14})` }),
                background: T.panel, border: `1px solid ${col}66`, borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ fontSize: FS.xs, color: T.body, lineHeight: LH.body }}>{cp.why}</div>
                {drill}
                <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 4 }}>tap anywhere outside to close</div>
              </div>
            );
            return (
              <div key={k} style={{ position: "relative" }}>
                <button onClick={() => setOpen(isOpen ? null : k)}
                  style={{ width: "100%", textAlign: "left", background: isOpen ? `${col}14` : T.bg, border: `1px solid ${isOpen ? col : T.line}`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: col, width: 14 }}>{na ? "–" : ARROW[cp.dir]}</span>
                    <span style={{ ...sans, fontSize: FS.xs, color: na ? T.dim : T.ink, minWidth: 96 }}>{FACTOR_LABEL[k]}</span>
                    <span style={{ flex: 1, minWidth: 90, height: 7, background: T.line, borderRadius: 4, overflow: "hidden" }}>
                      {!na && <span style={{ display: "block", width: `${cp.strength}%`, height: "100%", background: col, borderRadius: 4 }} />}
                    </span>
                    <span style={{ ...mono, fontSize: FS.xs, color: T.dim, width: 52, textAlign: "right" }}>{na ? "n/a" : `${cp.strength}/100`}</span>
                    <span style={{ ...sans, fontSize: FS.xs, color: T.blue }}>{isOpen ? "▲" : na ? "why not?" : k === "weather" ? "regions?" : k === "news" ? "headlines?" : "why?"}</span>
                  </div>
                </button>
                {isOpen && explanation}
              </div>
            );
          })}
          {/* THE SCALE IS THE ONE THIS MARKET WAS SCORED ON. This sentence
              used to be typed out — "seasonality 30%, price trend 25%, weather
              25%, news 20%" — which is the right scale for a crop and the wrong
              one for a metal, where weather does not apply and the other three
              are renormalised over it. It is generated from `fused.weights`
              now, so it cannot describe a scale nothing was measured against. */}
          <div style={{ ...sans, fontSize: FS.xs, color: T.dim }}>
            Direction is the arrow, strength is the bar (0-100). The score above is {weightList(fused)}.
          </div>
        </div>
      )}
    </div>
  );
}

