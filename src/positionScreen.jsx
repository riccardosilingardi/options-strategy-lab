// ============================================================================
// src/positionScreen.jsx — ONE POSITION, ITS OWN SCREEN (redesign PR 3, TASK 3; the owner's board "PositionDetail").
//
// Tapping a card's title, "Decide: close or keep ›", "Details ›" or "Close at limit" opens it. In the board's order: the
// header ("‹ Positions", the ref), the title and "UNG · 2 puts · opened Fri 25 Sep", WHAT TO DO NOW (the badge, the
// profit, one sentence, and its two answers: Close at limit — order path 3, `prepareCardClose()` / `CloseConfirm` /
// `sendCardClose()`, unchanged — or Keep it, write why), WHERE IT MAKES AND LOSES MONEY, THE EXIT PLAN, AT ENTRY VS NOW,
// RECORD · LAST 4, Analyse as a new trade and Alpaca details (a sheet: the record's own rows, read-only), then the
// copilot on this position, and the exit orders and the reason check (the Guardian) folded at the end.
//
// IT COMPUTES NOTHING. App.jsx hands it `v`: every figure is `positionModels`' (the card's own), every sentence is a
// generator in positionView.js. Nothing here sends an order; "Keep it" writes a timeline entry through `v.keep.onKeep`,
// which a deploy preview refuses (CLAUDE.md rule 6) — the button says why.
// ============================================================================
import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { Info, Note, Sheet, mono, sans, TAP } from "./ui.jsx";
import { PREVIEW, PREVIEW_READ_ONLY } from "./deploy.js";
import { Fold } from "./steps.jsx";
import { PositionChart } from "./visuals.jsx";
import { CopilotSection } from "./build.jsx";
import { useCopilot, SKILLS, POSITION_SKILL_IDS } from "./pro.jsx";
import { CardButton } from "./positions.jsx";
import { ActionBadge } from "./positionCard.jsx";
import { signedMoney$, screenHeadline, keptLine, exitPlanRows, evLabel, turnedLine, recordRows } from "./positionView.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

const PANEL = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 };
const H2 = { ...sans, margin: 0, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, lineHeight: LH.tight };
const BAR_TONE = { done: () => T.green, warn: () => T.amber, field: () => T.field };
const TWO = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };

/** The three questions a position's screen asks (SKILLS, one home). */
export const positionSkills = () => POSITION_SKILL_IDS.map((id) => SKILLS.find((s) => s.id === id)).filter(Boolean);

