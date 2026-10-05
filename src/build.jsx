// ============================================================================
// src/build.jsx — STEP 3, BUILD, ON THE OWNER'S MOCKUP "3 · Build" (redesign PR 2, TASKS 2–4).
//
// Top to bottom: the header row (‹ back · Paper), the title, "What this trade does" (one sentence and the one chart),
// "The numbers", "Why this trade" (collapsible), "Ask the copilot about this trade", "Legs", "Order" (inline, no longer
// a sheet), "Exit plan", Send, then "More on this trade ▾" with everything the mockup has no place for, in today's form.
// Send opens the review sheet (the second of two taps); Build's three states (loading, no quotes, empty) are here too.
//
// IT COMPUTES NOTHING. Every figure is handed in by App.jsx, read off `buildFigures()` (the card's figures, held equal
// by figures.test.jsx), the gate's own `evaluateTrade()` / `gateChecklist()`, `takeProfitTarget()` and the signals'
// `factorStands()`. Every generated sentence is a function in rules.js. Order path 2 is `useTicketSend()` (pro.jsx),
// the ticket's send moved there unchanged: the same gate call, the same `orderBody()`, the same POST.
//
// On ui.jsx's atoms and the type tokens only: ui.test.jsx holds this file to the design system.
// ============================================================================
import React, { useState } from "react";
import { Minus, Plus, ArrowUp } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Note, Info, Sheet, Reveal, TAP } from "./ui.jsx";
import { useCopilot, useTicketSend, SKILLS, BUILD_SKILL_IDS, Markdown, readQty } from "./pro.jsx";
import { FACTOR_LABEL } from "./why.jsx";
import { CARD_LABELS, BUILD_DEFINITIONS, money, signedMoney, chanceText, futureTile, ARIA } from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const tnum = { fontVariantNumeric: "tabular-nums" };
const ARROW = { 1: "↑", "-1": "↓", 0: "→" };
const STAND_TONE = () => ({ supports: T.green, against: T.amber, quiet: T.mut });


/** One section of Build: panel ground, a 1px line, radius 12, padding 14. */
export const Section = ({ children, style, label, ...rest }) => (
  <section aria-label={label} {...rest}
    style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, boxSizing: "border-box", minWidth: 0, ...style }}>
    {children}
  </section>
);
const SectionTitle = ({ children, right = null }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: TAP, marginTop: -10, marginBottom: -2 }}>
    <h3 style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, margin: 0, lineHeight: LH.tight }}>{children}</h3>
    {right}
  </div>
);
const LinkBtn = ({ children, onClick, ...rest }) => (
  <button onClick={onClick} {...rest}
    style={{ ...sans, fontSize: FS.sm, color: T.blue, background: "transparent", border: "none", padding: 0, minHeight: TAP, cursor: "pointer", whiteSpace: "nowrap" }}>
    {children}
  </button>
);
const Rule = () => <div aria-hidden="true" style={{ borderTop: `1px solid ${T.line}`, margin: "10px 0" }} />;

/* ---------------------------------------------------------------- THE HEADER ROW */
export function BuildHeader({ backLabel, onBack }) {
  return (
    <div data-build-header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 0 4px" }}>
      <button onClick={onBack} aria-label={ARIA.buildBack(backLabel)}
        style={{ ...mono, fontSize: FS.md, color: T.ink, background: "transparent", border: "none", minHeight: TAP, padding: "0 8px", cursor: "pointer" }}>
        ‹ {backLabel}
      </button>
      <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.mut, border: `1px solid ${T.field}`, borderRadius: 999, padding: "3px 10px" }}>Paper</span>
    </div>
  );
}

