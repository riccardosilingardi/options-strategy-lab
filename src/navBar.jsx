// ============================================================================
// src/navBar.jsx — ONE BOTTOM NAVIGATION BAR (PR #47, TASK 4).
//
// It replaces two rows that did one job: `StepNav` (1 Find → 2 Build) and the "places" row (Positions, Watching,
// Journal). Four places, always in the same spot under the thumb: Find · Build · Positions · Journal. Watching is
// "Saved", inside Find. Since redesign PR 1 round 2 the app opens on Find (Home is gone), and Back still walks the
// screens (`nav.js`): the bar only changes the same state the two rows changed.
//
// The bar is fixed to the bottom of the viewport ABOVE the Netlify badge strip (`BADGE_H`, theme.js) and above the
// phone's home indicator (`env(safe-area-inset-bottom)`); every page reserves `NAV_BAR_H` more bottom padding so
// nothing scrolls under it. Every target is 44px tall or more; the current one carries `aria-current="page"`.
// The Positions badge is decisions + closes working (`attentionCount()`), never a count of orders. Its spoken name is
// Home's old status sentence (`statusLine()`, `badgeLabel`), so what Home said is still said where the count is.
// ============================================================================
import React from "react";
import { Search, Hammer, Briefcase, FileText } from "lucide-react";
import { T, TYPE, BADGE_H } from "./theme.js";
import { sans, mono, TAP, RAIL_W } from "./ui.jsx";

const FS = TYPE.size, FW = TYPE.weight;
/** The bar's own height in pixels; a page adds it to its bottom padding. */
export const NAV_BAR_H = 60;
/** Where Find's list (and Saved, and a market's page) ends: 88px above the bottom — the mockups' figure, chosen by the
 *  owner on 5 Oct 2026 over the bar's real height above the badge strip (BADGE_H + NAV_BAR_H). */
export const FIND_LIST_END = 88;

export const NAV_PLACES = [
  { id: "find", label: "Find", I: Search },
  { id: "build", label: "Build", I: Hammer },
  { id: "positions", label: "Positions", I: Briefcase },
  { id: "journal", label: "Journal", I: FileText },
];

/** Which of the four is current, from the screen state. Saved (the old Watching) is part of Find. */
export function placeOf({ tab, step, showSettings = false }) {
  if (showSettings) return null;
  if (tab === "positions" || tab === "journal") return tab;
  if (tab === "watching") return "find";
  return step === "build" ? "build" : "find";
}

export function BottomBar({ current, badge = 0, badgeLabel = null, onGo, rail = false }) {
  /* ON A COMPUTER (redesign PR 3b): the same four places, as a sidebar on the left (`RAIL_W`), one row each. */
  if (rail) {
    return (
      <nav aria-label="Places" data-bottom-bar data-rail
        style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: RAIL_W, zIndex: 60, boxSizing: "border-box", padding: "16px 10px",
          background: T.panel, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV_PLACES.map(({ id, label, I }) => {
          const on = current === id;
          return (
            <button key={id} onClick={() => onGo && onGo(id)} aria-current={on ? "page" : undefined}
              aria-label={id === "positions" && badge > 0 ? (badgeLabel ? `${label}: ${badgeLabel}` : `${label}, ${badge} to look at`) : label}
              style={{ ...sans, minHeight: TAP, border: "none", borderRadius: 10, cursor: "pointer", padding: "0 12px",
                background: on ? T.ink : "transparent", color: on ? T.bg : T.ink, fontSize: FS.sm, fontWeight: on ? FW.bold : FW.regular,
                display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
              <I size={18} aria-hidden="true" />
              <span style={{ flex: 1 }}>{label}</span>
              {id === "positions" && badge > 0 && (
                <span aria-hidden="true" style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, background: T.action, color: T.onAccent,
                  borderRadius: 10, padding: "0 6px", lineHeight: "18px" }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Places" data-bottom-bar
      style={{ position: "fixed", left: 0, right: 0, bottom: `calc(${BADGE_H}px + env(safe-area-inset-bottom, 0px))`, zIndex: 60,
        display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", display: "flex", gap: 2, width: "100%", maxWidth: 560, margin: "0 8px",
        background: T.panel, border: `1px solid ${T.field}`, borderRadius: 14, padding: 4, boxShadow: "0 4px 18px rgba(0,0,0,0.18)" }}>
        {NAV_PLACES.map(({ id, label, I }) => {
          const on = current === id;
          return (
            <button key={id} onClick={() => onGo && onGo(id)} aria-current={on ? "page" : undefined}
              aria-label={id === "positions" && badge > 0 ? (badgeLabel ? `${label}: ${badgeLabel}` : `${label}, ${badge} to look at`) : label}
              style={{ ...sans, flex: 1, minHeight: Math.max(TAP, NAV_BAR_H - 10), border: "none", borderRadius: 10, cursor: "pointer",
                background: on ? T.ink : "transparent", color: on ? T.bg : T.ink, fontSize: FS.xs, fontWeight: on ? FW.bold : FW.regular,
                display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, position: "relative" }}>
              <I size={18} aria-hidden="true" />
              <span>{label}</span>
              {id === "positions" && badge > 0 && (
                <span aria-hidden="true" style={{ ...mono, position: "absolute", top: 4, right: "22%", fontSize: FS.xs, fontWeight: FW.bold,
                  background: T.action, color: T.onAccent, borderRadius: 10, padding: "0 6px", lineHeight: "18px" }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
