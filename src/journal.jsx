// ============================================================================
// src/journal.jsx — THE JOURNAL (redesign PR 3b; the owner's board "Journal", 6 Oct 2026).
//
// In the board's order: the header ("Journal"; no desk header), THE RECORD (level, rule closes, awareness, what is
// next; "inside the limit" and what discipline means behind its ⓘ), "Find a trade", OPEN (every trade still open or
// still an order, each opening on the reason it was opened and its whole timeline), CLOSED TRADES with their net
// (each opening on why it ended, the reason it was opened, the per-trade reading and both order ids in full), and
// "Refs only go up". Then, folded (owner, 6 Oct 2026: "Below, in order"): the report, the copilot's analyses, and
// the entry floor's log — handed in as nodes, unchanged.
//
// IT COMPUTES NOTHING. Every figure is the record's own (`journalPnl()`, `journalPnlTotal()`), the open trades' the
// Positions card's (`positionModels`); every sentence is journalView.js's or journal.js's. Nothing here sends or files.
// ============================================================================
import React, { useState } from "react";
import { T, TYPE } from "./theme.js";
import { Info, Fold, mono, sans, TAP } from "./ui.jsx";
import { matchesRef, journalPnl, riskOkWords, riskOkOf, isTestRecord, testRecordNote, autopilotHorizonNote,
  autopilotVolNote } from "./journal.js";
import { seasonalStampNote } from "./rules.js";
import { pnlWords, timelineItems, entriesWords, whyOpenedLine, openedDetailLine, endedLine, closedState, closedTitle,
  netNote, openState } from "./journalView.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const PANEL = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12 };
const H2 = { ...sans, margin: 0, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, lineHeight: LH.tight };
const pnlTone = (x) => (x == null || !Number.isFinite(Number(x)) ? T.mut : Number(x) >= 0 ? T.green : T.violet);