/* ---------------------------------------------------------------- WHAT TO DO NOW */
export function StatusBlock({ s, keep, closeNode = null, workingNode = null }) {
  const [mode, setMode] = useState("idle");
  const [reason, setReason] = useState("");
  const [kept, setKept] = useState(null);
  const [err, setErr] = useState(null);
  const fieldId = React.useId();
  const shown = workingNode ? "working" : closeNode ? "closing" : mode;
  const ring = s.action === "WARNING" ? T.amber : s.action === "CLOSE" ? T.action : T.line;
  const pnlKnown = s.pnl != null && Number.isFinite(Number(s.pnl));
  const short = reason.trim().length < keep.min;
  const doKeep = async () => {
    const r = await keep.onKeep(reason.trim());
    if (r && r.ok) { setKept({ seq: r.seq, reason: reason.trim() }); setMode("kept"); setErr(null); }
    else setErr((r && r.message) || "Not kept.");
  };
  return (
    <section aria-label="What to do now" data-position-status
      style={{ ...PANEL, border: `1px solid ${ring}`, gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <ActionBadge action={s.action} text={s.badge} />
        <span data-status-pnl aria-label={pnlKnown ? `profit now ${signedMoney$(s.pnl)}` : "profit now not known"}
          style={{ ...mono, fontSize: FS.xl, fontWeight: FW.bold, color: !pnlKnown ? T.dim : Number(s.pnl) >= 0 ? T.green : T.violet }}>
          {signedMoney$(s.pnl)}
        </span>
      </div>
      <p data-status-headline style={{ ...sans, margin: 0, fontSize: FS.md, lineHeight: LH.body, color: T.ink }}>
        {screenHeadline({ mode: shown, act: s.act, pnl: s.pnl, progress: s.progress })}
        {/* The rule's whole sentence ("…not validated by backtest…", "50% of the premium paid") is one tap away. */}
        {shown === "idle" && s.ruleLine ? <Info label="the rule">{s.ruleLine}</Info> : null}
      </p>
      {s.notes.map((n, i) => <p key={i} style={{ ...sans, margin: 0, fontSize: FS.sm, color: T.amber, lineHeight: LH.body }}>⚠ {n}</p>)}
      {shown === "idle" && (
        <div style={s.canKeep ? TWO : { display: "grid", gap: 8 }}>
          <CardButton tone={s.action === "HOLD" ? "quiet" : "action"} onClick={s.onClose} disabled={s.closeDisabled || PREVIEW}
            title={PREVIEW ? PREVIEW_READ_ONLY : s.closeTitle}>Close at limit</CardButton>
          {s.canKeep && <CardButton tone="quiet" onClick={() => setMode("keeping")} disabled={PREVIEW}
            title={PREVIEW ? PREVIEW_READ_ONLY : undefined}>Keep it, write why</CardButton>}
        </div>
      )}
      {shown === "idle" && PREVIEW && <Note color={T.amber}>{PREVIEW_READ_ONLY}</Note>}
      {shown === "closing" && <div data-status-step style={{ paddingTop: 10, borderTop: `1px solid ${T.line}` }}>{closeNode}</div>}
      {shown === "working" && <div data-status-step role="status" style={{ paddingTop: 10, borderTop: `1px solid ${T.line}` }}>{workingNode}</div>}
      {shown === "keeping" && (
        <div data-status-step style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
          <label htmlFor={fieldId} style={{ ...sans, fontSize: FS.sm, color: T.mut }}>{`Why keep it? It goes into ${s.ref}'s record.`}</label>
          <textarea id={fieldId} rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }}
            style={{ ...sans, width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${T.field}`, borderRadius: 8,
              background: T.bg, color: T.ink, fontSize: FS.sm, lineHeight: LH.body, resize: "vertical" }} />
          {short && <Note>{`At least ${keep.min} characters.`}</Note>}
          {err && <Note color={T.red}>{err}</Note>}
          <div style={TWO}>
            <CardButton tone="quiet" onClick={() => setMode("idle")}>Back</CardButton>
            <CardButton tone="action" disabled={short || PREVIEW} title={PREVIEW ? PREVIEW_READ_ONLY : undefined} onClick={doKeep}>Keep, with this reason</CardButton>
          </div>
        </div>
      )}
      {shown === "kept" && kept && (
        <p role="status" data-status-step style={{ ...sans, margin: 0, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: FS.sm,
          lineHeight: LH.body, color: T.body }}>{keptLine({ seq: kept.seq, reason: kept.reason, act: s.act })}</p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- THE SECTIONS */
function PaysSection({ pays }) {
  return (
    <section aria-label="Where it makes and loses money" data-position-pays style={PANEL}>
      <h2 style={H2}>WHERE IT MAKES AND LOSES MONEY</h2>
      {pays.line && <p style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>{pays.line}</p>}
      <PositionChart bands={pays.bands} bars={pays.bars} spot={pays.spot} entrySpot={pays.entrySpot} openedAt={pays.openedAt}
        strikes={pays.strikes} title={pays.title} />
    </section>
  );
}

function ExitPlanSection({ rows = [], plan = null }) {
  return (
    <section aria-label="The exit plan" data-position-exit style={{ ...PANEL, gap: 12 }}>
      <h2 style={H2}>THE EXIT PLAN{plan ? <Info label="the plan">{plan}</Info> : null}</h2>
      {rows.map((r) => (
        <div key={r.id} data-exit-row={r.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", ...sans, fontSize: FS.sm, color: T.ink }}>
            <span>{r.label}{r.reached && <span style={{ color: r.tone === "done" ? T.green : T.amber }}> · reached</span>}</span>
            <span style={{ ...mono, textAlign: "right" }}>{r.value}</span>
          </div>
          <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: T.line, position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round((r.frac || 0) * 100)}%`, background: (BAR_TONE[r.tone] || BAR_TONE.field)() }} />
          </div>
        </div>
      ))}
    </section>
  );
}

