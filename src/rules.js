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

  // --- THE STARTING POINT SHOWN WHILE THE USER HAS NOT ANSWERED YET.
  // These are a SUGGESTION on screen, never "your limit": `sizing()` reports
  // `answered: false` when it had to fall back to them, and every screen that
  // prints a figure derived from them has to say where it came from. An app
  // that quotes a number the user never chose back at them as their own limit
  // has stopped being trustworthy about anything else it says (PRD §5).
  suggestedTradingCapital: 5000,
  suggestedConcurrentTarget: 4,

  // --- pill thresholds
  savingsShareWarnPct: 0.10,   // trading capital above 10% of savings → pill
  lowConfidence: 40,           // signal confidence under this → warning
  minOverrideReasonChars: 15,  // an override needs a typed reason, not a shrug

  // --- "nothing today", PRD §5. The app must be able to refuse, so the two
  // thresholds that make it refuse live here with every other rule number.
  expensiveIVRank: 70,         // IV rank at or above this → options priced rich
                               // versus their own history: we are the buyer of
                               // an expensive option, so we stand down

  // --- QUALITY FLOORS. A structure can pass every rule above and still be
  // indefensible. These two are the floors under a PROPOSAL: a candidate that
  // fails either one is never offered, and the screen says which floor it hit.
  //
  // minOpenInterestPerLeg — how many contracts must already be open on a leg
  // before this app will build with it. Open interest is the count of contracts
  // in existence at the previous session's close: it is the closest thing to a
  // headcount of the people on the other side of your trade. On a contract with
  // 2 open and 0 open, the bid and the ask are a market maker's placeholder,
  // not a price anybody has agreed to — you can be quoted 1.16 and 0.30 on two
  // adjacent strikes whose implied volatility disagrees by ten points, because
  // no trade has ever tested either number. 25 is the floor: it is far above
  // the single digits that mark a strike nobody has touched, and far below what
  // a genuinely traded near-the-money strike on these ETFs carries.
  minOpenInterestPerLeg: 25,

  // minRewardRisk — the least a structure may pay per dollar it puts at risk.
  // Read it as a break-even hit rate: at a ratio r a win pays r and a loss costs
  // 1, so you break even at p = 1 / (1 + r) — 0.25 means being right
  // 80% of the time to break even, and anything below it needs a hit rate no
  // structure on these five chains actually prices. It is also the practitioner
  // floor for a credit spread — collect at least a quarter of the width or the
  // wins are too small to pay for the losses. High-probability credit spreads
  // sit comfortably above it (a two-thirds-chance spread collecting a third of
  // its width is 0.5), so the floor removes the lottery tickets without
  // removing the boring trades that are the point of this app.
  minRewardRisk: 0.25,
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
  // The quality floors emptied the board. This is a real answer — "nothing on
  // CORN clears the liquidity floor today" is worth more than a screen of
  // structures nobody trades — so it gets a sentence with the counts in it.
  belowQualityFloor: (tally) => {
    const t = tally || {};
    const markets = (t.markets || []).join(", ");
    const parts = [];
    if (t.liquidity > 0) parts.push(`${t.liquidity} because ${qualityFloorLabels().liquidity}`);
    if (t.reward > 0) parts.push(`${t.reward} because ${qualityFloorLabels().reward}`);
    return `Every structure that fit your answers on ${markets || "the markets you picked"} was ` +
      `filtered out by the quality floors: ${parts.join(", and ")}. ` +
      `Those floors are the difference between a price and a market. Nothing here today is the honest answer, ` +
      `and it is a better one than a trade nobody else is willing to take the other side of.`;
  },
};

/**
 * Where the limits on screen came from, in one sentence. Any screen that prints
 * a per-trade or exposure figure prints this next to it, so a suggested number
 * can never be read as the user's own decision (PRD §3, §5).
 */
