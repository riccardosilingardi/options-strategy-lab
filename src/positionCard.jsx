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
// Redesign PR 3 (the owner's board "Positions", 5 Oct 2026): the card is the board's — a badge, "J-0002 · UNG · 2
// puts", the title and the profit, the sentence, the three exits in short words over 4px bars, and ONE foot. The entry
// against now and the exit orders left the card for the position's own screen.
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
import { T, TYPE } from "./theme.js";
import { Info, Note, mono, sans, TAP } from "./ui.jsx";
import { PREVIEW, PREVIEW_READ_ONLY } from "./deploy.js";
import { Fold, EvidenceOverlay } from "./steps.jsx";
import { BandThumbnail } from "./visuals.jsx";
import { payoffBands } from "./visuals.jsx";
import { signedMoney$ } from "./positionView.js";
import { CardButton } from "./positions.jsx";

// PR #48 SWEEP: the stacks, Btn and sizes are ui.jsx's and the type tokens. Mono only for numbers and the record's
// ref; labels, headings and sentences are sans. RED IS FOR ERRORS: a loss is violet, not an error.
const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

/** One exit: its words and a bar. The bar is a picture of the words, never the only place a fact is. */
export function ProgressLine({ line, tone = T.blue, reachedTone = T.amber }) {
  // Reaching a take profit is good news and reaching the time exit or the stop is not: the caller names the colour.
  // Not reached-red (PR #47): a reached exit is a warning to act on, not an error.
  const color = line.state === "reached" ? reachedTone : line.state === "none" || line.state === "unknown" ? T.dim : tone;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...sans, fontSize: FS.sm, color: line.state === "reached" ? reachedTone : T.ink, lineHeight: LH.body }}>{line.text}</div>
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
  const th = { ...sans, fontSize: FS.xs, color: T.dim, fontWeight: FW.regular, textAlign: "right", padding: "2px 0 4px 10px" };
  const td = (c = T.ink) => ({ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: c, textAlign: "right", padding: "3px 0 3px 10px" });
  const lab = { ...sans, fontSize: FS.xs, color: T.dim, textAlign: "left", padding: "3px 0", fontWeight: FW.regular };
  return (
    <div style={{ marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <caption style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", color: T.amber, textAlign: "left", paddingBottom: 4 }}>AT ENTRY VS NOW</caption>
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
      {unitNote && <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 4 }}>{unitNote}</div>}
    </div>
  );
}

/** The badge: CLOSE filled in the action tone, WARNING an amber outline, HOLD a green outline, anything else dim. */
export function ActionBadge({ action }) {
  const word = action || "NO ACTION";
  const filled = action === "CLOSE";
  const ring = action === "WARNING" ? T.amber : action === "HOLD" ? T.green : null;
  return (
    <span data-badge style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", lineHeight: "22px", padding: "0 8px",
      borderRadius: 6, background: filled ? T.action : "transparent", color: filled ? T.onAccent : ring || T.dim,
      boxShadow: ring ? `inset 0 0 0 1.5px ${ring}` : action ? undefined : `inset 0 0 0 1px ${T.field}` }}>{word}</span>
  );
}

const BAR_TONE = { done: () => T.green, warn: () => T.amber, field: () => T.field };

