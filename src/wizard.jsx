// ============================================================================
// src/wizard.jsx — THE APP SHELL (PRD §5).
//
// The wizard is not a tab inside the app. It is the front door: the first thing
// you see, and the thing you come back to. The desk behind "Full desk" is
// three places — Build, Positions, Journal — and everything else there
// (Radar, Shortlist, market levels, history) is evidence for the trade on the
// Build screen rather than a destination of its own.
//
// Screens in this file:
//   · CapitalOnboarding — first run, PRD §3. Capital, positions at once, savings.
//   · WizardOpen        — screen 1. Greeting, one line of status, TWO doors.
//   · FindOpportunities — screen 2. Basket, budget and time, three drivers,
//                         and "Decide for me" as the last button rather than a
//                         door of its own.
//   · WizardCandidates  — screen 3. The verdict: what was examined, the answers
//                         read back, then two roads with their evidence.
//   · WizardConfirm     — screen 4. What is being sent, the checks, the exit plan.
//   · NothingToday      — screen 5. A designed answer, not an error state.
//
// Written for a phone. No hover anywhere: every affordance is a tap target of
// at least 52px, inputs are 16px so iOS does not zoom on focus, and everything
// stacks in one column and widens on a desk.
// ============================================================================
import React, { useState } from "react";
import { Compass, Briefcase, Bell, ArrowLeft, SlidersHorizontal, ShieldCheck, ShieldAlert, AlertTriangle, Sparkles } from "lucide-react";
import { T, BADGE_SAFE, BADGE_BTN_GAP } from "./theme.js";
import { RULES, sizing, money, pctText, perTradeCapLabel, ruleBadge, capitalSourceNote, perTradeLimitPhrase, limitOwner, qualityFloorSentence } from "./rules.js";
import { BandThumbnail, Gauge, payoffBands, bandTakeaway, gaugeTakeaway, explainElement, UnifiedFigure, exitPlanSentence, exitPlanDetail, inTenPhrase, price } from "./visuals.jsx";
import { DRIVERS, DRIVER_PRESETS, presetOf, normaliseWeights } from "./signals.js";
import { WhyThisTrade } from "./why.jsx";

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

