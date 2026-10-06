// ============================================================================
// src/wizard.jsx — THE APP SHELL (PRD §5).
//
// Home is not a tab inside the app. It is the front door: the first thing you
// see, and the thing you come back to.
//
// Screens in this file:
//   · CapitalOnboarding — first run, PRD §3. Capital, positions at once, savings.
//   · (WizardOpen, Home, is gone since redesign PR 1 round 2 — owner, 5 Oct 2026: the app opens on Find. Its
//     status sentence, `statusLine()`, is now the Positions badge's spoken name on the bottom bar.)
//   · (ConfirmSteps, the old confirm block on Build, is gone since redesign PR 3: Build's review sheet carries the
//     checks — `gateChecklist()`, below, which it reads — and its own Exit plan section states the exits.)
//
// The guided door — FindOpportunities, WizardCandidates (the two roads) and
// NothingToday — was deleted at the owner's request (PR #40, TASK 1,
// 23 Sep 2026). Find is one request block over one ranked list; "Nothing
// today" is a line on it, with the count for every reason.
//
// Written for a phone. No hover anywhere: every affordance is a tap target of
// at least 52px, inputs are 16px so iOS does not zoom on focus, and everything
// stacks in one column and widens on a desk.
// ============================================================================
import React, { useState } from "react";
import { T, TYPE, BADGE_SAFE, BADGE_BTN_GAP } from "./theme.js";
import { mono, sans, Chip, Label, Panel, TAP } from "./ui.jsx";
import { RULES, sizing, money, pctText, limitOwner } from "./rules.js";

// PR #48 SWEEP: the stacks, Chip, Label, Panel and the tap target are ui.jsx's, the sizes are the type tokens. Mono
// only for numbers and legs (an amount typed, a P&L, the legs being sent). RED IS FOR ERRORS AND REFUSALS: a
// position to CLOSE is `T.action`, a loss violet; the gate's refusal stays red.
const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const EYEBROW = { textTransform: "uppercase" };

/* ============================== atoms ============================== */

/** The wizard's card is the Panel atom with the wizard's roomier padding. */
export const Card = ({ children, style }) => <Panel style={{ padding: 18, ...style }}>{children}</Panel>;

const NumberField = ({ value, onChange, prefix, min = 0, step = 1, width = 150, placeholder }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.bg, border: `1px solid ${T.field}`, borderRadius: 10, padding: "0 12px", minHeight: TAP, width }}>
    {prefix && <span style={{ ...mono, fontSize: FS.md, color: T.mut }}>{prefix}</span>}
    <input type="number" inputMode="numeric" min={min} step={step} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...mono, fontSize: FS.md, background: "transparent", color: T.ink, border: "none", outline: "none", width: "100%", minWidth: 0 }} />
  </label>
);

/** A literacy pill (PRD §2). Always rendered BEFORE the choice it talks about. */
export const Pill = ({ children, tone = T.amber }) => (
  <div style={{
    ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.body, marginTop: 10,
    padding: "11px 13px", background: `${tone}0f`, border: `1px solid ${tone}55`,
    borderRadius: 10, borderLeft: `3px solid ${tone}`,
  }}>{children}</div>
);

const Question = ({ n, of, title, children }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ ...sans, fontSize: FS.xs, color: T.dim, letterSpacing: "0.1em" }}>QUESTION {n} OF {of}</div>
    <div style={{ ...sans, fontSize: FS.lg, fontWeight: FW.bold, color: T.ink, marginTop: 4, lineHeight: LH.tight }}>{title}</div>
    {children}
  </div>
);

/* ====================================================================
   CAPITAL ONBOARDING — PRD §3
   Three questions, and the per-trade limit is derived from the answers
   rather than handed down. Every pill appears while the user is still
   deciding: a limit explained afterwards reads as a punishment.
==================================================================== */