/* ---------------------------------------------------------------- THE TITLE */
export function BuildTitle({ name, sub, signs = null, note = null }) {
  return (
    <div>
      <h2 data-view-heading tabIndex={-1} style={{ ...sans, fontSize: FS.xl, fontWeight: FW.bold, color: T.ink, margin: 0, lineHeight: LH.tight, outline: "none" }}>{name}</h2>
      <div style={{ ...mono, ...tnum, fontSize: FS.sm, color: T.mut, marginTop: 4 }}>{sub}</div>
      {signs}
      {note && <div style={{ ...sans, fontSize: FS.sm, color: T.amber, marginTop: 6, lineHeight: LH.body }}>{note}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- WHAT THIS TRADE DOES */
export function WhatItDoes({ takeaway, chart }) {
  return (
    <Section label="What this trade does">
      <SectionTitle>What this trade does</SectionTitle>
      {takeaway && <p data-takeaway style={{ ...sans, fontSize: FS.md, color: T.ink, lineHeight: LH.body, margin: "0 0 10px" }}>{takeaway}</p>}
      {chart}
    </Section>
  );
}

/* ---------------------------------------------------------------- THE NUMBERS */
/** A label (12 mut, dotted underline) that opens its definition, over a value (mono 18 bold). */
function Figure({ id, label, value, def, open, onToggle, tone = T.ink }) {
  return (
    <div style={{ minWidth: 0 }}>
      <button onClick={() => onToggle(id)} aria-expanded={open}
        style={{ ...sans, fontSize: FS.xs, color: T.mut, background: "transparent", border: "none", padding: 0, minHeight: 24, cursor: "pointer",
          textDecoration: "underline dotted", textUnderlineOffset: 3, textAlign: "left" }}>{label}</button>
      <div style={{ ...mono, ...tnum, fontSize: FS.lg, fontWeight: FW.bold, color: tone, lineHeight: LH.tight }}>{value}</div>
      {open && <div role="note" style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body, marginTop: 2 }}>{def}</div>}
    </div>
  );
}
const BoxRow = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
    <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>{k}</span>
    <span style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{v}</span>
  </div>
);
const Box = ({ title, children }) => (
  <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, minWidth: 0, display: "grid", gap: 4 }}>
    <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", color: T.mut }}>{title}</div>
    {children}
  </div>
);
export function NumbersSection({ figures, rr, pop, breakevens = [], future, past, delta, theta, reconcile = null }) {
  const [def, setDef] = useState(null);
  const toggle = (id) => setDef((d) => (d === id ? null : id));
  const ft = futureTile(future);
  const items = [
    ["profit", CARD_LABELS.profit, figures && figures.profit != null ? money(figures.profit) : figures && figures.unbounded ? "no ceiling" : "—", T.ink],
    ["loss", "MAX LOSS", figures && figures.risk != null ? money(figures.risk) : "—", T.ink],
    ["breakeven", "BREAKEVEN", breakevens.length ? breakevens.map((b) => Number(b).toFixed(2)).join(" · ") : "—", T.ink],
    ["rr", CARD_LABELS.rr, rr == null ? "—" : Number(rr).toFixed(2), T.ink],
  ];
  return (
    <Section label="The numbers">
      <SectionTitle>The numbers</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
        {items.map(([id, label, value, tone]) => (
          <Figure key={id} id={id} label={label} value={value} tone={tone} def={BUILD_DEFINITIONS[id]} open={def === id} onToggle={toggle} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Box title={CARD_LABELS.future}>
          <BoxRow k={CARD_LABELS.chance.charAt(0) + CARD_LABELS.chance.slice(1).toLowerCase()} v={chanceText(pop)} />
          <BoxRow k="Avg" v={ft.value} />
        </Box>
        <Box title={CARD_LABELS.past}>
          <BoxRow k="In profit" v={past ? `${past.wins} of ${past.n}` : "not read"} />
          <BoxRow k="Avg" v={past ? signedMoney(past.avg) : "—"} />
        </Box>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 12 }}>
        <Figure id="delta" label="Delta (shares)" value={delta} def={BUILD_DEFINITIONS.delta} open={def === "delta"} onToggle={toggle} />
        <Figure id="theta" label="Theta" value={theta} def={BUILD_DEFINITIONS.theta} open={def === "theta"} onToggle={toggle} />
      </div>
      {reconcile}
    </Section>
  );
}

/* ---------------------------------------------------------------- WHY THIS TRADE */
export function WhySection({ stance, factors = null, reasonRule, lines = [], onMarketRead, readLabel }) {
  const [open, setOpen] = useState(false);
  const tone = STAND_TONE();
  return (
    <Section label="Why this trade" style={{ padding: "6px 14px" }} data-why-trade>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minHeight: TAP, background: "transparent",
          border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
        <span style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>Why this trade</span>
        <span style={{ ...sans, fontSize: FS.sm, color: T.blue }}>{open ? "close" : "open"}</span>
      </button>
      {stance && <div data-stance style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body, paddingBottom: 8 }}>{stance}</div>}
      <Reveal open={open}>
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
          {(factors || []).map((f) => (
            <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28, gap: 8 }}>
              <span style={{ ...sans, fontSize: FS.sm, color: T.ink }}>
                {FACTOR_LABEL[f.key] || f.key} <span style={{ ...mono, ...tnum }}>{ARROW[f.dir] || "→"} {f.strength == null ? "—" : f.strength}</span>
              </span>
              <span style={{ ...sans, fontSize: FS.sm, color: tone[f.stand] }}>{f.stand}</span>
            </div>
          ))}
          {!factors && <Note>The signals are being read.</Note>}
          <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 6 }}>{reasonRule}</div>
          {onMarketRead && <LinkBtn onClick={onMarketRead}>{readLabel}</LinkBtn>}
        </div>
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, paddingBottom: 8, display: "grid", gap: 8 }}>
          {lines.map((l, i) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 6 }}>
              <span style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, color: T.mut }}>{i + 1}</span>
              <div>
                <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", color: T.mut }}>{l.label}</div>
                <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