/** The three exits in short words over 4px bars (`exitLabels()`); the bars are pictures of the words. */
export function ExitBars({ labels = [] }) {
  return (
    <div data-exit-bars style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, ...sans, fontSize: FS.xs, color: T.mut }}>
      {labels.map((l) => (
        <div key={l.id} data-exit={l.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span>{l.text}</span>
          <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: T.line, position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round((l.frac || 0) * 100)}%`,
              background: (BAR_TONE[l.tone] || BAR_TONE.field)() }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * THE CARD (redesign PR 3, the owner's board "Positions"). In this order: the badge and "J-0002 · UNG · 2 puts"; the
 * title (it opens the position's screen) and the profit with its share of the risk; the action's sentence (HOLD's is
 * behind its ⓘ); the three exits; then ONE foot: the working close's line and "Manage order" (`foot`), or "Close at
 * limit" when a rule says close, "Decide: close or keep ›" on a WARNING, a quiet "Details ›" otherwise — and
 * "File in Journal" when the holding is gone from Alpaca or was never at a broker (filing sends nothing).
 * `children` (the close confirm, the filing form) sit under the foot. The title is a 44px target whose negative margins
 * give the extra height back, so the row keeps the board's height.
 */
export function PositionCard({
  p, title, action, line, notes = [], pnl = null, shareText = null, meta = null, labels = [],
  closeLabel, closeDisabled = false, closeTitle, onClose, onDetails, fileKind = "held", onFile,
  demo = false, foot = null, children,
}) {
  const pnlKnown = pnl != null && Number.isFinite(Number(pnl));
  const fileOffered = fileKind === "gone" || fileKind === "book";
  const closeOffered = action === "CLOSE" && !!closeLabel;
  return (
    <li aria-label={`${p.ref || p.ticker} ${title}`} data-position={p.id}
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px", display: "flex",
        flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <ActionBadge action={action} />
          {/* HOLD SAYS IT ALL AT REST (PR #47, TASK 3): its "nothing to do" sentence is one tap away. */}
          {action === "HOLD" && line ? <Info iconOnly label="hold" style={{ marginLeft: 12 }}>{line}</Info> : null}
        </span>
        <span data-position-meta style={{ ...mono, fontSize: FS.xs, color: T.mut, textAlign: "right" }}>{meta || p.ref || p.ticker}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, minWidth: 0 }}>
          <button type="button" onClick={onDetails} data-position-open aria-haspopup="dialog"
            style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink, background: "transparent", border: "none",
              padding: 0, marginTop: -12, marginBottom: -12, minHeight: TAP, textAlign: "left", cursor: "pointer" }}>{title}</button>
        </h3>
        <span style={{ textAlign: "right", flex: "none" }}>
          <span data-position-pnl aria-label={pnlKnown ? `profit now ${signedMoney$(pnl)}` : "profit now not known"}
            style={{ ...mono, fontSize: FS.lg, fontWeight: FW.bold, color: !pnlKnown ? T.dim : Number(pnl) >= 0 ? T.green : T.violet }}>
            {signedMoney$(pnl)}
          </span>
          <br />
          <span data-position-share style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{shareText || (pnlKnown ? "" : "no price right now")}</span>
        </span>
      </div>
      {action !== "HOLD" && line && <p data-position-line style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>{line}</p>}
      {notes.map((n, i) => (
        <p key={i} style={{ ...sans, margin: 0, fontSize: FS.sm, color: T.amber, lineHeight: LH.body }}>⚠ {n}</p>
      ))}
      <ExitBars labels={labels} />
      <div data-card-foot style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
        {foot}
        {(!foot || fileOffered) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!foot && (closeOffered ? (
              <CardButton tone="action" style={{ flex: 1 }} disabled={demo || PREVIEW || closeDisabled}
                title={PREVIEW ? PREVIEW_READ_ONLY : closeTitle} onClick={onClose}>{closeLabel}</CardButton>
            ) : action === "WARNING" ? (
              <CardButton tone="amber" style={{ flex: 1 }} onClick={onDetails} aria-haspopup="dialog">Decide: close or keep ›</CardButton>
            ) : (
              <CardButton tone="quiet" onClick={onDetails} aria-haspopup="dialog">Details ›</CardButton>
            ))}
            {fileOffered && (
              <CardButton tone={fileKind === "gone" ? "amber" : "quiet"} onClick={onFile}
                disabled={PREVIEW} title={PREVIEW ? PREVIEW_READ_ONLY : undefined}>File in Journal</CardButton>
            )}
          </div>
        )}
        {/* A DEPLOY PREVIEW IS READ-ONLY (redesign PR 2, TASK 0a): Close and File in Journal say why they are down. */}
        {PREVIEW && (closeOffered || fileOffered) && <Note color={T.amber}>{PREVIEW_READ_ONLY}</Note>}
      </div>
      {children}
    </li>
  );
}

const Row = ({ k, children }) => (
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
    <div style={{ ...sans, fontSize: FS.xs, color: T.dim, width: 110, flexShrink: 0 }}>{k}</div>
    <div style={{ flex: 1, minWidth: 150, ...mono, fontSize: FS.sm, color: T.ink, lineHeight: LH.body }}>{children}</div>
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
  edgeNote = null, pnlNote = null, onAnalyse, fileKind = "held", onFile, guardian = null,
}) {
  const bands = payoffBands({ legs: p.legs, entryNet: p.entryNet, spot: spotNow ?? p.entrySpot });
  return (
    <EvidenceOverlay eyebrow="DETAILS" title={`${p.ref ? `${p.ref} · ` : ""}${p.ticker} · ${title}`} onClose={onClose}>
      {stageNote && <div style={{ ...sans, fontSize: FS.sm, color: T.amber, lineHeight: LH.body, marginBottom: 8 }}>⚠ {stageNote}</div>}
      <Row k="LEGS">{legsText}</Row>
      <Row k="EXPIRES">{expiresText}</Row>
      <Row k="OPENED">{openedText}</Row>
      <Row k="ENTRY PRICE">{entryText}</Row>
      {fillSentence && <div style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body, marginTop: 6 }}>{fillSentence}</div>}
      <Row k="PROFIT NOW">
        <span style={{ fontWeight: FW.bold, color: pnl == null ? T.dim : Number(pnl) >= 0 ? T.green : T.violet }}>{signedMoney$(pnl)}</span>
        {shareText ? ` · ${shareText}` : ""}
      </Row>
      {pnlNote && <div style={{ ...sans, fontSize: FS.sm, color: T.dim, lineHeight: LH.body, marginTop: 4 }}>{pnlNote}</div>}
      {edgeNote && <div style={{ ...sans, fontSize: FS.sm, color: T.amber, lineHeight: LH.body, marginTop: 4 }}>⚠ {edgeNote}</div>}
      <EntryVsNow ev={ev} unitNote={unitNote} />
      <div style={{ marginTop: 14 }}>
        <div style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", color: T.amber }}>WHERE IT MAKES AND LOSES MONEY</div>
        <div style={{ marginTop: 6 }}>
          <BandThumbnail bands={bands} bars={bars} spot={spotNow ?? undefined} entrySpot={p.entrySpot ?? null} width={320} height={120}
            title={`Payoff zones. The price now ${spotNow != null ? `$${Number(spotNow).toFixed(2)}` : "is not known"}${p.entrySpot != null ? `, at entry $${Number(p.entrySpot).toFixed(2)}` : ""}.`} />
        </div>
        <div style={{ ...mono, fontSize: FS.xs, color: T.mut, marginTop: 4 }}>
          now {spotNow != null ? `$${Number(spotNow).toFixed(2)}` : "—"} · at entry {p.entrySpot != null ? `$${Number(p.entrySpot).toFixed(2)}` : "—"}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", color: T.amber }}>THE EXIT PLAN</div>
        <div style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, lineHeight: LH.body, marginTop: 4 }}>{planSentence}</div>
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body, marginTop: 4 }}>{planDetail}</div>
      </div>
      {timeline.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", color: T.amber }}>TIMELINE · {timeline.length}</div>
          {timeline.map((x, i) => (
            <div key={x.seq || i} style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 4 }}>
              <span style={{ color: T.blue }}>{x.seq || `${p.ref || ""}·??`}</span>
              <span style={{ color: T.dim }}>{` ${new Date(x.t).toLocaleDateString("en-GB")} · `}</span>
              {x.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <button onClick={onAnalyse}
          style={{ ...sans, fontSize: FS.md, color: T.blue, background: "transparent", border: "none", padding: "10px 0", minHeight: 44,
            cursor: "pointer", textDecoration: "underline" }}>Analyse as a new trade</button>
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Build prices it at today's market. A Send there would open a second position.</div>
        {fileKind === "unknown" && (
          <button onClick={onFile} disabled={PREVIEW} title={PREVIEW ? PREVIEW_READ_ONLY : undefined}
            style={{ ...sans, fontSize: FS.sm, color: T.mut, background: "transparent", border: "none", padding: "10px 0", minHeight: 44,
              cursor: "pointer", textDecoration: "underline" }}>Closed it elsewhere? File it</button>
        )}
      </div>
      {/* THE EXIT ORDERS AND THE REASON CHECK (the Guardian), folded at the end: it left the card (redesign PR 3). */}
      {guardian && (
        <Fold label="open" tone={T.ink} keepMounted style={{ marginTop: 8 }} summary="Exit orders · the reason check">{guardian}</Fold>
      )}
    </EvidenceOverlay>
  );
}