export const capitalSourceNote = (limits) => {
  const L = limits || {};
  if (L.answered) {
    return `Worked out from the ${money(L.tradingCapital)} you set aside for trading and the ` +
      `${L.concurrentTarget} position${L.concurrentTarget === 1 ? "" : "s"} you want open at once.`;
  }
  return `SUGGESTED STARTING POINT — you have not told the app how much you are trading with yet. ` +
    `These figures come from an example ${money(RULES.suggestedTradingCapital)} split across ` +
    `${RULES.suggestedConcurrentTarget} positions, not from anything you chose. Set your own in Settings.`;
};

/** `your own per-trade limit` / `the suggested per-trade limit` — never the wrong one. */
export const perTradeLimitPhrase = (limits) =>
  (limits && limits.answered) ? "your own per-trade limit" : "the suggested per-trade limit";

/** The possessive in front of a limit figure: `your` only when it really is. */
export const limitOwner = (limits) => ((limits && limits.answered) ? "your" : "the suggested");

/* ====================== QUALITY FLOORS, applied ======================
   The two floors in RULES, as one pure function every candidate goes through.
   It lives here with the numbers rather than in a component, so a structure
   cannot be rejected on one screen and offered on another.

   TWO THINGS THIS FUNCTION WILL NOT DO.

   It will not treat MISSING open interest as low open interest. Alpaca's
   snapshots carry no open-interest figure at all (src/chain.js fills it in
   afterwards from the broker's contract list, and sometimes that call does not
   land). A floor that reads `null` as zero would reject every candidate on the
   whole feed and call it illiquidity, which is a lie about what we know. When
   any leg's count is unknown the liquidity check is SKIPPED and says so, and
   the screen repeats that rather than staying quiet.

   And it will not invent a reason. Every rejection comes back with the number
   that caused it, so the sentence on screen is the arithmetic, not a verdict. */

/** The floors as phrases, generated so no screen can quote a different number. */
export const qualityFloorLabels = () => ({
  liquidity: `fewer than ${RULES.minOpenInterestPerLeg} contracts are open on one of its legs`,
  reward: `it pays under ${money(RULES.minRewardRisk * 100)} for every ${money(100)} at risk`,
});

/** `at least 25 open contracts per leg and $0.25 of reward per $1 at risk` */
export const qualityFloorSentence = () =>
  `Every structure offered here has at least ${RULES.minOpenInterestPerLeg} contracts of open interest on ` +
  `every leg and pays at least ${pctText(RULES.minRewardRisk)} of what it risks. Open interest is how many ` +
  `contracts are actually open: a price on a contract nobody trades is a quote, not a market.`;

/** The one sentence shown when the liquidity floor could not be applied. */
export const liquiditySkippedNote = (feed) =>
  `The liquidity floor was SKIPPED${feed ? ` — ${feed} does not report open interest for these contracts` : ""}. ` +
  `Missing data is not evidence that nobody trades them, so nothing was rejected for it.`;

/**
 * Run one candidate past both floors.
 *
 * @param {object} cand
 *   openInterest — one entry per leg. A number is a known count (0 included:
 *                  CBOE really does report zero). `null`/`undefined` means the
 *                  feed did not tell us, and skips the check.
 *   maxProfit    — dollars, the best case
 *   maxLoss      — dollars, the worst case (negative, or positive magnitude)
 * @returns {{ pass, liquidity, reward, reasons }} — `reasons` are finished
 *   English sentences with the numbers already in them.
 */