/* ---------------------------------------------------------------- THE COPILOT */
/** The four questions of the mockup, from SKILLS (one home). */
export const buildSkills = () => BUILD_SKILL_IDS.map((id) => SKILLS.find((s) => s.id === id)).filter(Boolean);
export function CopilotSection({ ask }) {
  const [chosen, setChosen] = useState(null);
  const skills = buildSkills();
  const pairs = [];
  for (let i = 0; i < ask.msgs.length; i++) {
    if (ask.msgs[i].role === "user") pairs.push({ q: ask.msgs[i], a: ask.msgs[i + 1] && ask.msgs[i + 1].role === "assistant" ? ask.msgs[i + 1] : null });
  }
  const labelOf = (q) => (skills.find((s) => s.prompt === q.content) || SKILLS.find((s) => s.prompt === q.content) || {}).label || q.content;
  return (
    <Section label="Ask the copilot about this trade" data-build-copilot>
      <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, marginBottom: 10 }}>ASK THE COPILOT ABOUT THIS TRADE</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {skills.map((sk, i) => (
          <button key={sk.id} disabled={ask.busy} aria-pressed={chosen === sk.id}
            onClick={() => { setChosen(sk.id); ask.send(sk.prompt, sk.label); }}
            style={{ ...sans, gridColumn: i === 0 ? "1 / span 2" : undefined, minHeight: TAP, padding: "8px 12px", borderRadius: 10, textAlign: "left",
              fontSize: FS.sm, fontWeight: i === 0 ? FW.bold : FW.regular, color: T.ink, background: "transparent", cursor: ask.busy ? "wait" : "pointer",
              border: `1px solid ${i === 0 ? T.blue : T.field}`, boxShadow: chosen === sk.id ? `inset 0 0 0 2px ${T.blue}` : "none", lineHeight: LH.tight }}>
            {sk.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={ask.input} onChange={(e) => ask.setInput(e.target.value)} placeholder="Or ask your own…" aria-label="Ask the copilot your own question"
          onKeyDown={(e) => { if (e.key === "Enter") { setChosen(null); ask.send(ask.input); } }}
          style={{ ...sans, flex: 1, minWidth: 0, height: TAP, boxSizing: "border-box", fontSize: FS.sm, color: T.ink, background: T.bg,
            border: `1px solid ${T.field}`, borderRadius: 10, padding: "0 12px" }} />
        <button onClick={() => { setChosen(null); ask.send(ask.input); }} disabled={ask.busy} aria-label="Send the question"
          style={{ width: TAP, height: TAP, flexShrink: 0, borderRadius: 10, border: "none", background: T.action, color: T.onAccent,
            display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: ask.busy ? "wait" : "pointer", opacity: ask.busy ? 0.6 : 1 }}>
          <ArrowUp size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {(pairs.length > 0 || ask.busy) && (
        <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 10, display: "grid", gap: 12 }} data-copilot-answers>
          {pairs.map((p, i) => (
            <div key={i}>
              <div style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{labelOf(p.q)}</div>
              {p.a && <Markdown text={p.a.content} style={{ marginTop: 4, lineHeight: LH.body }} />}
              {p.a && (
                <div style={{ ...sans, fontSize: FS.xs, color: p.a.truncated ? T.amber : T.mut, marginTop: 4 }}>
                  {p.a.truncated ? "Cut off before the end: ask again for the rest." : "Filed in the Journal."}
                </div>
              )}
            </div>
          ))}
          {ask.busy && (ask.partial
            ? <div><Markdown text={ask.partial} /><div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 4 }}>Writing…</div></div>
            : <Note>Thinking… the answer waits here if you scroll away.</Note>)}
          {pairs.length > 0 && !ask.busy && (
            <div style={{ display: "flex", gap: 12 }}>
              <LinkBtn onClick={ask.printConvo}>Print</LinkBtn>
              <LinkBtn onClick={ask.clear}>Clear</LinkBtn>
            </div>
          )}
        </div>
      )}
      {ask.err && <div role="alert" style={{ ...sans, fontSize: FS.sm, color: T.red, marginTop: 8 }}>{ask.err}</div>}
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 10 }}>
        Educational analysis on a paper account, not financial advice. Every answer is filed in the Journal.
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- THE LEGS */
const px2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(2));
export function LegRow({ leg }) {
  const sell = leg.side < 0;
  return (
    <div data-leg-row style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52, borderTop: `1px solid ${T.line}` }}>
      <span style={{ ...sans, width: 44, flexShrink: 0, textAlign: "center", fontSize: FS.xs, fontWeight: FW.bold, lineHeight: "22px", borderRadius: 6,
        color: sell ? T.amber : T.onAccent, background: sell ? "transparent" : T.amber, boxShadow: sell ? `inset 0 0 0 2px ${T.amber}` : "none" }}>
        {sell ? "SELL" : "BUY"}
      </span>
      <span style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, flex: 1, minWidth: 0 }}>
        {leg.qty} × {leg.strike} {leg.type === "call" ? "call" : "put"}
      </span>
      <span style={{ textAlign: "right" }}>
        <span style={{ display: "block", ...mono, ...tnum, fontSize: FS.md, color: T.ink }}>{px2(leg.mid)} <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>mid</span></span>
        <span style={{ display: "block", ...mono, ...tnum, fontSize: FS.xs, color: T.mut }}>{px2(leg.bid)} / {px2(leg.ask)} · Δ {leg.delta == null ? "—" : Number(leg.delta).toFixed(2)}</span>
      </span>
    </div>
  );
}
export function LegsSection({ expLabel, legs = [], onEditInChain, snapNote = null }) {
  return (
    <Section label="Legs" data-build-legs>
      <SectionTitle right={onEditInChain ? <LinkBtn onClick={onEditInChain}>Edit in chain ›</LinkBtn> : null}>Legs{expLabel ? ` · ${expLabel}` : ""}</SectionTitle>
      {snapNote && <Note color={T.blue} style={{ marginBottom: 6 }}>{snapNote}</Note>}
      <div style={{ marginTop: 6 }}>{legs.map((l, i) => <LegRow key={i} leg={l} />)}</div>
    </Section>
  );
}