function EntryVsNowSection({ ev, entryDay, nowDay, footnote }) {
  if (!ev) return null;
  const head = { ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.mut, textAlign: "right" };
  const cell = (bold, c = T.ink) => ({ ...mono, textAlign: "right", fontWeight: bold ? FW.bold : FW.regular, color: c });
  return (
    <section aria-label="At entry vs now" data-position-ev style={{ ...PANEL, gap: 4 }}>
      <h2 style={{ ...H2, marginBottom: 6 }}>AT ENTRY VS NOW</h2>
      <div role="table" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) repeat(2, minmax(0, 1fr))", gap: "6px 8px",
        alignItems: "baseline", ...sans, fontSize: FS.sm }}>
        <span />
        <span style={head}>AT ENTRY<br /><span style={{ fontWeight: FW.regular }}>{entryDay || "—"}</span></span>
        <span style={head}>NOW<br /><span style={{ fontWeight: FW.regular }}>{nowDay || "—"}</span></span>
        {ev.figures.map((r) => (
          <React.Fragment key={r.id}>
            <span style={{ color: T.mut }}>{evLabel(r.k)}</span><span style={cell(false)}>{r.entry}</span><span style={cell(true)}>{r.now}</span>
          </React.Fragment>
        ))}
        <span style={{ gridColumn: "1 / -1", borderTop: `1px solid ${T.line}`, margin: "4px 0" }} />
        {ev.factors.map((r) => (
          <React.Fragment key={r.k}>
            <span style={{ color: T.mut }}>{evLabel(r.label)}</span><span style={cell(false)}>{r.entry}</span>
            <span data-turned={r.turned || undefined} style={cell(true, r.turned ? T.amber : T.ink)}>{r.now}{r.turned ? " •" : ""}</span>
          </React.Fragment>
        ))}
      </div>
      <p style={{ ...sans, margin: "8px 0 0", fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>
        {ev.factors.some((f) => f.turned) && <span style={{ color: T.amber }}>• </span>}{footnote}
      </p>
    </section>
  );
}