export function qualityFloor({ openInterest = [], maxProfit, maxLoss } = {}) {
  const risk = Math.abs(Number(maxLoss));
  const reward = Number(maxProfit);
  const rr = risk > 0 && Number.isFinite(reward) ? reward / risk : null;

  const counts = Array.isArray(openInterest) ? openInterest : [];
  // `Number(null)` is 0 and `Number(undefined)` is NaN, so the unknowns have to
  // be thrown out BEFORE the coercion or a leg the feed said nothing about
  // arrives here as a leg with zero open contracts — exactly the lie this
  // function exists to refuse to tell.
  const isKnown = (x) => x != null && x !== "" && Number.isFinite(Number(x));
  const known = counts.filter(isKnown).map(Number);
  const checked = counts.length > 0 && known.length === counts.length;
  const worst = checked ? Math.min(...known) : null;
  const liquidity = {
    checked,
    pass: checked ? worst >= RULES.minOpenInterestPerLeg : true,
    worst,
    floor: RULES.minOpenInterestPerLeg,
  };

  const rewardCheck = {
    checked: rr != null,
    pass: rr != null && rr >= RULES.minRewardRisk,
    rr,
    floor: RULES.minRewardRisk,
  };

  const reasons = [];
  if (!liquidity.pass) {
    reasons.push(
      `Open interest is ${worst} on its thinnest leg, under the ${RULES.minOpenInterestPerLeg} this app needs. ` +
      `A price on a contract nobody trades is a quote, not a market: you would be paying whatever the ` +
      `market maker felt like typing.`);
  }
  if (!rewardCheck.pass) {
    reasons.push(rr == null
      ? `The best case cannot be measured against the worst, so there is no reward-to-risk to judge.`
      : `It pays ${money(rr * 100)} for every ${money(100)} at risk, under the ${money(RULES.minRewardRisk * 100)} ` +
        `floor: you would have to be right ${pctText(1 / (1 + rr), 0)} of the time just to break even.`);
  }

  return { pass: liquidity.pass && rewardCheck.pass, liquidity, reward: rewardCheck, reasons };
}

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
/** Did the user actually give us this, or are we about to invent it? */
const given = (x) => x != null && x !== "" && Number.isFinite(Number(x)) && Number(x) > 0;

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
  // ANSWERED, or ASSUMED. Both questions have to have been answered before any
  // number derived from them may be shown as the user's own limit; with either
  // missing the whole set is a suggestion, and `answered: false` is how every
  // screen knows to say so. The figures are still produced — the risk gate has
  // to enforce SOMETHING while the questions are open, and the suggested
  // starting point is the conservative thing to enforce.
  const answered = given(answers.tradingCapital) && given(answers.concurrentTarget);
  const tradingCapital = positive(answers.tradingCapital, RULES.suggestedTradingCapital);
  const concurrentTarget = Math.max(1, Math.round(positive(answers.concurrentTarget, RULES.suggestedConcurrentTarget)));
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

  // A PILL EXPLAINS AN ANSWER. With the questions still open there is no answer
  // to explain, and a pill built on the suggested figures reads as a statement
  // about the user — "one position at a time means all your risk sits on one
  // outcome" to somebody who never said one — which is the same fault as
  // quoting an invented budget back at him. The override pill is the exception:
  // it is about something he really did type.
  const pills = [];
  if (answered && suggestedPerTrade > bestPracticeCap) {
    pills.push({
      id: "per-trade-over-best-practice",
      text: `With ${concurrentTarget} position${concurrentTarget === 1 ? "" : "s"} at a time, each one ` +
        `would be ${pctText(suggestedPerTrade / tradingCapital)} of your capital ` +
        `(${money(suggestedPerTrade)}). Common practice caps a single trade at ` +
        `${pctText(RULES.bestPracticePerTradePct)} — ${money(bestPracticeCap)} — so one loss can't end the run.`,
    });
  }
  if (answered && savings && tradingCapital > RULES.savingsShareWarnPct * savings) {
    pills.push({
      id: "capital-share-of-savings",
      text: `Trading capital is usually money you could lose without changing your life. Yours is ` +
        `${pctText(tradingCapital / savings)} of your savings (${money(tradingCapital)} of ${money(savings)}).`,
    });
  }
  if (answered && concurrentTarget === 1) {
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
    answered,
    tradingCapital, concurrentTarget, savings,
    suggestedPerTrade, bestPracticeCap, cappedPerTrade, suggestedTotal,
    perTradeLimit, totalLimit: suggestedTotal,
    overrideAccepted, overrideReason: overrideAccepted ? reason : null,
    pills,
  };
}

export default RULES;