/* ---------------------------------------------------------------- THE ORDER, INLINE */
/** − value +, inside one 1px field border: 44×44 buttons, the value mono 15 bold (or typed, when `onType`). */
export function Stepper({ label, value, onMinus, onPlus, canMinus = true, canPlus = true, onType = null, ariaLabel }) {
  const [text, setText] = useState(null);
  const btn = (on, sign, fn, can) => (
    <button onClick={fn} disabled={!can} aria-label={`${sign > 0 ? "More" : "Less"}: ${ariaLabel}`}
      style={{ width: TAP, height: TAP, flexShrink: 0, background: "transparent", border: "none", color: can ? T.ink : T.dim, cursor: can ? "pointer" : "not-allowed",
        display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {on}
    </button>
  );
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${T.field}`, borderRadius: 10, overflow: "hidden" }}>
        {btn(<Minus size={18} aria-hidden="true" />, -1, onMinus, canMinus)}
        {onType ? (
          <input value={text != null ? text : String(value ?? "")} inputMode="numeric" aria-label={ariaLabel}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text != null) onType(text); setText(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ ...mono, ...tnum, flex: 1, minWidth: 0, width: "100%", textAlign: "center", fontSize: FS.md, fontWeight: FW.bold, color: T.ink,
              background: "transparent", border: "none", height: TAP, padding: 0 }} />
        ) : (
          <span aria-label={ariaLabel} style={{ ...mono, ...tnum, flex: 1, textAlign: "center", fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{value ?? "—"}</span>
        )}
        {btn(<Plus size={18} aria-hidden="true" />, 1, onPlus, canPlus)}
      </div>
    </div>
  );
}
export function OrderSection({ order }) {
  const o = order;
  const [riskDef, setRiskDef] = useState(false);
  const capOn = o.cap.checked;
  return (
    <Section label="Order" data-build-order>
      <SectionTitle>Order</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
        <Stepper label="Contracts" ariaLabel="Contracts" value={o.contracts}
          onMinus={() => o.onContracts(o.contracts - 1)} onPlus={() => o.onContracts(o.contracts + 1)}
          canMinus={o.contracts > o.qtyMin} canPlus={o.contracts < o.qtyMax}
          onType={(t) => { const r = readQty(t, o.qtyMin, o.qtyMax); if (r.ok) o.onContracts(r.value); }} />
        <Stepper label={`Limit ${o.limitSide}`} ariaLabel={`Limit ${o.limitSide}`} value={o.limit == null ? "—" : Number(o.limit).toFixed(2)}
          onMinus={() => o.onStep(-1)} onPlus={() => o.onStep(1)} canMinus={o.limit != null && o.limit > 0.01} canPlus={o.limit != null} />
      </div>
      {o.qtyNote && <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 4 }}>{o.qtyNote}</div>}
      <div style={{ ...mono, ...tnum, fontSize: FS.xs, color: T.mut, marginTop: 8 }}>{o.bookLine}</div>
      {o.verdict && o.verdict.known && (
        <div data-limit-note style={{ ...sans, fontSize: FS.sm, color: o.verdict.state === "fills" ? T.body : T.amber, lineHeight: LH.body, marginTop: 4 }}>
          {o.verdict.label}
          <Info label="where this price sits">{o.verdict.sentence} {o.verdict.tifSentence}</Info>
        </div>
      )}
      {o.verdict && !o.verdict.known && <div style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body, marginTop: 4 }}>{o.verdict.sentence}</div>}
      <Rule />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <button onClick={() => setRiskDef((v) => !v)} aria-expanded={riskDef}
          style={{ ...sans, fontSize: FS.sm, color: T.mut, background: "transparent", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3, minHeight: 28 }}>
          Risk on this trade
        </button>
        <span>
          <span style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{o.risk.value}</span>
          {o.risk.pct && <span style={{ ...sans, fontSize: FS.xs, color: T.mut, marginLeft: 6 }}>{o.risk.pct}</span>}
        </span>
      </div>
      {riskDef && <div role="note" style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body }}>{BUILD_DEFINITIONS.loss}</div>}
      <label style={{ ...sans, display: "flex", alignItems: "center", gap: 10, minHeight: TAP, fontSize: FS.sm, color: T.ink, cursor: "pointer" }}>
        <input type="checkbox" checked={capOn} onChange={(e) => o.cap.onCheck(e.target.checked)}
          style={{ width: 22, height: 22, accentColor: T.amber, flexShrink: 0, margin: 0 }} />
        {o.cap.label}
      </label>
      {o.cap.over && <div role="alert" style={{ ...sans, fontSize: FS.sm, color: T.red, lineHeight: LH.body }}>{o.cap.over}</div>}
      {!capOn && o.cap.freeLine && <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>{o.cap.freeLine}</div>}
      {o.cap.draft != null && (
        <div style={{ marginTop: 6 }}>
          <textarea rows={2} value={o.cap.draft} onChange={(e) => o.cap.setDraft(e.target.value)} placeholder="Why size freely? Stored with the setting."
            aria-label="Why size freely"
            style={{ ...sans, width: "100%", boxSizing: "border-box", fontSize: FS.sm, color: T.ink, background: T.bg, border: `1px solid ${T.amber}`, borderRadius: 10, padding: "8px 10px", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={o.cap.onTurnOff} disabled={!o.cap.draftOk}
              style={{ ...sans, minHeight: TAP, padding: "0 14px", borderRadius: 10, border: "none", background: o.cap.draftOk ? T.action : T.raise,
                color: o.cap.draftOk ? T.onAccent : T.dim, fontSize: FS.sm, fontWeight: FW.bold, cursor: o.cap.draftOk ? "pointer" : "not-allowed" }}>
              Stop enforcing the cap
            </button>
            <LinkBtn onClick={o.cap.onCancelDraft}>Keep it</LinkBtn>
            {!o.cap.draftOk && <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{o.cap.draftLeft}</span>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, minHeight: 28 }}>
        <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Open risk after this</span>
        <span>
          <span style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{o.openRisk.value}</span>
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut, marginLeft: 6 }}>{o.openRisk.of}</span>
        </span>
      </div>
      {o.room}
    </Section>
  );
}

/* ---------------------------------------------------------------- THE EXIT PLAN */
export function ExitPlanSection({ pill = null, rows = [], footer }) {
  return (
    <Section label="Exit plan" data-build-exits>
      <SectionTitle right={pill ? (
        <span style={{ ...sans, fontSize: FS.xs, color: T.amber, border: `1px solid ${T.amber}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{pill}</span>
      ) : null}>Exit plan</SectionTitle>
      <div style={{ marginTop: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 8, alignItems: "baseline", borderTop: `1px solid ${T.line}`, padding: "10px 0" }}>
            <span style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{r.label}</span>
            <span style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body }}>{r.sub}</span>
            <span style={{ ...mono, ...tnum, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink, whiteSpace: "nowrap" }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{footer}</div>
    </Section>
  );
}

