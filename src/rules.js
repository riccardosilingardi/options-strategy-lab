// ============================================================================
// src/rules.js — THE single source of truth for the trading rules.
//
// PRD §3 (capital model) and §4 (exit rules) live here and nowhere else.
// If a number or a rule sentence appears in a component, a prompt or a
// serverless function, it is a bug: import it from here instead.
//
// Plain JS, no React imports — the client, the tests and the Netlify
// functions all import this file.
// ============================================================================

/** The config object. Everything else in this file is derived from it. */
export const RULES = {
  // --- exits, PRD §4. Chosen once per position at construction, then frozen.
  takeProfitPct: 0.5,          // take profit at 50% of max profit — KEEP
  scaleOutPct: 0.75,           // scale the rest out at 75% — ladder convenience
  stopLossPct: 0.5,            // stop at 50% of max loss...
  stopLossEnforcement: "warn", // ...but WARNING ONLY: never auto-closes (PRD §4)
  exitDTE: 21,                 // exit at 21 DTE — CHANGED from 7 (PRD §4)

  // --- entry window. An entry too close to the exit rule has no room to work:
  // the position would be opened already inside its own exit window.
  minEntryDTE: 30,             // hard floor at entry
  targetEntryDTE: 45,          // what autopilot aims for (PRD §9)

  // --- sizing, PRD §3. These two percentages are best practice, not law:
  // they cap a *derived* number, they do not replace it.
  bestPracticePerTradePct: 0.05, // no single trade above 5% of trading capital
  totalExposurePct: 0.25,        // no more than 25% of capital at risk at once

  // --- defaults used only when onboarding has not answered yet
  defaultTradingCapital: 5000,
  defaultConcurrentTarget: 4,

  // --- pill thresholds
  savingsShareWarnPct: 0.10,   // trading capital above 10% of savings → pill
  lowConfidence: 40,           // signal confidence under this → warning
  minOverrideReasonChars: 15,  // an override needs a typed reason, not a shrug

  // --- "nothing today", PRD §5. The app must be able to refuse, so the two
  // thresholds that make it refuse live here with every other rule number.
  expensiveIVRank: 70,         // IV rank at or above this → options priced rich
                               // versus their own history: we are the buyer of
                               // an expensive option, so we stand down
};

/* ============================== formatting ============================== */

/** `$340`, `$1,250`. Dollars, no cents — every rule number is a round figure. */
export const money = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  const s = Math.round(Math.abs(n)).toLocaleString("en-US");
  return `${n < 0 ? "-" : ""}$${s}`;
};