const BackLink = ({ onClick, label = "Back" }) => (
  <button onClick={onClick} style={{ ...sans, fontSize: 14, minHeight: TAP, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
    <ArrowLeft size={16} /> {label}
  </button>
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

/** One line. Generated from the numbers, never hand-written per case. */
export function statusLine({ positions = [], attention = 0, marketReady = true }) {
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
  return `${n} ${plural} open, all inside the plan. Nothing to do.`;
}

export function WizardOpen({ positions = [], posAlerts = [], attention = 0, marketReady = true,
  onPositions, onFind, onDesk, onSettings, barsFor }) {
  const hasPositions = positions.length > 0;
  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: `22px 16px ${BADGE_SAFE}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h1 style={{ ...sans, fontSize: 27, fontWeight: 800, color: T.ink, margin: 0, lineHeight: 1.2 }}>{greeting()}</h1>
          <p style={{ ...sans, fontSize: 15.5, color: T.mut, lineHeight: 1.5, margin: "8px 0 0" }}>
            {statusLine({ positions, attention, marketReady })}
          </p>
        </div>
        <button onClick={onSettings} title="Settings"
          style={{ ...sans, minHeight: TAP, minWidth: TAP, borderRadius: 10, background: "transparent", border: `1px solid ${T.line}`, color: T.mut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* With positions open, what needs attention IS the front page. */}
      {hasPositions && (
        <Card style={{ marginTop: 18, borderColor: attention ? `${T.red}66` : T.line }}>
          <Eyebrow>{attention ? "Needs attention today" : "Your positions"}</Eyebrow>
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

      {/* TWO doors, not three. "Decide for me" was never a third place to go:
          it is the last button of the second one, once the app knows what it is
          deciding with. A door that skips the questions can only skip them by
          inventing the answers, and this app does not invent answers. */}
      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <BigChoice icon={Briefcase} color={T.blue} onClick={onPositions}
          title="My positions"
          sub={hasPositions ? `${positions.length} open · profit target, stop and exit day for each` : "Nothing open yet"} />
        <BigChoice icon={Compass} color={T.amber} primary onClick={onFind}
          title="Find opportunities"
          sub="Choose the markets, say what matters, let it decide" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <button onClick={onDesk}
          style={{ ...sans, fontSize: 14, minHeight: TAP, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer" }}>
          Open the full desk →
        </button>
        <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>PAPER · {ruleBadge()}</span>
      </div>
    </div>
  );
}

/* ====================================================================
   SCREEN 2 — FIND OPPORTUNITIES

   One screen, three blocks, and the last button is the decision.

   1. BASKET   — which markets to consider. All five by default, because a
                 beginner has no reason to exclude one yet, and the ranking
                 later runs across whatever is left in it.
   2. BUDGET   — what you are willing to lose, and how long to give the idea.
                 NOTHING IS PRE-ANSWERED. The old screen shipped with $250 and
                 45 days already filled in, and the verdict then told the user
                 "the $250 you said you were willing to lose" when they had said
                 nothing at all. An app that invents your answer and then quotes
                 it back to you has stopped being trustworthy about anything.
   3. DRIVERS  — three sliders that always sum to 100. The old third question
                 offered three words; the words are still here, but now they SET
                 the sliders instead of replacing them, so the user watches "win
                 often" mean chance 60 / payout 15 / cost 25. That is the pill
                 (PRD §2): the choice explaining its own arithmetic, before it
                 is made rather than after.

   Then "Decide for me" — which is not a separate entrance any more. It is what
   this screen is for.
==================================================================== */

export const HORIZONS = [
  { days: RULES.minEntryDTE, label: "2–4 weeks", sub: "quick" },
  { days: RULES.targetEntryDTE, label: "1–2 months", sub: "usual" },
  { days: RULES.targetEntryDTE + 30, label: "2–3 months", sub: "patient" },
];
/** The three words, kept — but they now move the sliders (see DRIVER_PRESETS). */
export const PRIORITIES = [
  { id: "often", label: "Win often", sub: "More trades work out, each one pays less." },
  { id: "balanced", label: "Balanced", sub: "The middle of the two." },
  { id: "big", label: "Win big", sub: "Fewer work out, the ones that do pay more." },
];

/** A block heading. Numbered, so the screen reads as a sequence on a phone. */
const Block = ({ n, of, title, children }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ ...mono, fontSize: 10.5, color: T.dim, letterSpacing: "0.1em" }}>STEP {n} OF {of}</div>
    <div style={{ ...sans, fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 4, lineHeight: 1.35 }}>{title}</div>
    {children}
  </div>
);

/** One slider. The number next to it is the point: a weight you can read. */
const DriverSlider = ({ d, value, onChange }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
      <span style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: T.ink }}>{d.label}</span>
      <span style={{ ...mono, fontSize: 15, fontWeight: 800, color: T.amber }}>{value}</span>
    </div>
    <div style={{ ...sans, fontSize: 12.5, color: T.mut, marginTop: 2, lineHeight: 1.45 }}>{d.sub}</div>
    <input type="range" min={0} max={100} step={5} value={value}
      aria-label={d.label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", marginTop: 8, height: 28, accentColor: T.amber, cursor: "pointer" }} />
  </div>
);

/**
 * @param answers  { basket, risk, horizon, weights } — risk and horizon are
 *                 NULL until answered, and stay null. Never defaulted.
 * @param universe [{ tk, name }] the markets on offer.
 */
export function FindOpportunities({ answers, setAnswers, limits, universe = [], busy, err, onBack, onDecide }) {
  const { risk, horizon } = answers;
  // An UNSET basket means "all five, not narrowed yet". An EMPTY one means the
  // user has just deselected the last market, and it has to stay empty — the
  // old test for `.length` silently re-selected everything, so the "nothing is
  // selected" pill could never appear and the last chip would not turn off.
  const basket = Array.isArray(answers.basket) ? answers.basket : universe.map((u) => u.tk);
  const weights = normaliseWeights(answers.weights || DRIVER_PRESETS.balanced);
  const preset = presetOf(weights);
  const cap = Math.round(limits.perTradeLimit);
  const presets = [...new Set([Math.round(cap / 5), Math.round(cap / 2), cap])].filter((x) => x >= 25);
  const overLimit = risk != null && risk > limits.perTradeLimit;

  const toggle = (tk) => {
    const next = basket.includes(tk) ? basket.filter((x) => x !== tk) : [...basket, tk];
    setAnswers({ ...answers, basket: next });
  };
  const setWeight = (id, v) => setAnswers({ ...answers, weights: normaliseWeights({ ...weights, [id]: v }, id) });

  // Nothing proceeds on an answer nobody gave. The button says which one is
  // missing, because "disabled" on its own is a locked door with no sign on it.
  const missing = [];
  if (!basket.length) missing.push("at least one market");
  if (!(risk > 0)) missing.push("how much you are willing to lose");
  if (!(horizon > 0)) missing.push("how long to give it");
  const ready = missing.length === 0;

  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: `16px 16px ${BADGE_SAFE}px` }}>
      <BackLink onClick={onBack} />
      <h1 style={{ ...sans, fontSize: 25, fontWeight: 800, color: T.ink, margin: "4px 0 6px", lineHeight: 1.25 }}>
        Find opportunities.
      </h1>
      <p style={{ ...sans, fontSize: 15, color: T.mut, lineHeight: 1.5, margin: 0 }}>
        Three things, then it decides. If nothing is worth doing today, it will say so.
      </p>

      <Card style={{ marginTop: 18 }}>
        <Block n={1} of={3} title="Which markets should it look at?">
          <Pill>
            All five to start with. Narrowing the basket does not make the app more careful — it
            just gives it less to compare, and the two roads it ends up showing you have to come
            from somewhere.
          </Pill>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {universe.map((u) => (
              <Chip key={u.tk} color={T.blue} on={basket.includes(u.tk)} onClick={() => toggle(u.tk)}>
                {u.tk}
                <span style={{ display: "block", fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{u.name}</span>
              </Chip>
            ))}
          </div>
          {!basket.length && (
            <Pill tone={T.red}>
              Nothing is selected, so there is nothing to look at. Pick at least one market.
            </Pill>
          )}
        </Block>

        <Block n={2} of={3} title="How much, and for how long?">
          {/* The pill lands before the choice, not after it (PRD §2). */}
          <Pill>
            This is the most you can lose, whatever happens — the app will not build anything that risks
            more. {limits.answered ? "Your limit works out at" : "The suggested limit works out at"}{" "}
            {money(limits.perTradeLimit)} per trade, {perTradeCapLabel()}.
          </Pill>
          {!limits.answered && <Pill tone={T.blue}>{capitalSourceNote(limits)}</Pill>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {presets.map((v) => (
              <Chip key={v} on={risk === v} onClick={() => setAnswers({ ...answers, risk: v })}>
                {money(v)}{v === cap ? (limits.answered ? " · your limit" : " · suggested limit") : ""}
              </Chip>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <NumberField value={risk == null ? "" : risk} placeholder="or type an amount"
              onChange={(v) => setAnswers({ ...answers, risk: v === "" ? null : Math.max(25, +v || 0) })}
              prefix="$" min={25} step={25} />
          </div>
          {overLimit && (
            <Pill tone={T.red}>
              {money(risk)} is over {perTradeLimitPhrase(limits)} of {money(limits.perTradeLimit)}. The risk gate will
              refuse the order — change the amount here, or raise the limit in Settings and write down why.
            </Pill>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {HORIZONS.map((h) => (
              <Chip key={h.days} color={T.blue} on={horizon === h.days} onClick={() => setAnswers({ ...answers, horizon: h.days })}>
                {h.label}
              </Chip>
            ))}
          </div>
          <div style={{ ...sans, fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
            The trade closes at {RULES.exitDTE} days to expiry whatever happens, so a longer horizon means more room
            before that day arrives.
          </div>
        </Block>

        <Block n={3} of={3} title="What should it weigh most?">
          <Pill>
            These three are one dial, not three boxes: they always add up to 100, so asking for more of
            one asks for less of the others. The three buttons below are just positions on that dial —
            tap one and watch where it puts the numbers.
          </Pill>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {PRIORITIES.map((p) => (
              <Chip key={p.id} color={T.violet} on={preset === p.id}
                onClick={() => setAnswers({ ...answers, weights: { ...DRIVER_PRESETS[p.id] }, priority: p.id })}>
                {p.label}
              </Chip>
            ))}
          </div>
          {DRIVERS.map((d) => (
            <DriverSlider key={d.id} d={d} value={weights[d.id]} onChange={(v) => setWeight(d.id, v)} />
          ))}
          <div style={{ ...mono, fontSize: 11.5, color: T.dim, marginTop: 12, textAlign: "right" }}>
            {DRIVERS.map((d) => `${d.id} ${weights[d.id]}`).join("  ·  ")}  =  100
          </div>
        </Block>

        {err && <Pill tone={T.red}>{err}</Pill>}
        {!ready && (
          <Pill tone={T.blue}>
            Still missing: {missing.join(", ")}. Nothing here is filled in for you — an answer you did
            not give is not an answer, and the app is not going to quote one back at you later.
          </Pill>
        )}

        <button onClick={onDecide} disabled={busy || !ready}
          style={{ ...sans, width: "100%", minHeight: 58, marginTop: 22, marginBottom: BADGE_BTN_GAP, fontSize: 16.5, fontWeight: 700, borderRadius: 10,
            cursor: busy ? "wait" : ready ? "pointer" : "not-allowed", opacity: busy ? 0.6 : ready ? 1 : 0.45,
            background: T.amber, color: T.onAccent, border: "none", display: "inline-flex", alignItems: "center",
            justifyContent: "center", gap: 8 }}>
          <Sparkles size={18} /> {busy ? "Looking…" : "Decide for me"}
        </button>
        <div style={{ ...sans, fontSize: 12.5, color: T.dim, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
          It applies your weights across {basket.length === 1 ? "the market" : `all ${basket.length} markets`} and
          comes back with two roads and its reasoning — or with nothing, and why.
        </div>
      </Card>
    </div>
  );
}

/* ====================================================================
   SCREEN 3 — THE VERDICT: TWO ROADS, NEVER ONE (PRD §5)

   One answer is advice; two answers with their price is teaching. The screen
   refuses to show a single "best": if only one structure survives the search
   there is nothing to compare, and the honest answer is screen 5.

   Three things the old version was missing:

   · WHAT WAS ACTUALLY EXAMINED, up top and in English, with the real counts —
     how many headlines and how many of them were geopolitical, which regions sit
     outside their own monthly norm and by how much, what this month has averaged
     historically, and how the three sliders tipped the choice. Generated in
     src/signals.js from the same data the score came from, never templated.

   · THE ANSWERS, READ BACK, with a link to change them. The screen quotes the
     budget in its own copy, so the budget had better be something the user
     actually said.

   · THE EVIDENCE, ON EACH ROAD. The four-factor engine exists and is wired, and
     the screen where the decision happens used to show none of it. Each road now
     carries the same "Why this trade" panel the desk has — the agreement badge,
     the four factors as direction and strength, and the tap-through to the
     weather regions and the news headlines behind them — plus the gauge next to
     the band thumbnail.

   And the lead line no longer opens with "3 times in 10". To a beginner that
   reads as a bad trade before they have seen what the trade IS. What a road
   gives and what it costs comes first; the frequency sits alongside the payout,
   in the same sentence, so the trade-off is one thought rather than two.
==================================================================== */

/** What this candidate gives up against the other one, from the numbers. */
export function tradeOffSentence(me, other) {
  if (!me) return "";
  if (!other) return "The only structure that fits your answers today.";
  const inTen = (p) => Math.max(0, Math.min(10, Math.round((p || 0) * 10)));
  const gives = [];
  if (inTen(me.pop) < inTen(other.pop)) {
    gives.push(`how often it works — about ${inTenPhrase(me.pop)} against ${inTen(other.pop)}`);
  }
  if (me.maxProfit < other.maxProfit * 0.98) {
    gives.push(`the size of the win — up to ${money(me.maxProfit)} against ${money(other.maxProfit)}`);
  }
  if (me.risk > other.risk * 1.02) {
    gives.push(`the cheaper ticket — ${money(me.risk)} at risk against ${money(other.risk)}`);
  }
  if (!gives.length) {
    return `Gives up nothing measurable against the other: it works out about as often, ` +
      `pays about as much and risks about as much. The difference is the shape, not the odds.`;
  }
  return `Gives up ${gives[0]}${gives.length > 1 ? `, and ${gives[1]}` : ""}.`;
}

/**
 * The headline for one road: what it pays, what it costs, and how often — in
 * that order and in one sentence.
 *
 * Leading with the frequency was the bug. "About 3 times in 10" at the top of a
 * card is a verdict before the reader knows what is being judged, and every
 * beginner reads it as "this is a bad trade" rather than as one half of a
 * trade-off. Payout first, price second, frequency attached to the payout it
 * belongs to.
 */
export function roadHeadline(c) {
  if (!c) return "";
  const often = inTenPhrase(c.pop);
  return `Pays up to ${money(c.maxProfit)} for ${money(c.risk)} at risk — and that happens ${often}.`;
}

/** One road. Every visual on it is tappable and explains itself. */
function RoadCard({ c, other, onPick, i, bars = [], weatherData, newsItems, month, actions }) {
  const [open, setOpen] = useState(null);
  const bands = payoffBands({ legs: c.legs, entryNet: c.entryNet, spot: c.spot });
  const inTen = Math.max(0, Math.min(10, Math.round((c.pop || 0) * 10)));
  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 10.5, color: T.dim, letterSpacing: "0.1em" }}>ROAD {i + 1}</span>
        <span style={{ ...sans, fontSize: 17, fontWeight: 700, color: T.ink }}>{c.ticker} · {c.name}</span>
        {c.driver != null && (
          <span style={{ ...mono, fontSize: 10, color: T.violet, border: `1px solid ${T.violet}55`, borderRadius: 4, padding: "2px 7px" }}>
            {c.driver}/100 ON YOUR WEIGHTS
          </span>
        )}
      </div>

      {/* What it gives and what it costs, first. */}
      <div style={{ ...sans, fontSize: 16, fontWeight: 700, color: T.ink, marginTop: 8, lineHeight: 1.4 }}>
        {roadHeadline(c)}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BandThumbnail bands={bands} width={300} height={92} bars={bars} spot={c.spot} onExplain={setOpen}
          title={bandTakeaway(bands, { ticker: c.ticker })} />
        <Gauge bands={bands} size={190} onExplain={setOpen} ticker={c.ticker} />
      </div>
      <div style={{ ...sans, fontSize: 13.5, color: T.body, lineHeight: 1.5, marginTop: 8 }}>
        {bandTakeaway(bands, { ticker: c.ticker })}
      </div>
      {open && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: T.bg, border: `1px solid ${T.blue}55`, borderLeft: `3px solid ${T.blue}`, borderRadius: 8 }}>
          <div style={{ ...sans, fontSize: 12.5, color: T.body, lineHeight: 1.5 }}>{explainElement(open, bands, { ticker: c.ticker })}</div>
          <button onClick={() => setOpen(null)} style={{ ...mono, fontSize: 10, marginTop: 6, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: 0 }}>close</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
        {[["YOU RISK", money(c.risk), T.ink],
          ["YOU CAN MAKE", money(c.maxProfit), T.green],
          ["WORKS OUT", inTenPhrase(c.pop), inTen >= 6 ? T.green : inTen >= 4 ? T.blue : T.violet],
          ["DAYS", `${Math.round(c.dte)}`, T.ink]].map(([k, v, col]) => (
            <span key={k}>
              <span style={{ ...mono, fontSize: 9.5, color: T.dim, display: "block" }}>{k}</span>
              <span style={{ ...mono, fontSize: 15, fontWeight: 700, color: col }}>{v}</span>
            </span>
          ))}
      </div>

      {/* THE EVIDENCE. The same panel the desk shows, on the screen where the
          decision is actually made. The four bars are open by default here:
          behind a tap they were, in practice, not on the screen at all. */}
      <WhyThisTrade fused={c.fused} ticker={c.ticker} weatherData={weatherData} newsItems={newsItems}
        month={month} defaultDetail title="WHY THIS MARKET"
        note={`Tap Weather for the regions behind that bar, or News for the headlines behind that one.`} />

      {/* The one sentence that makes this two roads rather than a ranking. */}
      <Pill tone={T.violet}>{tradeOffSentence(c, other)}</Pill>

      {/* A road is a candidate like any other on the Shortlist step: it can be
          put beside two others on one picture, or kept for later. The desk
          passes these in; the guided screen on its own does not have them. */}
      {actions ? <div style={{ marginTop: 10 }}>{actions}</div> : null}

      <button onClick={() => onPick(c)}
        style={{ ...sans, width: "100%", minHeight: 56, marginTop: 14, fontSize: 16, fontWeight: 700, borderRadius: 10,
          cursor: "pointer", background: T.amber, color: T.onAccent, border: "none" }}>
        Take this road
      </button>
    </Card>
  );
}

/** The answers, read back. Never a number the user did not type or tap. */
function AnswersBack({ answers, onChange }) {
  const w = normaliseWeights(answers.weights || DRIVER_PRESETS.balanced);
  const basket = answers.basket || [];
  const horizon = HORIZONS.find((h) => h.days === answers.horizon);
  const rows = [
    ["Markets", basket.length ? basket.join(" · ") : "—"],
    ["Willing to lose", answers.risk > 0 ? money(answers.risk) : "—"],
    ["Time given", horizon ? horizon.label : answers.horizon > 0 ? `${answers.horizon} days` : "—"],
    ["Weights", DRIVERS.map((d) => `${d.label.toLowerCase()} ${w[d.id]}`).join(" · ")],
  ];
  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>What you told it</Eyebrow>
        <button onClick={onChange}
          style={{ ...sans, fontSize: 13.5, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: "4px 0", minHeight: 32 }}>
          change
        </button>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ ...mono, fontSize: 10.5, color: T.dim, minWidth: 120, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</span>
            <span style={{ ...sans, fontSize: 14, color: T.ink, flex: 1, minWidth: 0 }}>{v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function WizardCandidates({ candidates = [], answers = {}, narrative = [], barsFor,
  weatherData, newsItems, month, onPick, onBack, actionsFor }) {
  const tickers = [...new Set(candidates.map((c) => c.ticker))];
  return (
    <div style={{ ...sans, maxWidth: 760, margin: "0 auto", padding: `16px 16px ${BADGE_SAFE}px` }}>
      <BackLink onClick={onBack} label="Change my answers" />
      <Eyebrow>The verdict</Eyebrow>
      <h1 style={{ ...sans, fontSize: 25, fontWeight: 800, color: T.ink, margin: "6px 0 6px", lineHeight: 1.25 }}>
        {candidates.length === 2 ? "Two ways to do this." : `${candidates.length} ways to do this.`}
        {tickers.length > 1 ? ` In ${tickers.length} different markets.` : ""}
      </h1>
      <p style={{ ...sans, fontSize: 15, color: T.mut, lineHeight: 1.55, margin: 0 }}>
        Neither one is the right answer. Each buys something and pays for it somewhere else, and the
        sentence under each chart says where.
      </p>

      {/* What was actually examined, before anything is recommended. */}
      {narrative.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <Eyebrow>What I looked at</Eyebrow>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {narrative.map((para, i) => (
              <p key={i} style={{ ...sans, fontSize: 14, color: T.body, lineHeight: 1.6, margin: 0 }}>{para}</p>
            ))}
          </div>
        </Card>
      )}

      <AnswersBack answers={answers} onChange={onBack} />

      {candidates.map((c, i) => (
        <RoadCard key={c.id || i} c={c} i={i} onPick={onPick}
          bars={barsFor ? barsFor(c.ticker) : []}
          weatherData={weatherData} newsItems={newsItems} month={month}
          actions={actionsFor ? actionsFor(c) : null}
          other={candidates.find((x) => x !== c) || null} />
      ))}
      <div style={{ ...sans, fontSize: 12.5, color: T.dim, marginTop: 16, lineHeight: 1.5, textAlign: "center" }}>
        Green is where the trade makes money at expiry, red is where it does not, and the line across them is
        where the price has actually been. Every chart here is drawn from the same payoff calculation, so they
        can be compared directly.
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
    {
      id: "per-trade",
      ok: !blocked("PER_TRADE_LIMIT"),
      // "your limit" only when it IS his. With the capital questions still open
      // this is the suggested figure, and the confirm screen is the last place
      // that should blur the difference.
      text: `${money(L.tradeRisk)} at risk against ${limitOwner(L)} ${money(L.perTrade)} per-trade limit` +
        (cap ? ` — ${pctText(L.tradeRisk / cap)} of ${L.answered ? "your" : "an assumed"} ${money(cap)} of trading capital.` : "."),
    },
    {
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
 * @param preview    the gate's reading BEFORE the tap
 * @param result     the gate's answer AFTER the tap, when there is one
 * @param heading    false on Build, where the trade's name is already above
 */
export function ConfirmSteps({
  candidate, preview, result, bars = [], sigma = 0.3, driftAnnual = 0,
  busy, onConfirm, onDesk, heading = true, showFigure = true,
}) {
  if (!candidate) return null;
  const c = candidate;
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
            {c.legs.length} legs, expiring {c.expKey || `in ${Math.round(c.dte)} days`}. Risking {money(c.risk)} to make
            up to {money(c.maxProfit)}.
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
              {l.side > 0 ? "BUY" : "SELL"} {l.qty} × {c.ticker} {price(l.strike)} {l.type === "call" ? "call" : "put"}
            </div>
          ))}
        </div>
        <div style={{ ...sans, fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
          One contract of each, on a paper account. Nothing is sent until you tap below.
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Eyebrow>{refused ? "The gate refused this" : "The checks that run when you tap"}</Eyebrow>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {rows.map((r) => <CheckRow key={r.id} ok={r.ok} text={r.text} />)}
        </div>
        {(shown?.warnings || []).map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
            <AlertTriangle size={17} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />
            <span style={{ ...sans, fontSize: 13.5, color: T.body, lineHeight: 1.5 }}>{w.message}</span>
          </div>
        ))}
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
          {exitPlanDetail(c.maxProfit)}
        </div>
      </Card>

      <button onClick={onConfirm} disabled={busy || refused}
        style={{ ...sans, width: "100%", minHeight: 58, marginTop: 18, marginBottom: BADGE_BTN_GAP, fontSize: 16.5, fontWeight: 700, borderRadius: 10,
          cursor: busy ? "wait" : refused ? "not-allowed" : "pointer", opacity: busy ? 0.6 : refused ? 0.45 : 1,
          background: T.amber, color: T.onAccent, border: "none" }}>
        {busy ? "Checking…" : refused ? "Blocked by the risk gate" : `Open this on paper · ${money(c.risk)} at risk`}
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

/* ====================================================================
   SCREEN 5 — NOTHING TODAY
   Not an error. The app saying "nothing today" is the product working:
   an agent that cannot execute a trade it cannot justify. It states why
   in the same numbers that caused the refusal, and offers to watch.
==================================================================== */

export function NothingToday({ reasons = [], notified, onNotify, onBack, onPositions, onDesk, hasPositions }) {
  // "We looked and decided against it" and "we could not look" are different
  // answers, and the second one must not be dressed up as the first. "We found
  // exactly one thing" is a third answer again: the board is not empty, it is
  // just not teaching anything.
  const dataProblem = reasons.length > 0 && reasons.every((r) => String(r.id || "").startsWith("no-"));
  const oneRoad = !dataProblem && reasons.length > 0 && reasons.every((r) => r.id === "one-road");
  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: `16px 16px ${BADGE_SAFE}px` }}>
      <BackLink onClick={onBack} label="Change my answers" />
      <div style={{ marginTop: 6 }}>
        <Eyebrow>Today’s answer</Eyebrow>
        <h1 style={{ ...sans, fontSize: 32, fontWeight: 800, color: T.ink, margin: "8px 0 0", lineHeight: 1.15 }}>
          Nothing today.
        </h1>
        <p style={{ ...sans, fontSize: 15.5, color: T.mut, lineHeight: 1.55, margin: "10px 0 0" }}>
          {dataProblem
            ? "Not because the markets look bad — because we could not see them. Nothing gets proposed on data we do not have."
            : oneRoad
              ? "One structure fits, and one is not enough. This app shows you a choice with its price attached, or it shows you nothing."
              : "Not a glitch, and not a missing feature. Nothing on the board is worth your money right now, so the honest answer is to sit this one out."}
        </p>
      </div>

      <Card style={{ marginTop: 18 }}>
        <Eyebrow>Why</Eyebrow>
        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          {reasons.map((r, i) => (
            <div key={r.id || i} style={{ display: "flex", gap: 12 }}>
              <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: T.amber, flexShrink: 0, width: 18 }}>{i + 1}</span>
              <span style={{ ...sans, fontSize: 14.5, color: T.body, lineHeight: 1.55 }}>{r.text}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Bell size={20} style={{ color: notified ? T.green : T.amber, flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...sans, fontSize: 15.5, fontWeight: 700, color: T.ink }}>
              {notified ? "You’ll hear from us." : "Tell me when this changes"}
            </div>
            <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
              {notified
                ? "The daily brief will flag the moment these reasons stop being true. You can turn this off in Settings."
                : "Keep watching in the background, and say something the moment these reasons stop being true."}
            </div>
          </div>
        </div>
        {!notified && (
          <button onClick={onNotify}
            style={{ ...sans, width: "100%", minHeight: 52, marginTop: 14, marginBottom: BADGE_BTN_GAP, fontSize: 15.5, fontWeight: 700, borderRadius: 10,
              cursor: "pointer", background: T.amber, color: T.onAccent, border: "none" }}>
            Notify me
          </button>
        )}
      </Card>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {hasPositions && (
          <BigChoice icon={Briefcase} color={T.blue} onClick={onPositions}
            title="My positions" sub="What you already hold is still worth a look" />
        )}
        <button onClick={onDesk}
          style={{ ...sans, fontSize: 14, minHeight: TAP, padding: "8px 4px", background: "transparent", border: "none", color: T.blue, cursor: "pointer", textAlign: "left" }}>
          Look around the full desk anyway →
        </button>
      </div>
    </div>
  );
}