/* ---------------------------------------------------------------- SEND */
export function SendBar({ label, disabled = false, reason = null, footer, onSend }) {
  return (
    <div data-build-send>
      <button onClick={onSend} disabled={disabled} aria-describedby={reason ? "build-send-reason" : undefined}
        style={{ ...sans, width: "100%", minHeight: 52, borderRadius: 12, border: "none", fontSize: FS.md, fontWeight: FW.bold,
          background: disabled ? T.raise : T.action, color: disabled ? T.dim : T.onAccent, cursor: disabled ? "not-allowed" : "pointer" }}>
        {label}
      </button>
      {reason && <div id="build-send-reason" style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body, marginTop: 6 }}>{reason}</div>}
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut, textAlign: "center", marginTop: 6 }}>{footer}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- THE REVIEW SHEET (TASK 3) */
const Mark = ({ ok }) => (
  <span aria-hidden="true" style={{ width: 20, flexShrink: 0, textAlign: "center", fontSize: FS.md, fontWeight: FW.bold,
    color: ok === true ? T.green : ok === false ? T.red : T.mut }}>{ok === true ? "✓" : ok === false ? "✗" : "—"}</span>
);
export function ReviewSheet({ r, ts }) {
  const sent = ts.outcome && r.lastSent && !/^NOT SENT/.test(ts.outcome.label || "");
  const refused = ts.outcome && /^NOT SENT/.test(ts.outcome.label || "");
  return (
    <Sheet open={r.open} title={sent ? "✓ Sent. Alpaca accepted it." : "Review, then send"} onClose={r.onClose}>
      {sent ? (
        <div data-review-sent style={{ display: "grid", gap: 8 }}>
          <div style={{ ...mono, ...tnum, fontSize: FS.sm, color: T.ink }}>{r.sentLine(r.lastSent)}</div>
          {r.waitLine && <div style={{ ...sans, fontSize: FS.sm, color: T.mut }}>{r.waitLine}</div>}
          <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>{r.filedLine(r.lastSent)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={r.onJournal} style={ghost48}>Journal</button>
            <button onClick={r.onOrders} style={{ ...ghost48, flex: 2 }}>See it in Orders</button>
          </div>
        </div>
      ) : (
        <div data-review style={{ display: "grid", gap: 12 }}>
          <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{r.sub}</div>
          <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px" }}>
            {r.legs.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", minHeight: 24 }}>
                <span style={{ ...sans, fontSize: FS.sm, color: T.ink }}><b>{l.words[0]}</b> {l.words[1]}</span>
                <span style={{ ...mono, fontSize: FS.xs, color: T.mut, whiteSpace: "nowrap" }}>{l.occ || "—"}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 6, ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{r.limitLine}</div>
          </div>
          <div style={{ display: "grid", gap: 6 }} data-review-checks>
            {r.checks.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <Mark ok={c.ok} />
                <span style={{ ...sans, fontSize: FS.sm, color: T.body, flex: 1, lineHeight: LH.body }}>{c.text}</span>
                <span style={{ ...mono, ...tnum, fontSize: FS.sm, color: T.ink, whiteSpace: "nowrap" }}>{c.value}</span>
              </div>
            ))}
            <Info label="the checks in full">{r.checksFull}</Info>
          </div>
          {r.clockLine && <div style={{ ...sans, fontSize: FS.sm, color: T.mut }}>{r.clockLine}</div>}
          {r.reason}
          {refused && (
            <div role="alert" style={{ ...sans, fontSize: FS.sm, color: T.red, lineHeight: LH.body }}>
              <b>{ts.outcome.headline}</b>{ts.outcome.detail ? ` ${ts.outcome.detail}` : ""}
            </div>
          )}
          {r.blocked && <div style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body }}>{r.blocked}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={r.onClose} style={ghost48}>Back</button>
            <button onClick={r.onSecond} disabled={!r.canSend || ts.busy}
              style={{ ...sans, flex: 2, minHeight: 48, borderRadius: 12, border: "none", fontSize: FS.md, fontWeight: FW.bold,
                background: r.canSend ? T.action : T.raise, color: r.canSend ? T.onAccent : T.dim, cursor: r.canSend ? "pointer" : "not-allowed" }}>
              {ts.busy ? "Sending…" : r.secondLabel}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
const ghost48 = { ...sans, flex: 1, minHeight: 48, borderRadius: 12, border: `1px solid ${T.field}`, background: "transparent", color: T.ink,
  fontSize: FS.md, fontWeight: FW.bold, cursor: "pointer" };

/* ---------------------------------------------------------------- MORE ON THIS TRADE */
export function MoreOnThisTrade({ open, onToggle, children }) {
  return (
    <div data-build-more>
      <button onClick={onToggle} aria-expanded={open}
        style={{ ...sans, display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", minHeight: TAP, background: "transparent",
          border: "none", padding: "0 2px", cursor: "pointer", fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>
        More on this trade <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <Reveal open={open}><div style={{ display: "grid", gap: 12, marginTop: 4 }}>{children}</div></Reveal>
    </div>
  );
}

/* ---------------------------------------------------------------- THE WHOLE SCREEN */
export function BuildScreen({ v, foldedNode = null }) {
  const [more, setMore] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const ask = useCopilot(v.copilot);
  const askAll = { ...ask, clear: () => v.copilot.setConvo({ msgs: [], busy: false, err: null }) };
  const ts = useTicketSend({ ...v.ticket, onSent: (o, info) => { setLastSent(o); if (v.ticket.onSent) v.ticket.onSent(o, info); } });
  const r = { ...v.review, lastSent, onSecond: v.review.viaBroker ? () => ts.fire() : v.review.onLocal,
    onClose: () => { if (ts.outcome && !ts.busy) ts.setOutcome(null); v.review.onClose(); } };
  const others = SKILLS.filter((s) => !BUILD_SKILL_IDS.includes(s.id));
  return (
    <div data-build style={{ paddingBottom: 8 }}>
      <BuildHeader backLabel={v.back.label} onBack={v.back.onClick} />
      <main style={{ padding: "4px 16px", display: "grid", gap: 12 }}>
        <BuildTitle name={v.title.name} sub={v.title.sub} signs={v.title.signs} note={v.title.note} />
        <WhatItDoes takeaway={v.takeaway} chart={v.chart} />
        <NumbersSection {...v.numbers} />
        <WhySection {...v.why} />
        <CopilotSection ask={askAll} />
        <LegsSection {...v.legs} />
        <OrderSection order={v.order} />
        <ExitPlanSection {...v.exit} />
        <SendBar {...v.send} />
        <MoreOnThisTrade open={more} onToggle={() => setMore((m) => !m)}>
          <Section label="More questions for the copilot">
            <SectionTitle>More questions for the copilot</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {others.map((sk) => (
                <button key={sk.id} disabled={ask.busy} onClick={() => ask.send(sk.prompt, sk.label)}
                  style={{ ...sans, minHeight: TAP, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.field}`, background: "transparent",
                    color: T.ink, fontSize: FS.sm, cursor: "pointer" }}>{sk.label}</button>
              ))}
            </div>
            <Note style={{ marginTop: 6 }}>The answer appears in the copilot section above.</Note>
          </Section>
          {foldedNode}
        </MoreOnThisTrade>
      </main>
      <ReviewSheet r={r} ts={ts} />
    </div>
  );
}

/* ---------------------------------------------------------------- THE THREE STATES (TASK 4) */
const Dash = ({ k }) => (
  <div>
    <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{k}</div>
    <div style={{ ...mono, fontSize: FS.lg, fontWeight: FW.bold, color: T.dim }}>—</div>
  </div>
);
export function BuildLoading({ back, title, sub, reading }) {
  return (
    <div data-build-state="loading">
      <BuildHeader backLabel={back.label} onBack={back.onClick} />
      <main style={{ padding: "4px 16px", display: "grid", gap: 12 }}>
        <BuildTitle name={title} sub={sub} />
        <Section label="Loading">
          <div style={{ ...sans, fontSize: FS.md, color: T.ink }}>{reading}</div>
          <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 4, lineHeight: LH.body }}>The chart waits for a bid and an ask on both legs.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", marginTop: 12 }}>
            <Dash k={CARD_LABELS.profit} /><Dash k="MAX LOSS" /><Dash k="BREAKEVEN" /><Dash k={CARD_LABELS.chance} />
          </div>
          <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 10 }}>A dash is a number not read yet, never a zero.</div>
        </Section>
      </main>
    </div>
  );
}
export function BuildNoQuotes({ back, title, sub, sentence, legs = [], lastRead, onRetry, onPickExpiry }) {
  return (
    <div data-build-state="no-quotes">
      <BuildHeader backLabel={back.label} onBack={back.onClick} />
      <main style={{ padding: "4px 16px", display: "grid", gap: 12 }}>
        <BuildTitle name={title} sub={sub} />
        <Section label="No quotes">
          <div style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>No quotes for {legs.length === 1 ? "this leg" : legs.length ? `these ${legs.length === 2 ? "two" : legs.length} legs` : "this market"}.</div>
          <div style={{ ...sans, fontSize: FS.sm, color: T.body, marginTop: 4, lineHeight: LH.body }}>{sentence}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={onRetry} style={{ ...sans, flex: 1, minHeight: TAP, borderRadius: 10, border: "none", background: T.amber, color: T.onAccent, fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer" }}>Retry</button>
            <button onClick={onPickExpiry} style={{ ...ghost48, minHeight: TAP, fontSize: FS.sm, borderRadius: 10 }}>Pick another expiry</button>
          </div>
          {legs.length > 0 && <div style={{ marginTop: 12 }}>{legs.map((l, i) => <LegRow key={i} leg={{ ...l, mid: null, bid: null, ask: null, delta: null }} />)}</div>}
          <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 10, lineHeight: LH.body }}>{lastRead}</div>
        </Section>
      </main>
    </div>
  );
}
export function BuildEmpty({ onFind, onChain }) {
  return (
    <div data-build-state="empty">
      <main style={{ padding: "24px 16px", display: "grid", gap: 12 }}>
        <h2 data-view-heading tabIndex={-1} style={{ ...sans, fontSize: FS.lg, fontWeight: FW.bold, color: T.ink, margin: 0, outline: "none" }}>Nothing on Build yet.</h2>
        <p style={{ ...sans, fontSize: FS.md, color: T.body, lineHeight: LH.body, margin: 0 }}>
          Pick a card in Find, or tap prices in a market's chain. The trade you pick lands here with its numbers, its chart and its exit plan.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onFind} style={{ ...sans, flex: 1, minHeight: TAP, borderRadius: 10, border: "none", background: T.amber, color: T.onAccent, fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer" }}>Go to Find</button>
          <button onClick={onChain} style={{ ...ghost48, minHeight: TAP, fontSize: FS.sm, borderRadius: 10 }}>Open a chain</button>
        </div>
      </main>
    </div>
  );
}
