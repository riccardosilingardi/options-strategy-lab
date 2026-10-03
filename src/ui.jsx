// ============================================================================
// src/ui.jsx — THE ONE SET OF ATOMS, AND THE ONE RANGE CONTROL (PR #45, TASK 5).
//
// Measured on 2 Oct 2026, before this file: Btn ×2, Panel ×2, Lbl ×3, Stat ×3 copies and the mono stack
// defined in 8 files; 23 font sizes, two thirds of their uses under 12px; 402 mono spreads against 15 sans.
// Every migrated screen (Find, the request controls, the card) imports its atoms from HERE and its sizes from
// the type tokens in `theme.js`; `ui.test.jsx` fails the build on a `fontSize` literal or a local copy of an
// atom in those files. Other screens keep theirs until the sweep that moves them (ROADMAP PR #47).
//
// TWO RULES OF TYPE.
//   MONO is for NUMBERS, TICKERS, LEGS and OCC SYMBOLS: things a reader compares column against column.
//   SANS is for SENTENCES and LABELS: things a reader reads.
// It was the other way round: 402 mono spreads, so a sentence about a stop looked like a price.
//
// IT DECIDES NOTHING. Every atom is handed what it prints; `RangeField` formats and clamps what it is given
// and calls `onChange`. No rule number is written here: the bounds are the caller's, read from RULES.
// ============================================================================
import React, { useEffect, useId, useRef, useState } from "react";
import { T, TYPE } from "./theme.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;

/** The two stacks. One definition each; the other files' copies are the sweep's to remove. */
export const MONO_STACK = "ui-monospace, Menlo, monospace";
export const SANS_STACK = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
export const mono = { fontFamily: MONO_STACK };
export const sans = { fontFamily: SANS_STACK };

/** The least a touch target is, in pixels (WCAG 2.5.5). Every control below is at least this tall. */
export const TAP = 44;

/* ====================================================================
   BUTTON — 44px tall whatever the size. `small` narrows the padding, never the height: a 22px "Close at limit"
   was the control the owner needed most. The ghost border is the full colour (1.4.11). Any other prop
   (aria-label, aria-expanded, title) reaches the button.
==================================================================== */
export const Btn = ({ children, onClick, color = T.amber, ghost = false, disabled = false, small = false, style, ...rest }) => (
  <button onClick={onClick} disabled={disabled} {...rest}
    style={{
      ...sans, fontSize: small ? FS.xs : FS.sm, fontWeight: FW.bold, lineHeight: LH.tight,
      padding: small ? "6px 12px" : "8px 14px", minHeight: TAP, borderRadius: 8,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      background: ghost ? "transparent" : color, color: ghost ? color : T.onAccent,
      border: ghost ? `1px solid ${color}` : "none",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, ...style,
    }}>{children}</button>
);

/** A selectable pill: a market, a direction, a way to size. `monoText` is for tickers. */
export const Chip = ({ on = false, onClick, color = T.amber, label, monoText = false, children, style }) => (
  <button onClick={onClick} aria-label={label} aria-pressed={on}
    style={{
      ...(monoText ? mono : sans), fontSize: FS.xs, fontWeight: FW.bold, lineHeight: LH.tight,
      padding: "8px 14px", minHeight: TAP, borderRadius: 22, cursor: "pointer",
      border: `1.5px solid ${color}`, background: on ? color : "transparent", color: on ? T.onAccent : color, ...style,
    }}>{children}</button>
);

export const Panel = ({ children, style, accent = null }) => (
  <div style={{
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: 14,
    ...(accent ? { borderLeft: `3px solid ${accent}` } : null), ...style,
  }}>{children}</div>
);

/** A small heading over a block, in the accent colour. */
export const Label = ({ children, color = T.amber, style }) => (
  <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", lineHeight: LH.tight, color, ...style }}>{children}</div>
);

/** A label over a value, always in the same places. The value is a number or a ticker, so it is mono. */
export const Stat = ({ k, v, c, tip, style }) => (
  <div style={style}>
    <div style={{ ...sans, fontSize: FS.xs, letterSpacing: "0.04em", lineHeight: LH.tight, color: T.dim }}>
      {k}{tip && <span title={tip} style={{ cursor: "help", color: T.blue, marginLeft: 4 }}>ⓘ</span>}
    </div>
    <div style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: c || T.ink }}>{v}</div>
  </div>
);

/** A one-line note: a sentence, so sans. */
export const Note = ({ children, color = T.mut, style, ...rest }) => (
  <div {...rest} style={{ ...sans, fontSize: FS.xs, lineHeight: LH.body, color, ...style }}>{children}</div>
);

