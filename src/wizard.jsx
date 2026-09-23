// ============================================================================
// src/wizard.jsx — THE APP SHELL (PRD §5).
//
// Home is not a tab inside the app. It is the front door: the first thing you
// see, and the thing you come back to.
//
// Screens in this file:
//   · CapitalOnboarding — first run, PRD §3. Capital, positions at once, savings.
//   · WizardOpen        — Home. Greeting, one line of status, TWO doors: my
//                         positions, and Find (App.jsx's first step).
//   · ConfirmSteps      — the confirm step on Build: what is being sent, the
//                         checks, the exit plan.
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
import { Compass, Briefcase, ArrowLeft, SlidersHorizontal, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { T, BADGE_SAFE, BADGE_BTN_GAP } from "./theme.js";
import { RULES, sizing, money, pctText, ruleBadge, limitOwner, NO_CEILING } from "./rules.js";
import { BandThumbnail, payoffBands, UnifiedFigure, exitPlanSentence, exitPlanDetail, price } from "./visuals.jsx";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sans = { fontFamily: "ui-sans-serif, system-ui" };
const TAP = 52; // minimum tap target, in px — a thumb, not a mouse pointer

/* ============================== atoms ============================== */

export const Card = ({ children, style }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18, ...style }}>{children}</div>
);

const Eyebrow = ({ children }) => (
  <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber, textTransform: "uppercase" }}>{children}</div>
);

/** A full-width choice. Big enough for a thumb, legible without a title. */
const BigChoice = ({ icon: I, title, sub, onClick, color = T.amber, primary }) => (
  <button onClick={onClick}
    style={{
      ...sans, display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
      minHeight: 72, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
      background: primary ? color : T.panel, color: primary ? T.onAccent : T.ink,
      border: `1.5px solid ${primary ? color : T.line}`,
    }}>
    <I size={22} style={{ flexShrink: 0, color: primary ? T.onAccent : color }} />
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{title}</span>
      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: primary ? T.onAccent : T.mut, opacity: primary ? 0.9 : 1 }}>{sub}</span>
    </span>
  </button>
);

/** One option out of a small set. Wraps on a phone, sits in a row on a desk. */
const Chip = ({ children, on, onClick, color = T.amber }) => (
  <button onClick={onClick}
    style={{
      ...sans, fontSize: 14, fontWeight: on ? 700 : 500, minHeight: TAP, padding: "10px 16px",
      borderRadius: 10, cursor: "pointer", flex: "1 1 auto", minWidth: 92,
      background: on ? color : "transparent", color: on ? T.onAccent : T.ink,
      border: `1.5px solid ${on ? color : T.line}`,
    }}>{children}</button>
);

const NumberField = ({ value, onChange, prefix, min = 0, step = 1, width = 150, placeholder }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", minHeight: TAP, width }}>
    {prefix && <span style={{ ...mono, fontSize: 15, color: T.mut }}>{prefix}</span>}
    <input type="number" inputMode="numeric" min={min} step={step} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...mono, fontSize: 16, background: "transparent", color: T.ink, border: "none", outline: "none", width: "100%", minWidth: 0 }} />
  </label>
);

/** A literacy pill (PRD §2). Always rendered BEFORE the choice it talks about. */
export const Pill = ({ children, tone = T.amber }) => (
  <div style={{
    ...sans, fontSize: 13, lineHeight: 1.5, color: T.body, marginTop: 10,
    padding: "11px 13px", background: `${tone}0f`, border: `1px solid ${tone}55`,
    borderRadius: 10, borderLeft: `3px solid ${tone}`,
  }}>{children}</div>
);