function RecordSection({ rows = [], onWhole }) {
  return (
    <section aria-label="Record" data-position-record style={{ ...PANEL, display: "block", padding: "14px 14px 6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={H2}>{`RECORD · LAST ${rows.length}`}</h2>
        <button type="button" onClick={onWhole} style={{ ...sans, minHeight: TAP, display: "flex", alignItems: "center", fontSize: FS.sm,
          color: T.blue, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>Whole record ›</button>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((r) => (
          <li key={r.key} style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: 8, padding: "8px 0", borderTop: `1px solid ${T.line}`,
            ...sans, fontSize: FS.sm, lineHeight: LH.body }}>
            <span style={{ ...mono, color: T.mut }}>{r.when}</span><span style={{ color: T.ink }}>{r.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Alpaca details: the record's own rows, read-only (what the Details sheet held until redesign PR 3). */
export function AlpacaDetails({ d }) {
  const Row = ({ k, children }) => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ ...sans, fontSize: FS.xs, color: T.dim, width: 110, flexShrink: 0 }}>{k}</div>
      <div style={{ flex: 1, minWidth: 150, ...mono, fontSize: FS.sm, color: T.ink, lineHeight: LH.body }}>{children}</div>
    </div>
  );
  return (
    <div data-alpaca-details>
      {d.stageNote && <Note color={T.amber} style={{ marginBottom: 8 }}>⚠ {d.stageNote}</Note>}
      <Row k="LEGS">{d.legsText}</Row>
      <Row k="EXPIRES">{d.expiresText}</Row>
      <Row k="OPENED">{d.openedText}</Row>
      <Row k="ENTRY PRICE">{d.entryText}</Row>
      {d.fillSentence && <Note style={{ marginTop: 6 }}>{d.fillSentence}</Note>}
      <Row k="PROFIT NOW">
        <span style={{ fontWeight: FW.bold, color: d.pnl == null ? T.dim : Number(d.pnl) >= 0 ? T.green : T.violet }}>{signedMoney$(d.pnl)}</span>
        {d.shareText ? ` · ${d.shareText}` : ""}
      </Row>
      {d.pnlNote && <Note style={{ marginTop: 4 }}>{d.pnlNote}</Note>}
      {d.edgeNote && <Note color={T.amber} style={{ marginTop: 4 }}>⚠ {d.edgeNote}</Note>}
    </div>
  );
}

/* ---------------------------------------------------------------- THE WHOLE SCREEN */
export function PositionScreen({ v }) {
  const ask = useCopilot(v.copilot);
  const askAll = { ...ask, clear: () => v.copilot.setConvo({ msgs: [], busy: false, err: null, partial: "" }) };
  return (
    <div data-position-screen style={{ paddingBottom: 8 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px 0 4px" }}>
        <button type="button" onClick={v.back.onClick} data-back
          style={{ ...sans, minHeight: TAP, display: "flex", alignItems: "center", gap: 2, padding: "0 10px 0 4px", color: T.ink, background: "transparent",
            border: "none", fontSize: FS.md, cursor: "pointer" }}>
          <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" /><span>{v.back.label}</span>
        </button>
        <span data-ref-pill style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, padding: "2px 8px", border: `1px solid ${T.field}`, borderRadius: 999,
          color: T.mut }}>{v.ref}</span>
      </header>
      <main style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 16px 0" }}>
        <div>
          <h1 data-view-heading tabIndex={-1} style={{ ...sans, margin: 0, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
            outline: "none" }}>{v.title}</h1>
          <p data-position-sub style={{ ...mono, margin: "2px 0 0", fontSize: FS.sm, color: T.mut }}>{v.sub}</p>
        </div>
        <StatusBlock key={v.ref} s={v.status} keep={v.keep} closeNode={v.closeNode} workingNode={v.workingNode} />
        {v.fileNode}
        <PaysSection pays={v.pays} />
        <ExitPlanSection rows={exitPlanRows(v.progress)} plan={v.plan} />
        <EntryVsNowSection ev={v.ev} entryDay={v.entryDay} nowDay={v.nowDay} footnote={turnedLine(v.ev, v.p)} />
        <RecordSection rows={recordRows(v.timeline, 4)} onWhole={v.onWholeRecord} />
        <div style={TWO}>
          <CardButton tone="quiet" onClick={v.onAnalyse}>Analyse as a new trade</CardButton>
          <CardButton tone="quiet" onClick={v.details.onOpen} aria-haspopup="dialog">Alpaca details</CardButton>
        </div>
        <Note>Build prices it at today's market. A Send there would open a second position.</Note>
        <CopilotSection ask={askAll} skills={positionSkills()} label="Ask the copilot about this position"
          heading={<>ASK THE COPILOT ABOUT THIS POSITION</>} ownLabel={<>Your own question about this position</>}
          footer={<>It explains this position; it never closes, rolls or opens anything. Every answer is filed in the Journal.</>} />
        {v.guardian && (
          <Fold label="open" tone={T.ink} keepMounted summary="Exit orders · the reason check">{v.guardian}</Fold>
        )}
        {v.fileKind === "unknown" && (
          <button type="button" onClick={v.onFile} disabled={PREVIEW} title={PREVIEW ? PREVIEW_READ_ONLY : undefined}
            style={{ ...sans, alignSelf: "flex-start", fontSize: FS.sm, color: T.mut, background: "transparent", border: "none", padding: 0,
              minHeight: TAP, cursor: "pointer", textDecoration: "underline" }}>Closed it elsewhere? File it</button>
        )}
      </main>
      <Sheet open={v.details.open} title="Alpaca details" sub={v.ref} subMono onClose={v.details.onClose}>
        <AlpacaDetails d={v.details.d} />
      </Sheet>
    </div>
  );
}
