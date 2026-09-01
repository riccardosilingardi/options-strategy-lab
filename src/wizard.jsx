// ============================================================================
// src/wizard.jsx — THE APP SHELL (PRD §5).
//
// The wizard is not a tab inside the app. It is the front door: the first thing
// you see, and the thing you come back to. The tabs (Scanner, Optimize,
// Builder, Backtest…) are still there for anyone who wants them, one tap away
// behind "Full desk", but nobody has to start there any more.
//
// Screens in this file:
//   · CapitalOnboarding — first run, PRD §3. Capital, positions at once, savings.
//   · WizardOpen        — screen 1. Greeting, one line of status, three choices.
//   · WizardQuestions   — screen 2. Budget, horizon, what matters most.
//   · NothingToday      — screen 5. A designed answer, not an error state.
// Screens 3 (two roads) and 4 (confirm) are the next session's work: for now
// the search hands its best candidate to the existing Builder.
//
// Written for a phone. No hover anywhere: every affordance is a tap target of
// at least 52px, inputs are 16px so iOS does not zoom on focus, and everything
// stacks in one column and widens on a desk.
// ============================================================================
import React, { useState } from "react";
import { Compass, Briefcase, Sparkles, Bell, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { T } from "./theme.js";
import { RULES, sizing, money, pctText, perTradeCapLabel, ruleBadge } from "./rules.js";

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

const NumberField = ({ value, onChange, prefix, min = 0, step = 1, width = 150 }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", minHeight: TAP, width }}>
    {prefix && <span style={{ ...mono, fontSize: 15, color: T.mut }}>{prefix}</span>}
    <input type="number" inputMode="numeric" min={min} step={step} value={value}
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
  const [capital, setCapital] = useState(initial.capital ?? RULES.defaultTradingCapital);
  const [concurrent, setConcurrent] = useState(initial.concurrentTarget ?? RULES.defaultConcurrentTarget);
  const [savings, setSavings] = useState(initial.savings ?? "");
  const [wantOverride, setWantOverride] = useState(false);
  const [ovAmount, setOvAmount] = useState("");
  const [ovReason, setOvReason] = useState("");

  const override = wantOverride && ovAmount ? { perTrade: +ovAmount, reason: ovReason } : null;
  const answers = {
    tradingCapital: +capital || 0,
    concurrentTarget: +concurrent || 1,
    savings: savings === "" ? null : +savings,
    override,
  };
  const limits = sizing(answers);
  const ready = +capital > 0 && +concurrent >= 1;
  const reasonShort = wantOverride && ovAmount && ovReason.trim().length < RULES.minOverrideReasonChars;

  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: "24px 16px 48px" }}>
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
            <NumberField value={capital} onChange={setCapital} prefix="$" min={100} step={500} />
          </div>
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

        <div style={{ marginTop: 18, padding: "14px 16px", background: T.bg, borderRadius: 10, border: `1px solid ${T.line}` }}>
          <div style={{ ...mono, fontSize: 10.5, color: T.dim, letterSpacing: "0.1em" }}>YOUR LIMITS</div>
          <div style={{ ...sans, fontSize: 16, color: T.ink, fontWeight: 700, marginTop: 6 }}>
            {money(limits.perTradeLimit)} at risk per trade
          </div>
          <div style={{ ...sans, fontSize: 13.5, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
            and no more than {money(limits.totalLimit)} at risk across everything at once
            ({pctText(RULES.totalExposurePct)} of your capital). The app will refuse an order that breaks either one.
          </div>
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
          style={{ ...sans, width: "100%", minHeight: 56, marginTop: 20, fontSize: 16, fontWeight: 700, borderRadius: 10,
            cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5,
            background: T.amber, color: T.onAccent, border: "none" }}>
          Start
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
  onPositions, onFind, onDecide, onDesk, onSettings, perTradeLimit }) {
  const hasPositions = positions.length > 0;
  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: "22px 16px 40px" }}>
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
            {posAlerts.map(({ p, pnl, dteLeft, level, label }) => {
              const c = level === "action" ? T.red : level === "watch" ? T.amber : T.green;
              return (
                <button key={p.id} onClick={onPositions}
                  style={{ ...sans, display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left",
                    minHeight: 64, padding: "12px 13px", background: T.bg, border: `1px solid ${c}44`, borderRadius: 10, cursor: "pointer" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: c, flexShrink: 0 }} />
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

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <BigChoice icon={Briefcase} color={T.blue} onClick={onPositions}
          title="My positions"
          sub={hasPositions ? `${positions.length} open · profit target, stop and exit day for each` : "Nothing open yet"} />
        <BigChoice icon={Compass} color={T.amber} primary onClick={onFind}
          title="Find opportunities"
          sub="Answer three questions, see what fits" />
        <BigChoice icon={Sparkles} color={T.violet} onClick={onDecide}
          title="Decide for me"
          sub={`Uses your usual answers and the ${money(perTradeLimit)} limit`} />
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
   SCREEN 2 — THREE QUESTIONS
   Budget, time horizon, what matters most. No delta, no implied
   volatility, no Greeks: a beginner answers all three from their own
   life, not from an options textbook.
==================================================================== */

export const HORIZONS = [
  { days: RULES.minEntryDTE, label: "2–4 weeks", sub: "quick" },
  { days: RULES.targetEntryDTE, label: "1–2 months", sub: "usual" },
  { days: RULES.targetEntryDTE + 30, label: "2–3 months", sub: "patient" },
];
export const PRIORITIES = [
  { id: "often", label: "Win often", sub: "More trades work out, each one pays less." },
  { id: "balanced", label: "Balanced", sub: "The middle of the two." },
  { id: "big", label: "Win big", sub: "Fewer work out, the ones that do pay more." },
];

export function WizardQuestions({ answers, setAnswers, limits, busy, err, onBack, onSearch }) {
  const { risk, horizon, priority } = answers;
  const cap = Math.round(limits.perTradeLimit);
  const presets = [...new Set([Math.round(cap / 5), Math.round(cap / 2), cap])].filter((x) => x >= 25);
  const overLimit = risk > limits.perTradeLimit;

  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: "16px 16px 44px" }}>
      <BackLink onClick={onBack} />
      <h1 style={{ ...sans, fontSize: 25, fontWeight: 800, color: T.ink, margin: "4px 0 6px", lineHeight: 1.25 }}>
        Three questions.
      </h1>
      <p style={{ ...sans, fontSize: 15, color: T.mut, lineHeight: 1.5, margin: 0 }}>
        Then the app goes looking. If nothing is worth doing today, it will say so.
      </p>

      <Card style={{ marginTop: 18 }}>
        <Question n={1} of={3} title="How much are you willing to lose on this one trade?">
          {/* The pill lands before the choice, not after it (PRD §2). */}
          <Pill>
            This is the most you can lose, whatever happens — the app will not build anything that risks
            more. Your limit works out at {money(limits.perTradeLimit)} per trade, {perTradeCapLabel()}.
          </Pill>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {presets.map((v) => (
              <Chip key={v} on={risk === v} onClick={() => setAnswers({ ...answers, risk: v })}>
                {money(v)}{v === cap ? " · your limit" : ""}
              </Chip>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <NumberField value={risk} onChange={(v) => setAnswers({ ...answers, risk: Math.max(25, +v || 0) })} prefix="$" min={25} step={25} />
          </div>
          {overLimit && (
            <Pill tone={T.red}>
              {money(risk)} is over your own per-trade limit of {money(limits.perTradeLimit)}. The risk gate will
              refuse the order — change the amount here, or raise the limit in Settings and write down why.
            </Pill>
          )}
        </Question>

        <Question n={2} of={3} title="How long do you want to give the idea?">
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
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
        </Question>

        <Question n={3} of={3} title="What matters most to you?">
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {PRIORITIES.map((p) => (
              <button key={p.id} onClick={() => setAnswers({ ...answers, priority: p.id })}
                style={{ ...sans, display: "block", width: "100%", textAlign: "left", minHeight: 64, padding: "12px 14px",
                  borderRadius: 10, cursor: "pointer",
                  background: priority === p.id ? `${T.violet}12` : "transparent",
                  border: `1.5px solid ${priority === p.id ? T.violet : T.line}` }}>
                <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, color: priority === p.id ? T.violet : T.ink }}>{p.label}</span>
                <span style={{ display: "block", fontSize: 13, color: T.mut, marginTop: 3 }}>{p.sub}</span>
              </button>
            ))}
          </div>
        </Question>

        {err && <Pill tone={T.red}>{err}</Pill>}

        <button onClick={onSearch} disabled={busy}
          style={{ ...sans, width: "100%", minHeight: 56, marginTop: 22, fontSize: 16, fontWeight: 700, borderRadius: 10,
            cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
            background: T.amber, color: T.onAccent, border: "none" }}>
          {busy ? "Looking…" : "Show me what fits"}
        </button>
      </Card>
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
  // answers, and the second one must not be dressed up as the first.
  const dataProblem = reasons.length > 0 && reasons.every((r) => String(r.id || "").startsWith("no-"));
  return (
    <div style={{ ...sans, maxWidth: 620, margin: "0 auto", padding: "16px 16px 44px" }}>
      <BackLink onClick={onBack} label="Change my answers" />
      <div style={{ marginTop: 6 }}>
        <Eyebrow>Today’s answer</Eyebrow>
        <h1 style={{ ...sans, fontSize: 32, fontWeight: 800, color: T.ink, margin: "8px 0 0", lineHeight: 1.15 }}>
          Nothing today.
        </h1>
        <p style={{ ...sans, fontSize: 15.5, color: T.mut, lineHeight: 1.55, margin: "10px 0 0" }}>
          {dataProblem
            ? "Not because the markets look bad — because we could not see them. Nothing gets proposed on data we do not have."
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
            style={{ ...sans, width: "100%", minHeight: 52, marginTop: 14, fontSize: 15.5, fontWeight: 700, borderRadius: 10,
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