const Question = ({ n, of, title, children }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ ...mono, fontSize: 10.5, color: T.dim, letterSpacing: "0.1em" }}>QUESTION {n} OF {of}</div>
    <div style={{ ...sans, fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 4, lineHeight: 1.35 }}>{title}</div>
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
      <Eyebrow>Setting up · paper trading only</Eyebrow>
      <h1 style={{ ...sans, fontSize: 27, fontWeight: 800, color: T.ink, margin: "8px 0 6px", lineHeight: 1.2 }}>
        First, how much are we working with?
      </h1>
      <p style={{ ...sans, fontSize: 15, color: T.mut, lineHeight: 1.55, margin: 0 }}>
        Every limit in this app is worked out from these answers, not handed to you. No money moves:
        trades are simulated on a paper account.
      </p>

      <Card style={{ marginTop: 20 }}>
        <Question n={1} of={3} title="How much money is set aside for trading?">
          <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
            Not your savings — just the part you have decided to trade with.
          </div>
          <div style={{ marginTop: 10 }}>
            <NumberField value={capital} onChange={setCapital} prefix="$" min={100} step={500}
              placeholder="amount" />
          </div>
          {capital === "" && (
            <button onClick={() => setCapital(RULES.suggestedTradingCapital)}
              style={{ ...sans, fontSize: 13.5, minHeight: TAP, marginTop: 6, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer", textAlign: "left" }}>
              No idea? Start from {money(RULES.suggestedTradingCapital)} — you can change it any time.
            </button>
          )}
        </Question>

        <Question n={2} of={3} title="How many trades do you expect to have open at the same time?">
          <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
            This is what splits your capital into a per-trade limit.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 6].map((n) => (
              <Chip key={n} on={+concurrent === n} onClick={() => setConcurrent(n)}>{n}</Chip>
            ))}
          </div>
        </Question>

        <Question n={3} of={3} title="Total savings — optional, and you can skip it.">
          <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
            Only used to tell you if the trading pot is a large slice of everything you have. It is never sent anywhere.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <NumberField value={savings} onChange={setSavings} prefix="$" min={0} step={1000} />
            {savings !== "" && (
              <button onClick={() => setSavings("")} style={{ ...sans, fontSize: 14, minHeight: TAP, padding: "0 12px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>Skip this</button>
            )}
          </div>
        </Question>

        {/* Pills come BEFORE the confirm button, never after it (PRD §2). */}
        {limits.pills.map((p) => <Pill key={p.id}>{p.text}</Pill>)}

        <div style={{ marginTop: 18, padding: "14px 16px", background: T.bg, borderRadius: 10, border: `1px solid ${limits.answered ? T.line : T.blue}` }}>
          <div style={{ ...mono, fontSize: 10.5, color: limits.answered ? T.dim : T.blue, letterSpacing: "0.1em" }}>
            {limits.answered ? "YOUR LIMITS" : "WHAT THE ANSWERS WOULD GIVE YOU"}
          </div>
          <div style={{ ...sans, fontSize: 16, color: T.ink, fontWeight: 700, marginTop: 6 }}>
            {money(limits.perTradeLimit)} at risk per trade
          </div>
          <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
            and no more than {money(limits.totalLimit)} at risk across everything at once
            ({pctText(RULES.totalExposurePct)} of your capital). The app will refuse an order that breaks either one.
          </div>
          {!limits.answered && (
            <div style={{ ...sans, fontSize: 12.5, color: T.blue, marginTop: 6, lineHeight: 1.5 }}>
              Worked from an example, because both questions above are still open. Answer them and these become yours.
            </div>
          )}
        </div>

        {/* An override is allowed, but it costs a written reason (PRD §3). */}
        {!wantOverride ? (
          <button onClick={() => { setWantOverride(true); setOvAmount(Math.round(limits.suggestedPerTrade)); }}
            style={{ ...sans, fontSize: 14, minHeight: TAP, marginTop: 10, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>
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
                style={{ ...sans, fontSize: 14, minHeight: TAP, padding: "0 12px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>Cancel</button>
            </div>
            <textarea value={ovReason} onChange={(e) => setOvReason(e.target.value)} rows={3}
              placeholder="Why this limit and not the suggested one?"
              style={{ ...sans, width: "100%", boxSizing: "border-box", marginTop: 10, fontSize: 16, lineHeight: 1.45,
                background: T.bg, color: T.ink, border: `1px solid ${reasonShort ? T.amber : T.line}`, borderRadius: 10, padding: "12px 13px", resize: "vertical" }} />
            <div style={{ ...sans, fontSize: 12.5, color: reasonShort ? T.amber : T.mut, marginTop: 6 }}>
              {reasonShort
                ? `${RULES.minOverrideReasonChars - ovReason.trim().length} more characters and the override is accepted.`
                : `At least ${RULES.minOverrideReasonChars} characters.`}
            </div>
          </div>
        )}

        <button onClick={() => onDone(answers)} disabled={!ready}
          style={{ ...sans, width: "100%", minHeight: 56, marginTop: 20, marginBottom: BADGE_BTN_GAP, fontSize: 16, fontWeight: 700, borderRadius: 10,
            cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5,
            background: T.amber, color: T.onAccent, border: "none" }}>
          {ready ? "Start" : !(+capital > 0) ? "Still needed: how much you are trading with" : "Still needed: how many positions at once"}
        </button>
        <div style={{ ...sans, fontSize: 12, color: T.dim, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
          You can change all of this later in Settings. Educational software on a paper account, not financial advice.
        </div>
      </Card>
    </div>
  );
}

/* ====================================================================
   SCREEN 1 — OPEN
   Greeting, one line of status, three choices. Once positions exist the
   front page leads with what needs attention today, and the three
   choices stay right underneath: the wizard is one tap away, always.
==================================================================== */

const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
};

/** One line. Generated from the numbers, never hand-written per case.
 *
 * >>> "NOTHING TO DO" IS DERIVED FROM THE SAME LIST THE ROWS ARE (P9, TASK 2).
 * <<< `attention` counts only the positions a RULE has fired on. A position at
 * the `watch` level is not one of them, so this line said *"all inside the
 * plan. Nothing to do."* directly above a row reading *"Losing: check the
 * reason you opened it"*. `looks` is everything that is not on plan
 * (`attentionCount()` in rules.js), and this line may not call the book quiet
 * while it is above zero. */
export function statusLine({ positions = [], attention = 0, looks = null, marketReady = true }) {
  if (!positions.length) {
    return marketReady
      ? "No open positions. Nothing to manage — today is for looking."
      : "No open positions, and market data is still loading.";
  }
  const n = positions.length;
  const plural = n === 1 ? "position" : "positions";
  if (attention > 0) {
    return attention === 1
      ? `1 of your ${n} ${plural} needs a decision today.`
      : `${attention} of your ${n} ${plural} need a decision today.`;
  }
  // `looks` is optional so an older caller reads exactly as it did; when it is
  // given it decides, because a row that says "check this" outranks a headline.
  const look = Number(looks) || 0;
  if (look > 0) {
    return look === 1
      ? `1 of your ${n} ${plural} is worth a look — the row below says why.`
      : `${look} of your ${n} ${plural} are worth a look — the rows below say why.`;
  }
  return `${n} ${plural} open, all inside the plan. Nothing to do.`;
}

export function WizardOpen({ positions = [], posAlerts = [], attention = 0, looks = null, marketReady = true,
  onPositions, onFind, onSettings, barsFor }) {
  const hasPositions = positions.length > 0;
  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: `22px 16px ${BADGE_SAFE}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h1 style={{ ...sans, fontSize: 27, fontWeight: 800, color: T.ink, margin: 0, lineHeight: 1.2 }}>{greeting()}</h1>
          <p style={{ ...sans, fontSize: 15.5, color: T.mut, lineHeight: 1.5, margin: "8px 0 0" }}>
            {statusLine({ positions, attention, looks, marketReady })}
          </p>
        </div>
        <button onClick={onSettings} title="Settings"
          style={{ ...sans, minHeight: TAP, minWidth: TAP, borderRadius: 10, background: "transparent", border: `1px solid ${T.line}`, color: T.mut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* With positions open, what needs attention IS the front page. */}
      {hasPositions && (
        <Card style={{ marginTop: 18, borderColor: attention ? `${T.red}66` : (Number(looks) || 0) ? `${T.amber}66` : T.line }}>
          <Eyebrow>{attention ? "Needs attention today" : (Number(looks) || 0) ? "Worth a look" : "Your positions"}</Eyebrow>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {posAlerts.map(({ p, pnl, dteLeft, level, label, spotNow }) => {
              const c = level === "action" ? T.red : level === "watch" ? T.amber : T.green;
              return (
                <button key={p.id} onClick={onPositions}
                  style={{ ...sans, display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left",
                    minHeight: 64, padding: "12px 13px", background: T.bg, border: `1px solid ${c}44`, borderRadius: 10, cursor: "pointer" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: c, flexShrink: 0 }} />
                  {/* The band thumbnail is the list visual everywhere (PRD §6). */}
                  {p.legs && (
                    <BandThumbnail bands={payoffBands({ legs: p.legs, entryNet: p.entryNet, spot: spotNow ?? p.entrySpot })}
                      bars={barsFor ? barsFor(p.ticker) : []} width={80} height={34} />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.ink }}>{p.ticker} · {p.name}</span>
                    <span style={{ display: "block", fontSize: 13, color: T.mut, marginTop: 2 }}>{label} · {dteLeft} days left</span>
                  </span>
                  <span style={{ ...mono, fontSize: 15, fontWeight: 700, color: pnl == null ? T.dim : pnl >= 0 ? T.green : T.red, flexShrink: 0 }}>
                    {pnl == null ? "…" : `${pnl < 0 ? "-" : "+"}$${Math.abs(pnl).toFixed(0)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* TWO doors. "Find a trade" goes straight to the Find step: the guided
          door's questions, its two roads and its "Nothing today" screen are
          gone at the owner's request (PR #40, TASK 1, 23 Sep 2026). */}
      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <BigChoice icon={Briefcase} color={T.blue} onClick={onPositions}
          title="My positions"
          sub={hasPositions ? `${positions.length} open · profit target, stop and exit day for each` : "Nothing open yet"} />
        <BigChoice icon={Compass} color={T.amber} primary onClick={onFind}
          title="Find a trade"
          sub="Every market, one ranked list" />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>PAPER · {ruleBadge()}</span>
      </div>
    </div>
  );
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

const CheckRow = ({ ok, text }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
    {ok
      ? <ShieldCheck size={17} style={{ color: T.green, flexShrink: 0, marginTop: 1 }} />
      : <ShieldAlert size={17} style={{ color: T.red, flexShrink: 0, marginTop: 1 }} />}
    <span style={{ ...sans, fontSize: 13.5, color: ok ? T.body : T.ink, lineHeight: 1.5 }}>{text}</span>
  </div>
);

/**
 * THE CONFIRM STEP — the checks in plain English, the exit plan stated as
 * already decided, and the one button that opens the position.
 *
 * It is a BLOCK, not a screen, because it now lives at the bottom of the Build
 * screen. "Take this road" used to jump from the two roads straight to a
 * confirm page with a send button on it, which meant the guided flow could
 * reach an order without ever passing the desk where the trade can actually be
 * looked at — the chain, the legs, the greeks. The road now hands off to Build
 * and this block is the end of that screen, so there is ONE route to an order
 * and it runs through the place where the trade is visible.
 *
 * Nothing here decides anything: `gateChecklist()` puts English around what
 * `evaluateTrade()` already returned.
 *
 * @param candidate  { ticker, name, legs, expKey, dte, risk, maxProfit, entryNet, spot }
 *                   `risk` and `maxProfit` are the figures for ONE combination.
 * @param contracts  how many combinations the order will carry. This screen
 *                   used to say "One contract of each" over a ticket that could
 *                   send seven, so the totals below are the per-combination
 *                   figures times this number and the card says which is which.
 * @param preview    the gate's reading BEFORE the tap
 * @param result     the gate's answer AFTER the tap, when there is one
 * @param heading    false on Build, where the trade's name is already above
 */
export function ConfirmSteps({
  // THE DRIFT HAS NO DEFAULT. It used to be 0 here and no caller ever passed
  // one, so the chart under a trade was drawn — and its sentence computed —
  // against a market that goes nowhere, while the CHANCE printed elsewhere on
  // the same screen came from a different assumption entirely.
  /* AND NEITHER DOES THE VOLATILITY. `sigma = 0.3` was a number with no home
     and no provenance — not the value of any rule, so the rule-literal sweep
     could never name it — sitting under a picture of a trade priced at the
     chain's implied volatility. It is null with none, and `UnifiedFigure`
     draws what it can and says what it cannot. */
  candidate, preview, result, bars = [], sigma = null, driftAnnual = null,
  busy, onConfirm, onDesk, heading = true, showFigure = true, contracts = 1,
  /* THE WARNINGS APPEAR ONCE ON A PAGE. On Build they are in the collapsed
     panel above this card, with the count in its summary line; printing them
     again here is how the CONFLICT paragraph came to be on one screen four
     times. A caller with no panel of its own leaves this true. */
  showWarnings = true,
}) {
  if (!candidate) return null;
  const c = candidate;
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const totalRisk = Number(c.risk) * n;
  const shown = result || preview;
  const rows = gateChecklist(shown, { dte: c.dte });
  const refused = !!(result && !result.pass);

  return (
    <div>
      {heading && (
        <>
          <Eyebrow>Confirm</Eyebrow>
          <h1 style={{ ...sans, fontSize: 25, fontWeight: 800, color: T.ink, margin: "6px 0 4px", lineHeight: 1.25 }}>
            {c.ticker} · {c.name}
          </h1>
          <p style={{ ...sans, fontSize: 15, color: T.mut, lineHeight: 1.55, margin: 0 }}>
            {c.legs.length} legs, expiring {c.expKey || `in ${Math.round(c.dte)} days`}. Risking {money(totalRisk)}
            {Number.isFinite(c.maxProfit) ? ` to make up to ${money(c.maxProfit * n)}.` : `, with ${NO_CEILING} on what it can make.`}
          </p>
        </>
      )}

      {showFigure && <Card style={{ marginTop: 14 }}>
        <Eyebrow>What this looks like</Eyebrow>
        <div style={{ marginTop: 10 }}>
          <UnifiedFigure legs={c.legs} entryNet={c.entryNet} spot={c.spot} bars={bars}
            dte={c.dte} sigma={sigma} driftAnnual={driftAnnual} ticker={c.ticker} height={340} />
        </div>
      </Card>}

      <Card style={{ marginTop: 12 }}>
        <Eyebrow>What is being sent</Eyebrow>
        <div style={{ ...mono, fontSize: 13, color: T.ink, marginTop: 8, lineHeight: 1.7 }}>
          {c.legs.map((l, i) => (
            <div key={i}>
              {l.side > 0 ? "BUY" : "SELL"} {l.qty * n} × {c.ticker} {price(l.strike)} {l.type === "call" ? "call" : "put"}
            </div>
          ))}
        </div>
        {/* WHAT IS BEING SENT IS THE SIZE ON SCREEN. This said "One contract of
            each" underneath a ticket whose quantity field could say seven —
            the app describing an order it was not about to send. */}
        {/* THE SIZE, AND NOTHING ELSE (P9, TASK 3). "on a paper account" is
            the header badge, and "nothing is sent until you tap below" is the
            button four lines down saying so itself. What is left is the fact
            only this line carries: every figure above is for all of them. */}
        <div style={{ ...sans, fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
          {n === 1
            ? "One combination. Nothing is sent until you tap below."
            : `${n} combinations — every figure above is for all ${n}.`}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Eyebrow>{refused ? "The gate refused this" : "The checks that run when you tap"}</Eyebrow>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {rows.map((r) => <CheckRow key={r.id} ok={r.ok} text={r.text} />)}
        </div>
        {showWarnings && (shown?.warnings || []).map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
            <AlertTriangle size={17} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />
            <span style={{ ...sans, fontSize: 13.5, color: T.body, lineHeight: 1.5 }}>{w.message}</span>
          </div>
        ))}
        {/* A REFUSAL AND A REASSURANCE MAY NOT SHARE A SHEET EITHER (P9, TASK 1).
            `refused` renders directly below; "none of them stops the order"
            over "The order was not sent" is the same contradiction the trade
            card carried. The count and the pointer stay — only the clause that
            argues with the refusal below it goes. */}
        {!showWarnings && (shown?.warnings || []).length > 0 && (
          <div style={{ ...sans, fontSize: 12.5, color: T.mut, marginTop: 12, lineHeight: 1.5 }}>
            {(shown.warnings || []).length} warning{(shown.warnings || []).length === 1 ? "" : "s"} apply to this
            trade. {(shown.warnings || []).length === 1 ? "It is" : "They are"} in the warnings panel on
            the step this sheet closes back onto, written once{refused
              ? " — the refusal below is what decides."
              : " — none of them stops the order."}
          </div>
        )}
        {refused && (
          <Pill tone={T.red}>
            The order was not sent. {shown.violations.map((v) => v.message).join(" ")}
          </Pill>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Eyebrow>The exit plan — decided now, not later</Eyebrow>
        <div style={{ ...sans, fontSize: 16, fontWeight: 700, color: T.ink, marginTop: 8, lineHeight: 1.4 }}>
          {exitPlanSentence()}
        </div>
        <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
          {exitPlanDetail(c.maxProfit, contracts)}
        </div>
      </Card>

      <button onClick={onConfirm} disabled={busy || refused}
        style={{ ...sans, width: "100%", minHeight: 58, marginTop: 18, marginBottom: BADGE_BTN_GAP, fontSize: 16.5, fontWeight: 700, borderRadius: 10,
          cursor: busy ? "wait" : refused ? "not-allowed" : "pointer", opacity: busy ? 0.6 : refused ? 0.45 : 1,
          background: T.amber, color: T.onAccent, border: "none" }}>
        {busy ? "Checking…" : refused ? "Blocked by the risk gate" : `Open this on paper · ${money(totalRisk)} at risk${n > 1 ? ` (${n} × ${money(c.risk)})` : ""}`}
      </button>

      {refused && onDesk && (
        <button onClick={onDesk}
          style={{ ...sans, fontSize: 14, minHeight: TAP, marginTop: 8, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer", textAlign: "left", width: "100%" }}>
          Change the trade above and try again →
        </button>
      )}

      <div style={{ ...sans, fontSize: 12, color: T.dim, marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
        Paper trading only. Educational software, not financial advice.
      </div>
    </div>
  );
}