/** One entry's timeline, every line of it ("ALL OF THEM"), with an autopilot entry's own warnings. */
function Timeline({ timeline = [] }) {
  const items = timelineItems(timeline);
  if (!items.length) return null;
  return (
    <>
      <div style={H2}>{`TIMELINE · ${items.length} ${items.length === 1 ? "ENTRY, THE ONLY ONE" : "ENTRIES, ALL OF THEM"}`}</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((t) => {
          const notes = [autopilotHorizonNote(t.raw), autopilotVolNote(t.raw)].filter(Boolean);
          return (
            <li key={t.key} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 8, ...sans, fontSize: FS.xs, lineHeight: LH.body, color: T.ink }}>
              <span style={{ ...mono, color: T.mut }}>{t.seq}</span>
              <span>
                {t.when && <span style={{ ...mono, color: T.mut }}>{t.when}</span>}{t.when ? " · " : ""}{t.what}
                {t.order && <><br /><span style={{ ...mono, color: T.dim, wordBreak: "break-all" }}>order {t.order}</span></>}
                {notes.map((n) => <span key={n} style={{ display: "block", color: T.amber }}>{`⚠ ${n}`}</span>)}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** One row: ref, ticker · name, the line under it, the figure and the state; the button opens it. */
function Entry({ row, open, onToggle, children }) {
  return (
    <li data-journal-entry={row.ref || row.key} style={{ borderTop: `1px solid ${T.line}` }}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{ ...sans, width: "100%", border: "none", background: "transparent", textAlign: "left", padding: "10px 0", minHeight: TAP,
          display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) auto", gap: 8, alignItems: "baseline", color: T.ink, cursor: "pointer" }}>
        <span style={{ ...mono, fontSize: FS.sm, fontWeight: FW.bold }}>{row.ref || "—"}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span data-entry-name style={{ fontSize: FS.sm, fontWeight: FW.bold, lineHeight: LH.tight }}><span style={mono}>{row.ticker}</span> · {row.name}</span>
          <span data-entry-sub style={{ fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>{row.sub}</span>
        </span>
        <span style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2 }}>
          <span data-entry-pnl style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: pnlTone(row.pnl) }}>
            {pnlWords(row.pnl)}{row.pnlNote ? <span style={{ fontSize: FS.xs, fontWeight: FW.regular }}>{` ${row.pnlNote}`}</span> : null}
          </span>
          <span data-entry-state style={{ fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", color: row.warn ? T.amber : T.mut }}>{row.state}</span>
        </span>
      </button>
      {open && <div data-entry-body style={{ padding: "0 0 12px", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </li>
  );
}

const Para = ({ head, children, color = T.body }) => (
  <p style={{ ...sans, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color }}>
    {head && <b style={{ letterSpacing: "0.04em" }}>{head}</b>}{children}
  </p>
);

/**
 * @param v { journey, insideLimit, open: [{ p, m, stage }], closed (searched, newest ref first), allClosed, query, onQuery,
 *            openRef, onOpenScreen(p), report, analyses, floorLog }
 */
export function JournalScreen({ v }) {
  const [openKey, setOpenKey] = useState(v.openRef || null);
  const q = v.query || "";
  const toggle = (k) => setOpenKey((x) => (x === k ? null : k));
  const openRows = (v.open || []).filter(({ p }) => matchesRef(p, q));
  const closed = v.closed || [];
  const nothing = q && !openRows.length && !closed.length;
  const refs = [...(v.allClosed || []), ...(v.open || []).map((o) => o.p)].map((e) => e.ref).filter(Boolean).sort();
  return (
    <div data-journal style={{ paddingBottom: 8 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px 4px" }}>
        <h1 data-view-heading tabIndex={-1} style={{ ...sans, margin: 0, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
          outline: "none" }}>Journal</h1>
      </header>
      <main style={v.wide ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start", padding: "4px 16px 0" }
        : { display: "flex", flexDirection: "column", gap: 12, padding: "4px 16px 0" }}>
        {/* ON A COMPUTER (redesign PR 3b): the record, the search and what is open on the left; what closed on the right. */}
        <div data-journal-col="left" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ...(v.wide ? null : { display: "contents" }) }}>
        <section aria-label="Your record" data-journal-record style={{ ...PANEL, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={H2}>{`THE RECORD · ${(v.allClosed || []).length} CLOSED · ${(v.open || []).length} OPEN`}</div>
            <Info label="the measures">{v.insideLimit}</Info>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[["LEVEL", v.journey.level, T.amber], ["RULE CLOSES", v.journey.closed ? `${v.journey.ruled} of ${v.journey.closed}` : "—", T.ink],
              ["AWARENESS", v.journey.score == null ? "—" : `${v.journey.score}/100`, T.ink]].map(([k, val, c]) => (
              <div key={k}>
                <div style={{ ...sans, fontSize: FS.xs, color: T.dim, letterSpacing: "0.04em" }}>{k}</div>
                <div style={{ ...mono, fontSize: FS.lg, fontWeight: FW.bold, color: c }}>{val}</div>
              </div>
            ))}
          </div>
          <p style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>Next: {v.journey.next}</p>
        </section>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>Find a trade</span>
          <input type="search" value={q} onChange={(e) => v.onQuery(e.target.value)} placeholder="J-0003, 3, or a ticker"
            style={{ ...sans, minHeight: TAP, padding: "0 12px", border: `1px solid ${T.field}`, borderRadius: 10, background: T.panel, color: T.ink,
              fontSize: FS.md, boxSizing: "border-box", width: "100%" }} />
        </label>

        {openRows.length > 0 && (
          <section data-journal-open style={{ ...PANEL, padding: "4px 14px" }}>
            <h2 style={{ ...H2, padding: "10px 0 4px" }}>{`OPEN · ${openRows.length}`}</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {openRows.map(({ p, m, stage }) => {
                const k = p.ref || `p${p.id}`;
                const state = openState({ stage, working: !!(m && m.working), action: m && m.act ? m.act.action : null, kind: m && m.act ? m.act.kind : null });
                const row = { ref: p.ref, key: k, ticker: p.ticker, name: m ? m.name : p.name, sub: entriesWords((p.timeline || []).length),
                  pnl: stage === "working" ? null : m ? m.pnl : null, state, warn: state === "WARNING" };
                return (
                  <Entry key={k} row={row} open={openKey === k} onToggle={() => toggle(k)}>
                    <Para head="THE REASON YOU OPENED IT · ">{whyOpenedLine(p.thesis)}</Para>
                    {openedDetailLine(p.thesis) && <Para color={T.mut}>{openedDetailLine(p.thesis)}</Para>}
                    <Timeline timeline={p.timeline} />
                    {stage !== "working" && v.onOpenScreen && (
                      <button type="button" onClick={() => v.onOpenScreen(p)} style={{ ...sans, alignSelf: "flex-start", minHeight: TAP, padding: 0,
                        border: "none", background: "transparent", color: T.blue, fontSize: FS.sm, cursor: "pointer" }}>Its screen ›</button>
                    )}
                  </Entry>
                );
              })}
            </ul>
          </section>
        )}

        </div>
        <div data-journal-col="right" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ...(v.wide ? null : { display: "contents" }) }}>
        <section data-journal-closed style={{ ...PANEL, padding: "4px 14px" }}>
          <h2 style={{ ...H2, padding: "10px 0 4px" }}>{closedTitle(v.allClosed || [])}</h2>
          {netNote(v.allClosed || []) && <p style={{ ...sans, margin: "0 0 6px", fontSize: FS.xs, color: T.mut }}>{netNote(v.allClosed || [])}</p>}
          {!(v.allClosed || []).length && (
            <p style={{ ...sans, margin: "0 0 10px", fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>
              Nothing closed yet. Every trade you close lands here with the reason it ended, its whole timeline and the orders behind it.
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {closed.map((e) => {
              const k = e.ref || `e${e.id}`;
              const jp = journalPnl(e);
              // A TEST IS MARKED ON ITS ROW, NEVER DELETED (P9, TASK 3); the level steps over it.
              const row = { ref: e.ref, key: k, ticker: e.ticker, name: e.name, sub: `${endedLine(e)}${isTestRecord(e) ? " · read as a test" : ""}`, pnl: jp.shown, pnlNote: jp.note,
                state: closedState(e), warn: false };
              return (
                <Entry key={k} row={row} open={openKey === k} onToggle={() => toggle(k)}>
                  <Para head="WHY IT ENDED · ">{endedLine(e)}{e.closeReason && e.closeReason.kind === "rule" && e.closeReason.written
                    ? <span style={{ color: T.mut }}>{` You also wrote: “${e.closeReason.written}”.`}</span> : null}</Para>
                  <Para head="THE REASON YOU OPENED IT · ">{whyOpenedLine(e.thesis)}</Para>
                  {openedDetailLine(e.thesis) && <Para color={T.mut}>{openedDetailLine(e.thesis)}</Para>}
                  {e.thesis && e.thesis.pop != null && <Para color={T.dim}>{seasonalStampNote(e.thesis, e.ticker || "this market")}</Para>}
                  {e.thesis && e.thesis.againstSignal && <Para color={T.amber}>{`Opened against ${e.thesis.againstSignal.n} of ${e.thesis.againstSignal.total} factors — “${e.thesis.againstSignal.reason}”`}</Para>}
                  <Para color={riskOkOf(e) === false ? T.amber : T.mut}>{riskOkWords(e)}{isTestRecord(e) ? ` · read as a test: ${testRecordNote()}` : ""}</Para>
                  <div style={{ ...mono, fontSize: FS.xs, color: T.dim, lineHeight: LH.body, wordBreak: "break-all" }}>
                    <div>{`OPENING ORDER · ${e.openOrderId || "none — this was the app's own paper book"}${e.openStatus ? ` (${e.openStatus})` : ""}`}</div>
                    <div>{`CLOSING ORDER · ${e.closeOrderId || "none — closed in the app, no broker order"}`}</div>
                  </div>
                  <Timeline timeline={e.timeline} />
                </Entry>
              );
            })}
          </ul>
        </section>

        {nothing && (
          <p data-journal-none style={{ ...sans, margin: 0, fontSize: FS.sm, color: T.body }}>
            {`Nothing matches "${q}". The refs run from ${refs[0] || "—"} upwards.`}
          </p>
        )}
        <p style={{ ...sans, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>Refs only go up: closing or deleting a trade never gives its number back.</p>

        {/* BELOW, IN ORDER, FOLDED (owner, 6 Oct 2026): the report (its frequency beside it), the copilot's analyses, the
            entry floor's log. Each is unchanged inside its fold. */}
        <section data-journal-more style={{ ...PANEL, padding: "4px 14px", display: "grid", gap: 4 }}>
          <Fold label="open" tone={T.ink} keepMounted summary="The report">{v.report}</Fold>
          {v.analyses && <Fold label="open" tone={T.ink} summary={v.analysesSummary}>{v.analyses}</Fold>}
          {v.floorLog}
        </section>
        </div>
      </main>
    </div>
  );
}
