// ============================================================================
// src/steps.jsx — THE NAVIGATION ITSELF (PRD §12).
//
// Three pieces, and none of them knows anything about a trade:
//
//   StepNav          the numbered path, 1 → 2 → 3, with what each step is
//                    carrying written under its number.
//   EvidenceOverlay  a sub-panel that opens OVER the step instead of below it.
//   DeskSheet        the same sheet, for the Build screen's own numbers and its
//                    own order ticket (PRD §4n) — chrome, with no trade in it.
//   CompareTray      what is ticked for comparison, always visible while it has
//                    something in it.
//
// WHY AN OVERLAY. Evidence used to APPEND. Opening the Shortlist made the page
// longer; opening History made it longer again; and because none of them
// replaced anything, "Why this trade", "Agreement", "How to read it", "Three
// probabilities", the totals and the legend all ended up on screen at once,
// several thousand pixels apart. The copy was not duplicated in the code — it
// was all needed, each piece at a different moment — but it was all present at
// the same moment, and that is what read as repetitive and unclear.
//
// So evidence now opens as a sheet fixed to the viewport: it covers the step,
// it scrolls inside itself, and closing it puts the step back exactly where it
// was. When evidence is open, the step behind it is not also on screen. This
// also settles the older fault by construction — a panel written 2,000px down a
// page that does not scroll looked, on a phone, like a tap that did nothing.
// A sheet fixed to the viewport cannot land below the fold.
// ============================================================================
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { T, BADGE_SAFE } from "./theme.js";
import { STEPS, stepIndex } from "./path.js";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sans = { fontFamily: "ui-sans-serif, system-ui" };

/* ====================================================================
   THE NUMBERED PATH
==================================================================== */

/**
 * @param {object} a
 *   step   — the step on screen
 *   carry  — step id -> the line under its number (`stepCarry` in path.js)
 *   onStep — go to a step. Every step stays reachable: moving BACK must not
 *            lose the selection, and a step you cannot tap is not navigation.
 */