/* ====================================================================
   THE ⓘ — ONE OR TWO SENTENCES, ONE TAP AWAY (PR #47, TASK 3).

   A tap opens it and a tap closes it: a `title` never opens on a phone. The button is 44px tall (2.5.5), says what
   it explains (aria-label) and whether it is open (aria-expanded). The text is rendered only while open, so it is
   not "words at rest" and the counter in `wordcount.mjs` does not score it — FOLD, NEVER DELETE: every fact that
   left a screen for a ⓘ is still one tap away.
==================================================================== */
export function Info({ label, children, style }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!children) return null;
  return (
    <span style={{ display: "inline", ...style }}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`About ${label}`} aria-expanded={open} aria-controls={id}
        style={{ ...sans, fontSize: FS.sm, color: T.blue, background: "transparent", border: "none", cursor: "pointer",
          minHeight: TAP, minWidth: TAP, padding: 0, verticalAlign: "middle" }}>ⓘ</button>
      {open && (
        <span id={id} role="note" style={{ ...sans, display: "block", fontSize: FS.xs, lineHeight: LH.body, color: T.body,
          background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 10px", margin: "2px 0 6px" }}>
          {children}
        </span>
      )}
    </span>
  );
}

/** A two- to four-way switch for a screen's segments: one row of 44px buttons, `aria-pressed` on the one shown. */
export function Segments({ items = [], value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: "inline-flex", border: `1px solid ${T.field}`, borderRadius: 8, overflow: "hidden" }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange && onChange(it.id)} aria-pressed={on}
            style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, minHeight: TAP, padding: "8px 16px", cursor: "pointer",
              border: "none", background: on ? T.ink : "transparent", color: on ? T.bg : T.ink }}>
            {it.label}{it.count != null ? <span style={{ ...mono, marginLeft: 6 }}>{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A number field. Numbers, so mono; the border is the field token (1.4.11). */
export const NumberInput = ({ style, ...rest }) => (
  <input type="number" {...rest}
    style={{ ...mono, fontSize: FS.sm, background: T.bg, color: T.ink, border: `1px solid ${T.field}`, borderRadius: 6,
      padding: "8px 10px", minHeight: TAP, ...style }} />
);

/** A text area, for a reason typed in words: sans. */
export const TextArea = ({ style, ...rest }) => (
  <textarea {...rest}
    style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, background: T.bg, color: T.ink, border: `1px solid ${T.field}`,
      borderRadius: 6, padding: "8px 10px", ...style }} />
);

/** A tick box with its words, 44px tall. */
export const CheckField = ({ checked, onChange, children, style }) => (
  <label style={{ ...sans, fontSize: FS.xs, color: T.mut, display: "inline-flex", gap: 8, alignItems: "center", minHeight: TAP, cursor: "pointer", ...style }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ width: 20, height: 20 }} />
    {children}
  </label>
);

/* ====================================================================
   THE FOLD — one summary line on screen, the full text one tap behind it.

   FOLD, NEVER DELETE. Everything inside is unchanged and unrewritten; the summary is always visible and carries the
   count. aria-expanded says whether it is open, aria-controls says what it opens (WCAG 4.1.2), the button is 44px
   tall (2.5.5). `keepMounted` is for a panel whose own effects must run even while it is closed (the Guardian logs
   a weakened reason on mount): the region stays in the tree and is `hidden`.
==================================================================== */
export function Fold({ summary, label = "why", tone = T.mut, children, style, keepMounted = false }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  if (!summary) return null;
  return (
    <div style={{ ...style }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={regionId}
        style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left",
          background: "transparent", border: "none", padding: 0, cursor: "pointer", minHeight: TAP }}>
        <span style={{ ...sans, fontSize: FS.xs, color: tone, lineHeight: LH.body, flex: 1 }}>{summary}</span>
        <span style={{ ...sans, fontSize: FS.xs, color: T.blue, whiteSpace: "nowrap" }}>
          {open ? "hide ▲" : `${label} ▼`}
        </span>
      </button>
      {keepMounted ? <div id={regionId} hidden={!open} style={{ marginTop: 4 }}>{children}</div>
        : open && <div id={regionId} style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/* ====================================================================
   THE RANGE FIELD — ONE CONTROL STYLE FOR EVERY NUMBER THE REQUEST ASKS FOR (PR #45, TASK 2).

   The owner: "uniforma lo stile, slider o text box, meglio il primo". A label, the value (tap it to type an exact
   number), the slider, the two ends, a small histogram of what the current candidates hold with the threshold
   marked, and how many pass. The histogram is how a slider answers "what will this do to the list" BEFORE the
   reader moves it — a control whose effect is read after the move is the "filters do not filter" complaint again.

   It formats and clamps; it does not know what a chance or a budget is. The caller hands it `format` (value →
   words), `parse` (typed text → value) and `toInput` (value → what the box starts with), so a percent is typed as
   54 and held as 0.54. A typed value is clamped into [min, max] and goes through the same `onChange` as the slider,
   so there is one way a value changes.

   `values` are numbers on the SAME scale as `value`; `passWhen` says which side of the threshold passes ("above"
   for a minimum, "below" for a most). A candidate with no readable value is not in `values`: unknown is not a bin.
   `pass` is the caller's own count (it reads `meetsRequest()`), printed as "N pass".
==================================================================== */

/** Clamp into [min, max]. A non-number is NOT zero: it returns null and the caller keeps the old value. */
export const clampTo = (v, min, max) => {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
};

/** Counts per bin over [min, max]; a value outside the range lands in the nearest end bin. */
export function histogram(values = [], { min, max, bins = 20 } = {}) {
  const out = Array.from({ length: bins }, () => 0);
  if (!(max > min)) return out;
  for (const raw of values || []) {
    if (raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * bins)));
    out[i]++;
  }
  return out;
}

