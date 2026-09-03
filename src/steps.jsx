// ============================================================================
// src/steps.jsx — THE NAVIGATION ITSELF (PRD §12).
//
// Three pieces, and none of them knows anything about a trade:
//
//   StepNav          the numbered path, 1 → 2 → 3, with what each step is
//                    carrying written under its number.
//   EvidenceOverlay  a sub-panel that opens OVER the step instead of below it.
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
import React, { useEffect } from "react";
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
export function EvidenceOverlay({ title, sub, onClose, children }) {
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
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>EVIDENCE</div>
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
          Tick a second one and both payoffs are drawn on the same axis, over the same picture of where the
          price could finish. One on its own has nothing to be compared with.
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