export function CapitalOnboarding({ initial = {}, onDone }) {
  // NOTHING IS PRE-ANSWERED (PRD §5). The fields start empty and stay empty
  // until the user types or taps. The suggested figures are offered as a
  // visible, tappable suggestion below the box — a starting point he can see
  // himself accepting — never as a value already sitting in the field, which is
  // the app answering its own question and then quoting the answer back to him.
  const [capital, setCapital] = useState(initial.capital ?? "");
  const [concurrent, setConcurrent] = useState(initial.concurrentTarget ?? "");
  const [savings, setSavings] = useState(initial.savings ?? "");
  const [wantOverride, setWantOverride] = useState(false);
  const [ovAmount, setOvAmount] = useState("");
  const [ovReason, setOvReason] = useState("");

  const override = wantOverride && ovAmount ? { perTrade: +ovAmount, reason: ovReason } : null;
  // An empty box is NULL, not a 1 and not a 0. `+concurrent || 1` turned "not
  // answered yet" into "one position at a time" and then the app wrote a pill
  // about it — inventing the answer and then explaining it back to him.
  const answers = {
    tradingCapital: capital === "" ? null : +capital || null,
    concurrentTarget: concurrent === "" ? null : +concurrent || null,
    savings: savings === "" ? null : +savings,
    override,
  };
  const limits = sizing(answers);
  const ready = limits.answered;
  const reasonShort = wantOverride && ovAmount && ovReason.trim().length < RULES.minOverrideReasonChars;

  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: `24px 16px ${BADGE_SAFE}px` }}>
      <Label style={EYEBROW}>Setting up · paper trading only</Label>
      <h1 style={{ ...sans, fontSize: FS.xl, fontWeight: FW.bold, color: T.ink, margin: "8px 0 6px", lineHeight: LH.tight }}>
        First, how much are we working with?
      </h1>
      <p style={{ ...sans, fontSize: FS.md, color: T.mut, lineHeight: LH.body, margin: 0 }}>
        Every limit in this app is worked out from these answers, not handed to you. No money moves:
        trades are simulated on a paper account.
      </p>

      <Card style={{ marginTop: 20 }}>
        <Question n={1} of={3} title="How much money is set aside for trading?">
          <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 6, lineHeight: LH.body }}>
            Not your savings — just the part you have decided to trade with.
          </div>
          <div style={{ marginTop: 10 }}>
            <NumberField value={capital} onChange={setCapital} prefix="$" min={100} step={500}
              placeholder="amount" />
          </div>
          {capital === "" && (
            <button onClick={() => setCapital(RULES.suggestedTradingCapital)}
              style={{ ...sans, fontSize: FS.sm, minHeight: TAP, marginTop: 6, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer", textAlign: "left" }}>
              No idea? Start from {money(RULES.suggestedTradingCapital)} — you can change it any time.
            </button>
          )}
        </Question>

        <Question n={2} of={3} title="How many trades do you expect to have open at the same time?">
          <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 6, lineHeight: LH.body }}>
            This is what splits your capital into a per-trade limit.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 6].map((n) => (
              <Chip key={n} on={+concurrent === n} onClick={() => setConcurrent(n)} style={{ flex: "1 1 auto", minWidth: 92 }}>{n}</Chip>
            ))}
          </div>
        </Question>

        <Question n={3} of={3} title="Total savings — optional, and you can skip it.">
          <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 6, lineHeight: LH.body }}>
            Only used to tell you if the trading pot is a large slice of everything you have. It is never sent anywhere.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <NumberField value={savings} onChange={setSavings} prefix="$" min={0} step={1000} />
            {savings !== "" && (
              <button onClick={() => setSavings("")} style={{ ...sans, fontSize: FS.md, minHeight: TAP, padding: "0 12px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>Skip this</button>
            )}
          </div>
        </Question>

        {/* Pills come BEFORE the confirm button, never after it (PRD §2). */}
        {limits.pills.map((p) => <Pill key={p.id}>{p.text}</Pill>)}

        <div style={{ marginTop: 18, padding: "14px 16px", background: T.bg, borderRadius: 10, border: `1px solid ${limits.answered ? T.line : T.blue}` }}>
          <div style={{ ...sans, fontSize: FS.xs, color: limits.answered ? T.dim : T.blue, letterSpacing: "0.1em" }}>
            {limits.answered ? "YOUR LIMITS" : "WHAT THE ANSWERS WOULD GIVE YOU"}
          </div>
          <div style={{ ...sans, fontSize: FS.md, color: T.ink, fontWeight: FW.bold, marginTop: 6 }}>
            {money(limits.perTradeLimit)} at risk per trade
          </div>
          <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 4, lineHeight: LH.body }}>
            and no more than {money(limits.totalLimit)} at risk across everything at once
            ({pctText(RULES.totalExposurePct)} of your capital). The app will refuse an order that breaks either one.
          </div>
          {!limits.answered && (
            <div style={{ ...sans, fontSize: FS.sm, color: T.blue, marginTop: 6, lineHeight: LH.body }}>
              Worked from an example, because both questions above are still open. Answer them and these become yours.
            </div>
          )}
        </div>

        {/* An override is allowed, but it costs a written reason (PRD §3). */}
        {!wantOverride ? (
          <button onClick={() => { setWantOverride(true); setOvAmount(Math.round(limits.suggestedPerTrade)); }}
            style={{ ...sans, fontSize: FS.md, minHeight: TAP, marginTop: 10, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>
            I want a different per-trade limit
          </button>
        ) : (
          <div style={{ marginTop: 14 }}>
            <Pill tone={T.blue}>
              You can set your own limit. Write down why: the reason is stored with every position you
              open under it, so the next you can read the thinking instead of guessing at it.
            </Pill>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <NumberField value={ovAmount} onChange={setOvAmount} prefix="$" min={1} step={50} width={140} />
              <button onClick={() => { setWantOverride(false); setOvAmount(""); setOvReason(""); }}
                style={{ ...sans, fontSize: FS.md, minHeight: TAP, padding: "0 12px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>Cancel</button>
            </div>
            <textarea value={ovReason} onChange={(e) => setOvReason(e.target.value)} rows={3}
              placeholder="Why this limit and not the suggested one?"
              style={{ ...sans, width: "100%", boxSizing: "border-box", marginTop: 10, fontSize: FS.md, lineHeight: LH.body,
                background: T.bg, color: T.ink, border: `1px solid ${reasonShort ? T.amber : T.field}`, borderRadius: 10, padding: "12px 13px", resize: "vertical" }} />
            <div style={{ ...sans, fontSize: FS.sm, color: reasonShort ? T.amber : T.mut, marginTop: 6 }}>
              {reasonShort
                ? `${RULES.minOverrideReasonChars - ovReason.trim().length} more characters and the override is accepted.`
                : `At least ${RULES.minOverrideReasonChars} characters.`}
            </div>
          </div>
        )}

        <button onClick={() => onDone(answers)} disabled={!ready}
          style={{ ...sans, width: "100%", minHeight: 56, marginTop: 20, marginBottom: BADGE_BTN_GAP, fontSize: FS.md, fontWeight: FW.bold, borderRadius: 10,
            cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5,
            background: T.amber, color: T.onAccent, border: "none" }}>
          {ready ? "Start" : !(+capital > 0) ? "Still needed: how much you are trading with" : "Still needed: how many positions at once"}
        </button>
        <div style={{ ...sans, fontSize: FS.xs, color: T.dim, marginTop: 12, textAlign: "center", lineHeight: LH.body }}>
          You can change all of this later in Settings. Educational software on a paper account, not financial advice.
        </div>
      </Card>
    </div>
  );
}

/* ====================================================================
   THE POSITIONS SENTENCE — Home's status line, kept (round 2): the bottom bar's Positions badge reads it aloud, so
   what Home said is still said where its count now is.
==================================================================== */

/** One line. Generated from the numbers, never hand-written per case.
 *
 * >>> "NOTHING TO DO" IS DERIVED FROM THE SAME LIST THE ROWS ARE (P9, TASK 2).
 * <<< `attention` counts only the positions a RULE has fired on. A position at
 * the `watch` level is not one of them, so this line said *"all inside the
 * plan. Nothing to do."* directly above a row reading *"Losing: check the
 * reason you opened it"*. `looks` is everything that is not on plan
 * (`attentionCount()` in rules.js), and this line may not call the book quiet
 * while it is above zero. */
export function statusLine({ positions = [], attention = 0, looks = null, marketReady = true, closing = 0 }) {
  if (!positions.length) {
    return marketReady
      ? "No open positions. Nothing to manage — today is for looking."
      : "No open positions, and market data is still loading.";
  }
  const n = positions.length;
  const plural = n === 1 ? "position" : "positions";
  // A CLOSE ALREADY SENT IS NOT A DECISION (PR #47, TASK 0f): it is counted as what it is, an order working.
  const c = Number(closing) || 0;
  const working = c > 0 ? ` ${c} close${c === 1 ? "" : "s"} working.` : "";
  if (attention > 0) {
    return (attention === 1
      ? `1 of your ${n} ${plural} needs a decision today.`
      : `${attention} of your ${n} ${plural} need a decision today.`) + working;
  }
  // `looks` is optional so an older caller reads exactly as it did; when it is
  // given it decides, because a row that says "check this" outranks a headline.
  const look = Number(looks) || 0;
  if (look > 0) {
    return (look === 1
      ? `1 of your ${n} ${plural} is worth a look — the row below says why.`
      : `${look} of your ${n} ${plural} are worth a look — the rows below say why.`) + working;
  }
  if (c > 0) return `${n} ${plural} open.${working} Alpaca has the order; nothing to decide.`;
  return `${n} ${plural} open, all inside the plan. Nothing to do.`;
}

/* ====================================================================
   SCREEN 4 — CONFIRM (PRD §5)

   What is being sent, the risk checks in plain English with real numbers, and
   the exit plan stated as already decided — not offered. The gate runs AFTER
   the tap: this screen shows what it measures, the tap makes it decide.
==================================================================== */

/**
 * The checks, in the order the gate applies them, read off the gate's OWN
 * output — `evaluateTrade` stays the only implementation of the rules, this
 * only puts English around the numbers it returns.
 */
export function gateChecklist(result, proposal = {}) {
  if (!result) return [];
  const L = result.limits || {};
  const blocked = (code) => (result.violations || []).some((v) => v.code === code);
  const cap = L.tradingCapital || 0;
  const unpriceable = (result.violations || []).find((v) => v.code === "UNPRICEABLE");
  const rows = [
    {
      id: "defined",
      ok: !blocked("UNDEFINED_RISK") && !blocked("NO_STRUCTURE") && !blocked("UNPRICEABLE"),
      // A maximum loss of zero is not a worst case you can read — it is one the
      // app could not compute, and this row is where that has to be said rather
      // than printed as $0 next to a tick. The sentence is the gate's own.
      text: unpriceable
        ? unpriceable.message
        : `The worst case is a number you can read: ${money(L.tradeRisk)}. Every option sold is covered by ` +
          `one bought, so the loss cannot run past it.`,
    },
    // FREE SIZING (PR #41, TASK 4): the gate did not measure these two, so
    // the rows say so instead of quoting a limit nothing enforced.
    L.sizingFree ? {
      id: "per-trade", ok: true,
      text: `${money(L.tradeRisk)} at risk. Free sizing is on: no per-trade limit is applied.`,
    } : {
      id: "per-trade",
      ok: !blocked("PER_TRADE_LIMIT"),
      // "your limit" only when it IS his. With the capital questions still open
      // this is the suggested figure, and the confirm screen is the last place
      // that should blur the difference.
      text: `${money(L.tradeRisk)} at risk against ${limitOwner(L)} ${money(L.perTrade)} per-trade limit` +
        (cap ? ` — ${pctText(L.tradeRisk / cap)} of ${L.answered ? "your" : "an assumed"} ${money(cap)} of trading capital.` : "."),
    },
    L.sizingFree ? {
      id: "total", ok: true,
      text: `${money(L.openRisk)} is already at risk in open positions; with this one ${money(L.totalAfter)}. ` +
        `Free sizing is on: no ceiling is applied.`,
    } : {
      id: "total",
      ok: !blocked("TOTAL_EXPOSURE"),
      text: `${money(L.openRisk)} is already at risk in open positions. With this one that becomes ` +
        `${money(L.totalAfter)}, against a ceiling of ${money(L.total)}.`,
    },
    {
      id: "entry-dte",
      ok: !blocked("ENTRY_DTE"),
      text: `${Math.round(Number(proposal.dte) || 0)} days to expiration at entry, against a floor of ` +
        `${RULES.minEntryDTE}. The exit rule fires at ${RULES.exitDTE} days, so this has ` +
        `${Math.max(0, Math.round((Number(proposal.dte) || 0) - RULES.exitDTE))} days to work.`,
    },
    {
      id: "paper",
      ok: !blocked("PAPER_MODE"),
      text: L.paper?.verified
        ? `Paper account confirmed: ${L.paper.why}. No real money can be reached from here.`
        : `Paper mode is NOT confirmed: ${L.paper?.why || "the account could not be checked"}. An order that ` +
          `cannot be proven to be paper does not leave.`,
    },
  ];
  return rows;
}