export function StepNav({ step, carry = {}, onStep }) {
  const here = stepIndex(step);
  return (
    <nav aria-label="The three steps" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
      {STEPS.map((s, i) => {
        const on = s.id === step;
        const done = i < here;
        const col = on ? T.amber : done ? T.green : T.line;
        return (
          <button key={s.id} onClick={() => onStep && onStep(s.id)}
            aria-current={on ? "step" : undefined}
            style={{
              ...sans, flex: "1 1 108px", minWidth: 108, minHeight: 56, textAlign: "left",
              padding: "8px 12px", borderRadius: 10, cursor: "pointer",
              background: on ? T.amber : "transparent", color: on ? T.onAccent : T.ink,
              border: `1.5px solid ${col}`,
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                ...mono, fontSize: 11, fontWeight: 800, width: 20, height: 20, borderRadius: 10,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: on ? T.onAccent : done ? T.green : T.line,
                color: on ? T.amber : done ? T.onAccent : T.mut,
              }}>{done ? "✓" : s.n}</span>
              <span style={{ fontSize: 14, fontWeight: on ? 800 : 600 }}>{s.label}</span>
            </span>
            <span style={{
              ...mono, display: "block", fontSize: 9.5, marginTop: 3, letterSpacing: "0.04em",
              color: on ? T.onAccent : T.dim, opacity: on ? 0.9 : 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {carry[s.id] || s.blurb}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** The forward button at the bottom of a step: one road out, named. */
export function StepForward({ label, sub, onClick, disabled, disabledNote }) {
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={onClick} disabled={disabled}
        style={{
          ...sans, width: "100%", minHeight: 54, fontSize: 16, fontWeight: 700, borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer", border: "none",
          background: disabled ? T.line : T.amber, color: disabled ? T.mut : T.onAccent,
        }}>
        {label}
      </button>
      {(disabled ? disabledNote : sub) && (
        <div style={{ ...sans, fontSize: 12.5, color: T.mut, lineHeight: 1.5, marginTop: 6, textAlign: "center" }}>
          {disabled ? disabledNote : sub}
        </div>
      )}
    </div>
  );
}

/* ====================================================================
   EVIDENCE — the same chips at every step, opening over it
==================================================================== */

export function EvidenceBar({ items = [], open, onOpen, mark = {} }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      <span style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.dim, marginRight: 4 }}>EVIDENCE</span>
      {items.map(({ id, label, I, sub }) => {
        const flag = mark[id] || null;         // "thinking" / "answer ready"
        const col = flag ? T.amber : open === id ? T.blue : T.mut;
        return (
          <button key={id} onClick={() => onOpen && onOpen(open === id ? null : id)} title={sub}
            style={{
              ...mono, fontSize: 11, padding: "8px 10px", minHeight: 40, borderRadius: 6,
              whiteSpace: "nowrap", cursor: "pointer",
              background: flag ? `${T.amber}18` : open === id ? `${T.blue}18` : "transparent", color: col,
              border: `1px solid ${flag ? T.amber : open === id ? T.blue : T.line}`,
              display: "inline-flex", gap: 5, alignItems: "center",
            }}>
            {I ? <I size={12} /> : null} {label}{flag ? ` · ${flag}` : ""}
          </button>
        );
      })}
      <span style={{ ...mono, fontSize: 9.5, color: T.dim, width: "100%", marginTop: 2 }}>
        Evidence opens over the step and closes back onto it — it never adds to the bottom of this page.
      </span>
    </div>
  );
}

/**
 * The sheet itself. Fixed to the viewport, opaque, scrolling inside itself, and
 * closable with Escape as well as the button — on a phone there is no second
 * way out of a full-screen panel.
 */
export function EvidenceOverlay({ title, sub, onClose, children, eyebrow = "EVIDENCE" }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // the page behind must not scroll
    const esc = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    document.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: T.bg, overflowY: "auto", overscrollBehavior: "contain" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 1, background: T.panel, borderBottom: `1px solid ${T.line}`,
        padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          {/* THE EYEBROW IS THE CALLER'S. The Build screen opens its own
              numbers and its own order ticket in this sheet (PRD §4n), and
              labelling the order ticket "EVIDENCE" would name the wrong thing
              on the one screen where the word has to be exact. */}
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>{eyebrow}</div>
          <div style={{ ...sans, fontSize: 16, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {sub && <div style={{ ...mono, fontSize: 10.5, color: T.dim }}>{sub}</div>}
        </div>
        <button onClick={onClose}
          style={{
            ...sans, fontSize: 14, fontWeight: 700, minHeight: 44, padding: "8px 14px", borderRadius: 8,
            background: T.amber, color: T.onAccent, border: "none", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}>
          <X size={15} /> Close
        </button>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: `14px 14px ${BADGE_SAFE}px` }}>{children}</div>
      <div style={{ ...sans, fontSize: 12.5, color: T.dim, textAlign: "center", paddingBottom: 20 }}>
        Closing this puts you back on the step you were reading.
      </div>
    </div>
  );
}

/* ====================================================================
   A SHEET OVER THE DECISION, NOT A PAGE UNDER IT.

   The Build screen's decision area was, measured on the owner's phone on
   20 September, a leg-by-leg market table, two paragraphs about an unquoted
   leg, the quantity, the order type, the time in force, the send button, a
   combination-market panel, four stat tiles, a market-versus-model pair, a
   notional paragraph and an error box — for ONE decision. Everything on it is
   correct and none of it is cut. It moves behind a tap, into the same
   `EvidenceOverlay` the evidence panels already use: fixed to the viewport,
   scrolling inside itself, closing back onto the step. That is also what stops
   it landing below the fold, which is the fault that component exists for.

   ONE AT A TIME, from one piece of state, because two of these open at once
   would both be `position: fixed; inset: 0`.
==================================================================== */
export function DeskSheet({ open, eyebrow, title, sub, onClose, children }) {
  if (!open) return null;
  return <EvidenceOverlay eyebrow={eyebrow} title={title} sub={sub} onClose={onClose}>{children}</EvidenceOverlay>;
}

/* ====================================================================
   COMPARE — what is ticked, and the way out of it
==================================================================== */

export function CompareTray({ items = [], max = 3, onRemove, onClear, onCompare, showing, note }) {
  if (!items.length && !note) return null;
  return (
    <div style={{
      marginTop: 12, padding: "10px 12px", background: T.panel,
      border: `1px solid ${T.blue}55`, borderLeft: `3px solid ${T.blue}`, borderRadius: 8,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.blue }}>
          COMPARING {items.length} OF {max}
        </span>
        {items.map((c) => (
          <button key={c.key} onClick={() => onRemove && onRemove(c)}
            title="Take this one out of the comparison"
            style={{
              ...mono, fontSize: 10.5, padding: "5px 9px", minHeight: 34, borderRadius: 14, cursor: "pointer",
              background: T.bg, color: T.ink, border: `1px solid ${T.line}`,
            }}>
            {c.ticker} {c.name} ✕
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {items.length >= 2 && (
          <button onClick={onCompare}
            style={{
              ...sans, fontSize: 13.5, fontWeight: 700, minHeight: 40, padding: "8px 14px", borderRadius: 8,
              background: showing ? "transparent" : T.blue, color: showing ? T.blue : T.onAccent,
              border: `1.5px solid ${T.blue}`, cursor: "pointer",
            }}>
            {showing ? "Hide the comparison" : "Compare them"}
          </button>
        )}
        {items.length > 0 && (
          <button onClick={onClear}
            style={{ ...mono, fontSize: 10.5, minHeight: 40, padding: "8px 10px", background: "transparent", border: "none", color: T.mut, cursor: "pointer" }}>
            clear
          </button>
        )}
      </div>
      {items.length === 1 && (
        <div style={{ ...sans, fontSize: 12.5, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
          Tick a second one: one on its own has nothing to be compared with.
        </div>
      )}
      {note && (
        <div style={{ ...sans, fontSize: 12.5, color: T.amber, marginTop: 6, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

/** The two small controls every candidate row carries: tick, and keep. */
export function CandidateActions({ ticked, onTick, saved, onSave, onBuild }) {
  const btn = (on, color) => ({
    ...mono, fontSize: 10.5, padding: "7px 10px", minHeight: 38, borderRadius: 6, cursor: "pointer",
    background: on ? color : "transparent", color: on ? T.onAccent : color,
    border: `1px solid ${color}`, whiteSpace: "nowrap",
  });
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button onClick={onTick} style={btn(ticked, T.blue)}>
        {ticked ? "✓ comparing" : "Compare"}
      </button>
      <button onClick={onSave} disabled={saved} style={{ ...btn(saved, T.violet), cursor: saved ? "default" : "pointer" }}>
        {saved ? "✓ saved" : "Save for later"}
      </button>
      {onBuild && (
        <button onClick={onBuild} style={{ ...btn(false, T.amber), fontWeight: 700 }}>
          Take to Build →
        </button>
      )}
    </div>
  );
}

/* ====================================================================
   THE FOLD — one summary line on screen, the full text one tap behind it.

   P9 TASK 3. `BuildWarnings` above has done exactly this for the gate's
   warnings since PR #28; this is the same control for the OTHER long
   explanations, so a screen can carry a fact without carrying a paragraph.

   >>> FOLD, NEVER DELETE. <<< Everything inside is unchanged and unrewritten.
   The summary is always visible and carries the COUNT, so nobody has to open
   it to learn whether it is worth opening — which was the fault
   `verdictNarrative()`'s fold already fixed on the wizard.

   >>> AND A REFUSAL IS NEVER BEHIND A TAP. <<< This control is for an
   EXPLANATION of a rule. The app saying no renders beside the button, under
   the older rule that outranks this one.
==================================================================== */
export function Fold({ summary, label = "why", tone = T.mut, children, style }) {
  const [open, setOpen] = useState(false);
  if (!summary) return null;
  return (
    <div style={{ ...style }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", gap: 8, alignItems: "baseline", width: "100%", textAlign: "left",
          background: "transparent", border: "none", padding: 0, cursor: "pointer", minHeight: 30 }}>
        <span style={{ ...mono, fontSize: 10.5, color: tone, lineHeight: 1.6, flex: 1 }}>{summary}</span>
        <span style={{ ...mono, fontSize: 10.5, color: T.blue, whiteSpace: "nowrap" }}>
          {open ? "hide ▲" : `${label} ▼`}
        </span>
      </button>
      {open && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/* ====================================================================
   THE DESK'S ONE LINE ABOUT ORDERS AND POSITIONS (PR #40, TASK 2)

   One status per object, one place: an order's state is on its row in
   Positions, a position's action on its card. The desk used to print both
   lists a second time. It prints COUNTS now — never a ref, a status or a
   price — and the whole line is the link to where they live.
==================================================================== */
export function DeskCountLine({ working = 0, decisions = 0, looks = 0, onOpen }) {
  const parts = [];
  if (working > 0) parts.push(`${working} order${working === 1 ? "" : "s"} working`);
  if (decisions > 0) parts.push(`${decisions} position${decisions === 1 ? "" : "s"} need${decisions === 1 ? "s" : ""} a decision`);
  else if (looks > 0) parts.push(`${looks} position${looks === 1 ? "" : "s"} to look at`);
  if (!parts.length) return null;
  const tone = decisions > 0 ? T.red : T.amber;
  return (
    <button onClick={onOpen}
      style={{ ...mono, fontSize: 11.5, color: tone, marginTop: 12, minHeight: 44, width: "100%", textAlign: "left",
        padding: "8px 12px", background: T.panel, border: `1px solid ${tone}66`, borderRadius: 8, cursor: "pointer" }}>
      ● {parts.join(" · ")} — Positions →
    </button>
  );
}