export function RangeField({
  label, value, onChange, min, max, step = 1,
  format = String, parse = Number, toInput = String, valueText = null,
  minCaption = null, maxCaption = null,
  values = null, passWhen = "above", pass = null, color = T.amber,
  aside = null, note = null, disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const boxRef = useRef(null);
  const id = useId();
  // Tapping the value selects what is in the box, so typing REPLACES it: the owner types 54, not 2054.
  useEffect(() => { if (editing && boxRef.current) { boxRef.current.focus(); boxRef.current.select(); } }, [editing]);

  const usable = Number.isFinite(Number(min)) && Number.isFinite(Number(max)) && Number(max) > Number(min);
  const v = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const shown = v == null ? null : Math.min(max, Math.max(min, v));
  const frac = usable && shown != null ? (shown - min) / (max - min) : 0;
  const bins = values && usable ? histogram(values, { min, max }) : null;
  const tallest = bins ? Math.max(1, ...bins) : 1;

  const commit = () => {
    const parsed = parse(text);
    const next = clampTo(parsed, min, max);
    setEditing(false);
    if (next != null && onChange) onChange(next);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor={id} style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", color: T.dim }}>{label}</label>
        {editing ? (
          <input ref={boxRef} type="text" inputMode="decimal" aria-label={`${label}: type an exact number`}
            value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setEditing(false); }}
            style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, width: 112, textAlign: "right", background: T.bg, color: T.ink,
              border: `1px solid ${T.field}`, borderRadius: 6, padding: "6px 10px", minHeight: TAP }} />
        ) : (
          <button onClick={() => { setText(shown == null ? "" : toInput(shown)); setEditing(true); }} disabled={disabled || !usable}
            aria-label={`${label}: ${shown == null ? "not set" : format(shown)}. Tap to type an exact number`}
            style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color, background: "transparent", border: "none",
              textDecoration: "underline dotted", textUnderlineOffset: 5, padding: "4px 2px", minHeight: TAP, cursor: "pointer" }}>
            {shown == null ? "—" : format(shown)}
          </button>
        )}
      </div>
      {aside && <div style={{ marginTop: 2 }}>{aside}</div>}

      {usable ? (
        <div style={{ position: "relative", marginTop: 4 }}>
          {bins && (
            <div aria-hidden="true" style={{ position: "relative", height: 28, margin: "0 10px", display: "flex", alignItems: "flex-end", gap: 1 }}>
              {bins.map((n, i) => {
                const centre = min + ((i + 0.5) / bins.length) * (max - min);
                const passes = shown == null ? false : passWhen === "below" ? centre <= shown : centre >= shown;
                return (
                  <div key={i} style={{ flex: 1, height: n ? `${Math.max(12, (n / tallest) * 100)}%` : 2,
                    background: n ? (passes ? T.green : T.field) : T.line, opacity: n ? 0.9 : 0.6, borderRadius: 1 }} />
                );
              })}
              <div style={{ position: "absolute", left: `${frac * 100}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, background: color }} />
            </div>
          )}
          <input id={id} type="range" min={min} max={max} step={step} value={shown == null ? min : shown} disabled={disabled}
            aria-valuetext={valueText || (shown == null ? "not set" : format(shown))}
            onChange={(e) => onChange && onChange(Number(e.target.value))}
            style={{ display: "block", width: "100%", height: TAP, margin: 0, accentColor: color, cursor: "pointer" }} />
        </div>
      ) : (
        <Note style={{ marginTop: 6 }}>{note || "no range to move"}</Note>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...sans, fontSize: FS.xs, color: T.dim }}>
        <span>{usable ? (minCaption != null ? minCaption : format(min)) : ""}</span>
        {pass != null && <span style={{ color: T.mut }}><span style={mono}>{pass}</span> pass</span>}
        <span>{usable ? (maxCaption != null ? maxCaption : format(max)) : ""}</span>
      </div>
      {note && usable && <Note style={{ marginTop: 2 }}>{note}</Note>}
    </div>
  );
}
