// ============================================================================
// src/positionCard.jsx — THE POSITIONS CARD, AND THE SHEET BEHIND ITS "Details".
//
// PR #44, TASKS 1 and 2. Measured on the owner's phone, 2 Oct 2026: J-0001's
// card read HOLD with no P&L; the +$2,925 was only in the broker panel below it,
// which repeated a paragraph per holding telling him to use "Close at limit" —
// a button hidden, while the action was HOLD, inside a fold. The one red button
// in view, "Close and file", sent no order: it files the Journal.
//
// So the card says, in this order: the ACTION, the PROFIT (in dollars and as a
// share of the risk), how far each of the three EXITS is, the entry set beside
// now, and then the buttons — with "Close at limit" always among them.
//
// IT COMPUTES NOTHING. Every figure arrives worked out (`positionView.js`, and
// the profit `posAlerts` already read). Order path 3 is not here: the buttons
// call what the App hands them (`prepareCardClose`, `CloseConfirm`).
//
// ACCESSIBILITY (WCAG 2.1 AA, PR #44 TASK 7): every control is 44px tall; no text
// is under 12px; numbers, tickers and symbols are in the mono stack and sentences
// in the sans stack; the details toggle is a real dialog button; the progress bars
// are decoration and carry no meaning that the text beside them does not.
// ============================================================================
import React from "react";
import { T } from "./theme.js";
import { Info } from "./ui.jsx";
import { Btn } from "./pro.jsx";
import { Fold, EvidenceOverlay } from "./steps.jsx";
import { BandThumbnail } from "./visuals.jsx";
import { payoffBands } from "./visuals.jsx";
import { signedMoney$ } from "./positionView.js";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sans = { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };

// RED IS FOR ERRORS AND REFUSALS (PR #47, TASK 3): CLOSE is an action, so it takes the action tone.
const toneOf = (action) => (action === "CLOSE" ? T.action : action === "WARNING" ? T.amber : action === "HOLD" ? T.green : T.dim);

