// ============================================================================
// src/positionCard.jsx — THE POSITIONS CARD. (Its "Details" sheet became the position's own screen in redesign PR 3:
// src/positionScreen.jsx.)
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
import React, { createContext, useContext } from "react";
import { T, TYPE } from "./theme.js";
import { Info, Note, mono, sans, TAP, useBoxWidth } from "./ui.jsx";
import { PREVIEW, PREVIEW_READ_ONLY } from "./deploy.js";
import { signedMoney$ } from "./positionView.js";
import { CardButton } from "./positions.jsx";

// PR #48 SWEEP: the stacks, Btn and sizes are ui.jsx's and the type tokens. Mono only for numbers and the record's
// ref; labels, headings and sentences are sans. RED IS FOR ERRORS: a loss is violet, not an error.
const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

/** The badge: CLOSE filled in the action tone, WARNING an amber outline, HOLD a green outline, anything else dim. */
export function ActionBadge({ action, text = null }) {
  const word = text || action || "NO ACTION";
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
export function PositionCard(props) {
  // PR 73: on a computer the same card is a row of the Positions table (`row`, App.jsx's `panePos`): one model, two layouts.
  if (props.row) return <PositionRow {...props} />;
  return <PositionCardBody {...props} />;
}
function PositionCardBody({
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

/* =====================================================================================================================
   POSITIONS AS A TABLE, ON A COMPUTER (PR 73; owner 19 Oct 2026: "Positions = a table + the position's screen"). One row per
   holding, the SAME props as `PositionCard` — the same action, line, profit, exits and the one button — laid out across:
   status · the position · profit now · the three exits · the action. The table follows the width of its own pane: below
   `TABLE_FULL_MIN` the exits go under the position (one column fewer), so nothing ever scrolls sideways. A phone keeps the
   cards (App.jsx picks the table only beside a position's screen, `panePos`).
===================================================================================================================== */
// The full row's fixed columns (88 + 88 + 180 + 140), its four gaps and its padding, and 160px for the position itself.
export const TABLE_FULL_MIN = 724;
const TableWidth = createContext(TABLE_FULL_MIN);
const COLS = (full) => (full ? "88px minmax(160px, 1fr) 88px 180px 140px" : "92px minmax(0, 1fr) 96px");
const HEAD = { ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.06em", color: T.mut };
export function PositionsTable({ children, heads = ["STATUS", "POSITION", "PROFIT NOW", "EXITS", ""], initialWidth = TABLE_FULL_MIN }) {
  // `initialWidth` is the width before the pane is measured (a test renders both layouts with it).
  const [ref, w] = useBoxWidth(initialWidth);
  const full = w >= TABLE_FULL_MIN;
  return (
    <TableWidth.Provider value={w}>
      <div ref={ref} data-positions-table={full ? "full" : "compact"} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <div role="row" style={{ display: "grid", gridTemplateColumns: COLS(full), gap: 10, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
          {(full ? heads : heads.slice(0, 3)).map((h, i) => <span key={i} role="columnheader" style={{ ...HEAD, textAlign: i === 2 ? "right" : "left" }}>{h}</span>)}
        </div>
        <ul data-position-list style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ul>
      </div>
    </TableWidth.Provider>
  );
}
export function PositionRow({
  p, title, action, line, notes = [], pnl = null, shareText = null, meta = null, labels = [],
  closeLabel, closeDisabled = false, closeTitle, onClose, onDetails, fileKind = "held", onFile,
  demo = false, foot = null, children, current = false,
}) {
  const full = useContext(TableWidth) >= TABLE_FULL_MIN;
  const pnlKnown = pnl != null && Number.isFinite(Number(pnl));
  const fileOffered = fileKind === "gone" || fileKind === "book";
  const closeOffered = action === "CLOSE" && !!closeLabel;
  const buttons = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
      {!foot && (closeOffered ? (
        <CardButton tone="action" disabled={demo || PREVIEW || closeDisabled} title={PREVIEW ? PREVIEW_READ_ONLY : closeTitle} onClick={onClose}>{closeLabel}</CardButton>
      ) : action === "WARNING" ? (
        <CardButton tone="amber" onClick={onDetails} aria-haspopup="dialog">Decide ›</CardButton>
      ) : (
        <CardButton tone="quiet" onClick={onDetails} aria-haspopup="dialog">Details ›</CardButton>
      ))}
      {fileOffered && (
        <CardButton tone={fileKind === "gone" ? "amber" : "quiet"} onClick={onFile} disabled={PREVIEW} title={PREVIEW ? PREVIEW_READ_ONLY : undefined}>File in Journal</CardButton>
      )}
    </div>
  );
  return (
    <li aria-label={`${p.ref || p.ticker} ${title}`} data-position={p.id} data-position-row={current ? "current" : ""}
      style={{ borderTop: `1px solid ${T.line}`, background: current ? T.raise : "transparent" }}>
      <div role="row" style={{ display: "grid", gridTemplateColumns: COLS(full), gap: 10, alignItems: "start", padding: "12px 14px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
          <ActionBadge action={action} />
          {action === "HOLD" && line ? <Info iconOnly label="hold" style={{ marginLeft: 8 }}>{line}</Info> : null}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <button type="button" onClick={onDetails} data-position-open aria-haspopup="dialog"
            style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink, background: "transparent", border: "none",
              padding: 0, minHeight: 28, textAlign: "left", cursor: "pointer" }}>{title}</button>
          <span data-position-meta style={{ ...mono, fontSize: FS.xs, color: T.mut }}>{meta || p.ref || p.ticker}</span>
          {action !== "HOLD" && line && <span data-position-line style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>{line}</span>}
          {notes.map((n, i) => <span key={i} style={{ ...sans, fontSize: FS.sm, color: T.amber, lineHeight: LH.body }}>⚠ {n}</span>)}
          {!full && <ExitBars labels={labels} />}
          {!full && <div style={{ marginTop: 4 }}>{foot || buttons}</div>}
        </span>
        <span style={{ textAlign: "right" }}>
          <span data-position-pnl aria-label={pnlKnown ? `profit now ${signedMoney$(pnl)}` : "profit now not known"}
            style={{ ...mono, display: "block", fontSize: FS.lg, fontWeight: FW.bold, color: !pnlKnown ? T.dim : Number(pnl) >= 0 ? T.green : T.violet }}>
            {signedMoney$(pnl)}
          </span>
          <span data-position-share style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{shareText || (pnlKnown ? "" : "no price right now")}</span>
        </span>
        {full && <span style={{ minWidth: 0 }}><ExitBars labels={labels} /></span>}
        {full && <span style={{ minWidth: 0 }}>{foot || buttons}</span>}
      </div>
      {PREVIEW && (closeOffered || fileOffered) && <div style={{ padding: "0 14px 10px" }}><Note color={T.amber}>{PREVIEW_READ_ONLY}</Note></div>}
      {children && <div style={{ padding: "0 14px 12px" }}>{children}</div>}
    </li>
  );
}
