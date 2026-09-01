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
import { T } from "./theme.js";
import { ARROW, regionSignals } from "./signals.js";
import { useNarrow } from "./visuals.jsx";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const Lbl = ({ children }) => <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>{children}</div>;
const Stat = ({ k, v, c }) => (
  <div>
    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{k}</div>
    <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: c || T.ink }}>{v}</div>
  </div>
);

/* ================================================================
   The tags under a headline: which tickers it moves, and which way.
   Directions are NUMBERS (1 / 0 / -1) everywhere; ARROW turns them into
   something readable exactly once, here.
================================================================ */
export const ImpactTags = ({ item }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
    {item.geo && <span style={{ ...mono, fontSize: 9, color: T.violet, border: `1px solid ${T.violet}55`, padding: "2px 6px", borderRadius: 4 }}>GEO/GOV</span>}
    {item.analysis && <span style={{ ...mono, fontSize: 9, color: T.blue, border: `1px solid ${T.blue}55`, padding: "2px 6px", borderRadius: 4 }}>ANALYSIS</span>}
    {(item.impacts || []).length === 0 && <span style={{ ...mono, fontSize: 9, color: T.dim, border: `1px solid ${T.line}`, padding: "2px 6px", borderRadius: 4 }}>general market</span>}
    {(item.impacts || []).map((im) => {
      const c = im.dir > 0 ? T.green : im.dir < 0 ? T.red : T.mut;
      return (
        <span key={im.tk} title={im.why} style={{ ...mono, fontSize: 9, color: c, border: `1px solid ${c}55`, padding: "2px 6px", borderRadius: 4, cursor: "help" }}>
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
  CONFLICT: { c: T.red, label: "CONFLICT", meaning: "the factors contradict each other" },
};
const FACTOR_LABEL = { seasonal: "Seasonality", technical: "Price trend", weather: "Weather", news: "News flow" };
const FACTOR_ORDER = ["seasonal", "technical", "weather", "news"];

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
  if (!weatherData) return <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>The forecast has not loaded yet.</div>;
  if (!rows.length) return <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>No region watched for {ticker} has a usable forecast right now.</div>;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {rows.map((r, i) => {
        const c = r.numDir > 0 ? T.green : r.numDir < 0 ? T.red : T.mut;
        return (
          <div key={i} style={{ padding: "7px 9px", background: T.bg, border: `1px solid ${c}44`, borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: c }}>{r.dir}</span>
              <span style={{ ...mono, fontSize: 11, color: T.ink }}>{r.region}</span>
              <span style={{ ...mono, fontSize: 9.5, color: T.dim }}>{r.tks.join(" · ")} · {r.strength}</span>
            </div>
            <div style={{ fontSize: 12, color: T.body, marginTop: 3, lineHeight: 1.45 }}>{r.why}</div>
          </div>
        );
      })}
      <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
        Each region is read against its OWN monthly norm, never a fixed temperature: +30°C is ordinary in Dallas in July and extreme in Odessa in April.
      </div>
    </div>
  );
}

function NewsDrill({ ticker, newsItems = [] }) {
  const rows = newsItems.filter((n) => (n.impacts || []).some((im) => !ticker || im.tk === ticker)).slice(0, 8);
  if (!newsItems.length) return <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>No headlines have loaded yet.</div>;
  if (!rows.length) return <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>None of the {newsItems.length} headlines loaded is tagged as moving {ticker}.</div>;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {rows.map((n, i) => (
        <a key={i} href={n.link} target="_blank" rel="noreferrer"
          style={{ textDecoration: "none", display: "block", padding: "7px 9px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6 }}>
          <div style={{ color: T.ink, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{n.title}</div>
          <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 2 }}>{n.src}{n.geo ? " · government or geopolitics, so it weighs more" : ""}</div>
          <ImpactTags item={n} />
        </a>
      ))}
      <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
        A headline five days old counts half. Government and geopolitical items weigh more than market chatter because they move supply, not the session.
      </div>
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
export function WhyThisTrade({ fused, title = "WHY THIS TRADE", note, ticker, weatherData, newsItems, month, defaultDetail = false, style }) {
  const [detail, setDetail] = useState(defaultDetail);
  const [open, setOpen] = useState(null); // key of the factor whose explanation is open
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
  const scoreCol = fused.score > 0 ? T.green : fused.score < 0 ? T.red : T.mut;

  return (
    <div ref={ref} style={{ marginTop: 10, padding: "11px 13px", background: `${st.c}0d`, border: `1px solid ${st.c}55`, borderRadius: 8, ...(style || {}) }}>
      {/* ---- always visible: verdict, the two numbers, the narrative ---- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Lbl>{title}</Lbl>
        <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: T.onAccent, background: st.c, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.08em" }}>
          {st.label}
        </span>
        <span style={{ ...mono, fontSize: 11, color: T.mut }}>{st.meaning}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <Stat k="SIGNAL SCORE" v={`${fused.score > 0 ? "+" : ""}${fused.score} / 100`} c={scoreCol} />
          <Stat k="CONFIDENCE" v={`${fused.confidence} / 100`} c={fused.confidence >= 70 ? T.green : fused.confidence < 40 ? T.red : T.amber} />
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: T.body, marginTop: 7, lineHeight: 1.5 }}>{fused.narrative}</div>
      {note && <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 5 }}>{note}</div>}

      {/* ---- behind a tap: the four components as direction + strength ---- */}
      <button onClick={() => { setDetail((d) => !d); setOpen(null); }}
        style={{ ...mono, fontSize: 10.5, marginTop: 8, background: "transparent", color: T.blue, border: `1px solid ${T.blue}55`, borderRadius: 5, padding: "4px 9px", cursor: "pointer" }}>
        {detail ? "hide detail ▲" : "show detail ▼"}
      </button>

      {detail && (
        <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
          {FACTOR_ORDER.map((k) => {
            const cp = fused.components[k];
            const col = cp.dir > 0 ? T.green : cp.dir < 0 ? T.red : T.mut;
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
                <div style={{ fontSize: 12, color: T.body, lineHeight: 1.5 }}>{cp.why}</div>
                {drill}
                <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 4 }}>tap anywhere outside to close</div>
              </div>
            );
            return (
              <div key={k} style={{ position: "relative" }}>
                <button onClick={() => setOpen(isOpen ? null : k)}
                  style={{ width: "100%", textAlign: "left", background: isOpen ? `${col}14` : T.bg, border: `1px solid ${isOpen ? col : T.line}`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: col, width: 14 }}>{ARROW[cp.dir]}</span>
                    <span style={{ ...mono, fontSize: 11, color: T.ink, minWidth: 96 }}>{FACTOR_LABEL[k]}</span>
                    <span style={{ flex: 1, minWidth: 90, height: 7, background: T.line, borderRadius: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${cp.strength}%`, height: "100%", background: col, borderRadius: 4 }} />
                    </span>
                    <span style={{ ...mono, fontSize: 10.5, color: T.dim, width: 52, textAlign: "right" }}>{cp.strength}/100</span>
                    <span style={{ ...mono, fontSize: 10, color: T.blue }}>{isOpen ? "▲" : k === "weather" ? "regions?" : k === "news" ? "headlines?" : "why?"}</span>
                  </div>
                </button>
                {isOpen && explanation}
              </div>
            );
          })}
          <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
            Direction is the arrow, strength is the bar (0-100). The score above is these four weighted together: seasonality 30%, price trend 25%, weather 25%, news 20%.
          </div>
        </div>
      )}
    </div>
  );
}