/** One exit: its words and a bar. The bar is a picture of the words, never the only place a fact is. */
export function ProgressLine({ line, tone = T.blue, reachedTone = T.amber }) {
  // Reaching a take profit is good news and reaching the time exit or the stop is not: the caller names the colour.
  // Not reached-red (PR #47): a reached exit is a warning to act on, not an error.
  const color = line.state === "reached" ? reachedTone : line.state === "none" || line.state === "unknown" ? T.dim : tone;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...mono, fontSize: 13, color: line.state === "reached" ? reachedTone : T.ink, lineHeight: 1.4 }}>{line.text}</div>
      <div aria-hidden="true" style={{ height: 6, background: T.line, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.round((line.frac || 0) * 100)}%`, height: 6, background: color }} />
      </div>
    </div>
  );
}

/**
 * THE FIND CARD'S FOUR FIGURES, IN ITS ORDER AND UNDER ITS LABELS — at entry, then now — and the four factors.
 * A cell the record cannot answer is a dash, never a zero. `now` is what is LEFT from here (what the position can
 * still make and still lose), which is the one reading of "now" the rules already have (`remainingEdge()`).
 */
export function EntryVsNow({ ev, unitNote = null }) {
  if (!ev) return null;
  const th = { ...mono, fontSize: 12, color: T.dim, fontWeight: 400, textAlign: "right", padding: "2px 0 4px 10px" };
  const td = (c = T.ink) => ({ ...mono, fontSize: 14, fontWeight: 700, color: c, textAlign: "right", padding: "3px 0 3px 10px" });
  const lab = { ...mono, fontSize: 12, color: T.dim, textAlign: "left", padding: "3px 0", fontWeight: 400 };
  return (
    <div style={{ marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <caption style={{ ...mono, fontSize: 12, letterSpacing: "0.04em", color: T.amber, textAlign: "left", paddingBottom: 4 }}>AT ENTRY VS NOW</caption>
        <thead>
          <tr><th scope="col" style={{ ...th, textAlign: "left" }}><span style={{ position: "absolute", left: -9999 }}>Figure</span></th>
            <th scope="col" style={th}>AT ENTRY</th><th scope="col" style={th}>NOW</th></tr>
        </thead>
        <tbody>
          {ev.figures.map((r) => (
            <tr key={r.k}><th scope="row" style={lab}>{r.k}</th><td style={td()}>{r.entry}</td><td style={td()}>{r.now}</td></tr>
          ))}
          {ev.factors.map((r) => (
            <tr key={r.k}><th scope="row" style={lab}>{r.label}</th><td style={td(T.mut)}>{r.entry}</td><td style={td(T.mut)}>{r.now}</td></tr>
          ))}
        </tbody>
      </table>
      {unitNote && <div style={{ ...sans, fontSize: 12, color: T.mut, lineHeight: 1.5, marginTop: 4 }}>{unitNote}</div>}
    </div>
  );
}

/**
 * THE CARD. `Close at limit` is always here: the primary button when a rule says close, a quiet one otherwise —
 * never red unless the action is CLOSE. `File in Journal` appears only when the holding is gone from Alpaca (or the
 * position was never at a broker); filing is not a close and sends nothing.
 */
export function PositionCard({
  p, title, action, line, notes = [], pnl = null, shareText = null, progress, ev, unitNote = null,
  closeLabel, closeDisabled = false, closeTitle, onClose, onDetails, fileKind = "held", onFile,
  demo = false, children, guardian = null,
}) {
  const tone = toneOf(action);
  const closePrimary = action === "CLOSE";
  const pnlKnown = pnl != null && Number.isFinite(Number(pnl));
  return (
    <article aria-label={`${p.ref || p.ticker} ${title}`} data-position={p.id}
      style={{ padding: "12px 14px", background: T.bg, border: `1px solid ${T.field}`, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px" }}>
        <div style={{ ...mono, fontSize: 24, fontWeight: 800, color: tone, letterSpacing: 0.5, lineHeight: 1.15 }}>
          {action || "NO ACTION"}
          {/* HOLD SAYS IT ALL AT REST (PR #47, TASK 3): its "nothing to do" sentence is one tap away. */}
          {action === "HOLD" && line ? <Info label="hold">{line}</Info> : null}
        </div>
        <h3 style={{ ...sans, fontSize: 14, fontWeight: 700, color: T.ink, margin: 0 }}>
          {p.ref && <span style={{ ...mono, fontSize: 12, color: T.dim, fontWeight: 400, marginRight: 6 }}>{p.ref}</span>}
          <span style={mono}>{p.ticker}</span> · {title}
        </h3>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0 10px", marginTop: 4 }}>
        <span aria-label={pnlKnown ? `profit now ${signedMoney$(pnl)}` : "profit now not known"}
          style={{ ...mono, fontSize: 26, fontWeight: 800, color: !pnlKnown ? T.dim : Number(pnl) >= 0 ? T.green : T.red }}>
          {signedMoney$(pnl)}
        </span>
        <span style={{ ...mono, fontSize: 13, color: T.mut }}>{shareText || (pnlKnown ? "" : "no price right now")}</span>
      </div>
      {action !== "HOLD" && <div style={{ ...sans, fontSize: 14, color: T.ink, lineHeight: 1.45, marginTop: 4 }}>{line}</div>}
      {notes.map((n, i) => (
        <div key={i} style={{ ...sans, fontSize: 12.5, color: T.amber, marginTop: 4, lineHeight: 1.5 }}>⚠ {n}</div>
      ))}
      <ProgressLine line={progress.time} />
      <ProgressLine line={progress.takeProfit} tone={T.green} reachedTone={T.green} />
      <ProgressLine line={progress.stop} tone={T.amber} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        {/* NO SECOND CLOSE WHILE ONE IS WORKING (PR #47, TASK 1): the caller passes no label, and the card shows
            the working close's line and "Manage order" instead of a disabled button. */}
        {closeLabel && (
          <Btn color={closePrimary ? T.action : T.ink} ghost={!closePrimary} disabled={demo || closeDisabled} title={closeTitle} onClick={onClose}>
            {closeLabel}
          </Btn>
        )}
        <Btn ghost color={T.blue} onClick={onDetails} aria-haspopup="dialog">Details</Btn>
        {(fileKind === "gone" || fileKind === "book") && (
          <Btn ghost={fileKind !== "gone"} color={fileKind === "gone" ? T.amber : T.ink} onClick={onFile}>File in Journal</Btn>
        )}
      </div>
      {children}
      {/* ONE FOLD (PR #47, TASK 3): the entry set beside now (also on Details) and the reason check / exit orders. */}
      <Fold label="open" tone={T.ink} keepMounted style={{ marginTop: 8 }} summary="Entry vs now · exit orders">
        <EntryVsNow ev={ev} unitNote={unitNote} />
        {guardian}
      </Fold>
    </article>
  );
}

const Row = ({ k, children }) => (
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
    <div style={{ ...mono, fontSize: 12, color: T.dim, width: 110, flexShrink: 0 }}>{k}</div>
    <div style={{ flex: 1, minWidth: 150, ...mono, fontSize: 13, color: T.ink, lineHeight: 1.5 }}>{children}</div>
  </div>
);

/**
 * THE SHEET BEHIND "Details": the position, read-only. The record, the entry, what it is worth now, the picture,
 * the exit plan and the timeline. The one way out of it that leads to a trade is a quiet link to Build, and it says
 * what a Send there would do. Nothing in it sends anything.
 */
export function PositionDetails({
  p, title, onClose, legsText, expiresText, openedText, entryText, fillSentence = null, pnl = null, shareText = null,
  ev, unitNote = null, spotNow = null, bars = [], planSentence, planDetail, timeline = [], stageNote = null,
  edgeNote = null, pnlNote = null, onAnalyse, fileKind = "held", onFile,
}) {
  const bands = payoffBands({ legs: p.legs, entryNet: p.entryNet, spot: spotNow ?? p.entrySpot });
  return (
    <EvidenceOverlay eyebrow="DETAILS" title={`${p.ref ? `${p.ref} · ` : ""}${p.ticker} · ${title}`} onClose={onClose}>
      {stageNote && <div style={{ ...sans, fontSize: 13, color: T.amber, lineHeight: 1.5, marginBottom: 8 }}>⚠ {stageNote}</div>}
      <Row k="LEGS">{legsText}</Row>
      <Row k="EXPIRES">{expiresText}</Row>
      <Row k="OPENED">{openedText}</Row>
      <Row k="ENTRY PRICE">{entryText}</Row>
      {fillSentence && <div style={{ ...sans, fontSize: 13, color: T.mut, lineHeight: 1.5, marginTop: 6 }}>{fillSentence}</div>}
      <Row k="PROFIT NOW">
        <span style={{ fontWeight: 800, color: pnl == null ? T.dim : Number(pnl) >= 0 ? T.green : T.red }}>{signedMoney$(pnl)}</span>
        {shareText ? ` · ${shareText}` : ""}
      </Row>
      {pnlNote && <div style={{ ...sans, fontSize: 12.5, color: T.dim, lineHeight: 1.5, marginTop: 4 }}>{pnlNote}</div>}
      {edgeNote && <div style={{ ...sans, fontSize: 12.5, color: T.amber, lineHeight: 1.5, marginTop: 4 }}>⚠ {edgeNote}</div>}
      <EntryVsNow ev={ev} unitNote={unitNote} />
      <div style={{ marginTop: 14 }}>
        <div style={{ ...mono, fontSize: 12, letterSpacing: "0.04em", color: T.amber }}>WHERE IT MAKES AND LOSES MONEY</div>
        <div style={{ marginTop: 6 }}>
          <BandThumbnail bands={bands} bars={bars} spot={spotNow ?? undefined} entrySpot={p.entrySpot ?? null} width={320} height={120}
            title={`Payoff zones. The price now ${spotNow != null ? `$${Number(spotNow).toFixed(2)}` : "is not known"}${p.entrySpot != null ? `, at entry $${Number(p.entrySpot).toFixed(2)}` : ""}.`} />
        </div>
        <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 4 }}>
          now {spotNow != null ? `$${Number(spotNow).toFixed(2)}` : "—"} · at entry {p.entrySpot != null ? `$${Number(p.entrySpot).toFixed(2)}` : "—"}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ ...mono, fontSize: 12, letterSpacing: "0.04em", color: T.amber }}>THE EXIT PLAN</div>
        <div style={{ ...sans, fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.45, marginTop: 4 }}>{planSentence}</div>
        <div style={{ ...sans, fontSize: 13, color: T.mut, lineHeight: 1.5, marginTop: 4 }}>{planDetail}</div>
      </div>
      {timeline.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...mono, fontSize: 12, letterSpacing: "0.04em", color: T.amber }}>TIMELINE · {timeline.length}</div>
          {timeline.map((x, i) => (
            <div key={x.seq || i} style={{ ...mono, fontSize: 12, color: T.mut, lineHeight: 1.5, marginTop: 4 }}>
              <span style={{ color: T.blue }}>{x.seq || `${p.ref || ""}·??`}</span>
              <span style={{ color: T.dim }}>{` ${new Date(x.t).toLocaleDateString("en-GB")} · `}</span>
              {x.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <button onClick={onAnalyse}
          style={{ ...sans, fontSize: 14, color: T.blue, background: "transparent", border: "none", padding: "10px 0", minHeight: 44,
            cursor: "pointer", textDecoration: "underline" }}>Analyse as a new trade</button>
        <div style={{ ...sans, fontSize: 12.5, color: T.mut }}>Build prices it at today's market. A Send there would open a second position.</div>
        {fileKind === "unknown" && (
          <button onClick={onFile}
            style={{ ...sans, fontSize: 13, color: T.mut, background: "transparent", border: "none", padding: "10px 0", minHeight: 44,
              cursor: "pointer", textDecoration: "underline" }}>Closed it elsewhere? File it</button>
        )}
      </div>
    </EvidenceOverlay>
  );
}