/** `5%`, `6.8%`. One decimal only when the number needs it. */
export const pctText = (frac, decimals = 1) => {
  const n = Number(frac) * 100;
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(decimals)}%`;
};

/* ============================== rule text ==============================
   Short labels the UI renders. Generated from RULES so changing a number
   changes every screen at once. Never hand-write these strings. */

export const takeProfitLabel = () => `TP ${pctText(RULES.takeProfitPct)}`;
export const scaleOutLabel = () => `${pctText(RULES.scaleOutPct)}`;
export const stopLossLabel = () => `SL ${pctText(RULES.stopLossPct)}`;
export const exitDTELabel = () => `${RULES.exitDTE} DTE`;

/** `TP 50% · SL 50% · 21 DTE` — the badge shown next to the PAPER chip. */
export const ruleBadge = () => [takeProfitLabel(), stopLossLabel(), exitDTELabel()].join(" · ");

/** `max 5% of capital` — the best-practice cap, as a phrase. */
export const perTradeCapLabel = () => `max ${pctText(RULES.bestPracticePerTradePct)} of capital`;

/** `max 5% of capital ($250)` — the same phrase, priced for this user. */
export const perTradeCapText = (tradingCapital) =>
  `${perTradeCapLabel()} (${money(RULES.bestPracticePerTradePct * (tradingCapital || 0))})`;

/** One sentence for each exit rule, for tooltips and literacy pills (PRD §2). */
export const RULE_PILLS = {
  takeProfit: () =>
    `Take the profit at ${pctText(RULES.takeProfitPct)} of the maximum. Closing at half the ` +
    `maximum beats holding to expiration on a risk-adjusted basis.`,
  stopLoss: () =>
    `A loss of ${pctText(RULES.stopLossPct)} of the maximum raises a warning, not an order. ` +
    `The evidence for auto-closing here is the weakest of the four rules.`,
  exitDTE: () =>
    `Close or roll at ${RULES.exitDTE} days to expiration. The last ${RULES.exitDTE} days pay ` +
    `little extra premium for sharply higher gamma risk.`,
  definedRisk: () =>
    `No uncovered short legs, and the maximum loss is always known: every option sold is covered by ` +
    `one bought, so the worst case is a number you can read before you send the order.`,
  paperOnly: () =>
    `Paper trading only. If the account cannot be verified as paper, the order is rejected.`,
};

/* ===================== "nothing today", PRD §5 =====================
   The refusal screen gets the same care as every other. Its sentences are
   generated from the same numbers that cause the refusal, so the screen can
   never explain a threshold the code does not apply. */

export const NOTHING_TODAY = {
  signalsNotAligned: (best) =>
    `The four factors do not agree on any market today` +
    (best ? ` — the closest is ${best.tk}, and even there confidence is ${best.confidence} out of 100, ` +
      `under the ${RULES.lowConfidence} we need.` : `.`) +
    ` When the signals contradict each other we do not know enough, and a trade taken anyway is a guess with your money on it.`,
  optionsExpensive: (ticker, rank) =>
    `Options on ${ticker} are expensive right now: their implied volatility sits at ${rank} out of 100 versus ` +
    `its own past year, above the ${RULES.expensiveIVRank} mark. Buying here means paying a rich price for the ` +
    `same outcome, and the premium usually deflates faster than the idea pays off.`,
  budgetTooSmall: (risk) =>
    `Nothing fits inside ${money(risk)} of risk today. Every structure that matched your answers costs more than ` +
    `that to put on, and stretching the budget past your per-trade limit is exactly the habit these rules exist to stop.`,
  onlyOneRoad: (risk) =>
    `Only one structure fits inside ${money(risk)} of risk today, and one answer is advice rather than teaching. ` +
    `This app shows two roads with the trade-off between them or it shows none: with nothing to compare against, ` +
    `you would be taking our word for it. Widen the budget or come back tomorrow.`,
  noData: (what) =>
    `Market data for ${what} did not load, so there is nothing to judge. This is a missing-data problem, not a ` +
    `verdict on the market: try again in a minute.`,
};

/** The rules block injected into every model prompt. English, generated. */
export const copilotRulesBlock = () =>
  `Trading rules, to be applied in EVERY analysis: defined risk only — no uncovered short legs, ` +
  `and the maximum loss must always be a known number; take profit at ${pctText(RULES.takeProfitPct)} of max profit; ` +
  `a loss of ${pctText(RULES.stopLossPct)} of max loss is a WARNING, never an automatic close; ` +
  `exit at ${RULES.exitDTE} days to expiration; no single trade above ` +
  `${pctText(RULES.bestPracticePerTradePct)} of trading capital; total options exposure at or ` +
  `below ${pctText(RULES.totalExposurePct)} of trading capital; seasonality is a primary signal ` +
  `and a position against it needs extra scrutiny.`;

/* ============================== sizing, PRD §3 ==============================
   The old spec hardcoded "max 5% per trade, max 25% total". Those numbers were
   inherited, not chosen, and a number handed down teaches nothing. The limit is
   derived from what the user told us, and the 5% cap is shown as an explained
   suggestion on top of it. */

const positive = (x, fallback) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : fallback);

/**
 * @param {object} answers
 *   tradingCapital   — money dedicated to trading (required in onboarding)
 *   concurrentTarget — how many positions held at once (required in onboarding)
 *   savings          — total savings (optional, skippable)
 *   override         — { perTrade, reason } typed by the user, PRD §3
 * @returns the derived limits, the pills the answers trigger, and whether an
 *          override was accepted.
 */
export function sizing(answers = {}) {
  const tradingCapital = positive(answers.tradingCapital, RULES.defaultTradingCapital);
  const concurrentTarget = Math.max(1, Math.round(positive(answers.concurrentTarget, RULES.defaultConcurrentTarget)));
  const savings = Number.isFinite(Number(answers.savings)) && Number(answers.savings) > 0 ? Number(answers.savings) : null;

  const suggestedPerTrade = tradingCapital / concurrentTarget;
  const bestPracticeCap = RULES.bestPracticePerTradePct * tradingCapital;
  const cappedPerTrade = Math.min(suggestedPerTrade, bestPracticeCap);
  const suggestedTotal = RULES.totalExposurePct * tradingCapital;

  // An override is only accepted with a typed reason. This is code, not a prompt.
  const ov = answers.override || {};
  const reason = typeof ov.reason === "string" ? ov.reason.trim() : "";
  const wantsOverride = Number.isFinite(Number(ov.perTrade)) && Number(ov.perTrade) > 0;
  const overrideAccepted = wantsOverride && reason.length >= RULES.minOverrideReasonChars;
  const perTradeLimit = overrideAccepted ? Number(ov.perTrade) : cappedPerTrade;

  const pills = [];
  if (suggestedPerTrade > bestPracticeCap) {
    pills.push({
      id: "per-trade-over-best-practice",
      text: `With ${concurrentTarget} position${concurrentTarget === 1 ? "" : "s"} at a time, each one ` +
        `would be ${pctText(suggestedPerTrade / tradingCapital)} of your capital ` +
        `(${money(suggestedPerTrade)}). Common practice caps a single trade at ` +
        `${pctText(RULES.bestPracticePerTradePct)} — ${money(bestPracticeCap)} — so one loss can't end the run.`,
    });
  }
  if (savings && tradingCapital > RULES.savingsShareWarnPct * savings) {
    pills.push({
      id: "capital-share-of-savings",
      text: `Trading capital is usually money you could lose without changing your life. Yours is ` +
        `${pctText(tradingCapital / savings)} of your savings (${money(tradingCapital)} of ${money(savings)}).`,
    });
  }
  if (concurrentTarget === 1) {
    pills.push({
      id: "single-position",
      text: `One position at a time means all your risk sits on one outcome. That is not wrong, but ` +
        `it is concentrated: ${money(perTradeLimit)} rides on a single trade.`,
    });
  }
  if (wantsOverride && !overrideAccepted) {
    pills.push({
      id: "override-needs-reason",
      text: `An override of ${money(ov.perTrade)} needs a written reason of at least ` +
        `${RULES.minOverrideReasonChars} characters. Until then the limit stays at ${money(cappedPerTrade)}.`,
    });
  }

  return {
    tradingCapital, concurrentTarget, savings,
    suggestedPerTrade, bestPracticeCap, cappedPerTrade, suggestedTotal,
    perTradeLimit, totalLimit: suggestedTotal,
    overrideAccepted, overrideReason: overrideAccepted ? reason : null,
    pills,
  };
}

export default RULES;
