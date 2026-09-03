// ============================================================================
// src/riskGate.js — PRD §8. The only thing standing between a proposal and
// Alpaca. Pure function: same inputs, same answer, no fetch, no clock, no
// React. That is what makes it testable, and what makes it a rule instead of
// an opinion.
//
//   evaluateTrade({ proposal, portfolio, capital, signals })
//     -> { pass, violations[], warnings[] }
//
// A violation is a HARD BLOCK: the order does not leave. A warning is shown
// and the human decides. Every message carries the numbers that produced it,
// because "risk too high" teaches nothing and "$340 = 6.8% of capital, your
// limit is 5% i.e. $250" teaches everything.
//
// Plain JS, no React imports — the client and the Netlify functions both
// import this file.
// ============================================================================

import { RULES, sizing, money, pctText, capitalSourceNote, priceability, MIN_NET_DOLLARS } from "./rules.js";

/* ============================== helpers ============================== */

const abs = (x) => Math.abs(Number(x) || 0);
const isNum = (x) => Number.isFinite(Number(x));

/**
 * Is the account verifiably a PAPER account? "If unverifiable, reject."
 *
 * Two ways to be sure, and only two:
 *  - `paperVerified: true` — set by a caller that knows the request went to
 *    paper-api.alpaca.markets (the serverless proxy hardcodes that host and
 *    echoes it back in a header).
 *  - Alpaca paper account numbers begin with "PA".
 *
 * Anything else — no account object, a live-looking account number, a network
 * error that left `account` null — is unverifiable, and unverifiable rejects.
 */
export function paperStatus(account) {
  if (!account || typeof account !== "object") {
    return { verified: false, why: "no account data was returned, so paper mode could not be checked" };
  }
  if (account.paperVerified === true) {
    return { verified: true, why: account.paperSource || "the request was routed to the paper endpoint" };
  }
  const n = String(account.account_number || "");
  if (/^PA/i.test(n)) {
    return { verified: true, why: `account number ${n} (Alpaca paper accounts start with PA)` };
  }
  return {
    verified: false,
    why: n
      ? `account number ${n} does not identify a paper account`
      : "the account does not say whether it is paper or live",
  };
}

/**
 * Defined risk = every short leg is covered by a long leg of the same type.
 *
 * Per option type, if the short quantity exceeds the long quantity the
 * structure carries a naked leg: unlimited loss for calls, a very large and
 * uncapped-by-design loss for puts. Both are forbidden (CLAUDE.md rule 2).
 * Strike order does not matter — a bull call spread and a bear call spread are
 * both defined; a 1x2 ratio is not.
 */
export function undefinedRiskLegs(legs) {
  const bad = [];
  for (const type of ["call", "put"]) {
    const of = (legs || []).filter((l) => l && l.type === type);
    const long = of.filter((l) => Number(l.side) > 0).reduce((a, l) => a + abs(l.qty || 1), 0);
    const short = of.filter((l) => Number(l.side) < 0).reduce((a, l) => a + abs(l.qty || 1), 0);
    if (short > long) bad.push({ type, short, long, uncovered: short - long });
  }
  return bad;
}

/** Total dollars already at risk across open positions. */
function openRiskOf(portfolio) {
  if (!portfolio) return 0;
  if (isNum(portfolio.openRisk)) return abs(portfolio.openRisk);
  return (portfolio.positions || []).reduce(
    (a, p) => a + abs(p?.maxLoss) * Math.max(1, Number(p?.contracts) || 1), 0);
}

/** Dollars this proposal puts at risk: max loss per combo × number of combos. */
function tradeRiskOf(proposal) {
  if (isNum(proposal?.riskDollars)) return abs(proposal.riskDollars);
  return abs(proposal?.maxLoss) * Math.max(1, Number(proposal?.contracts) || 1);
}

const V = (code, message) => ({ code, message });

/* ============================== the gate ============================== */

/**
 * @param {object}   arg
 * @param {object}   arg.proposal  what we want to send:
 *        { legs, maxLoss, maxProfit, dte, contracts, intent, pnl, ticker, name }
 *        `intent` is "open" (default) or "close". Entry-only rules — sizing,
 *        exposure, entry DTE, defined risk — do not apply to an order that
 *        REDUCES risk; the paper-mode block and the warnings always apply.
 *        Two optional fields feed the priceability check, and the more of them
 *        a caller passes the more it can catch: `quotes` — one `{ bid, ask }`
 *        per leg, aligned with `legs`, straight off the chain — and `net`, the
 *        structure's net price per share. Neither is required: the maximum loss
 *        alone already blocks the case that got through.
 * @param {object}   arg.portfolio { positions[] | openRisk, account }
 * @param {object}   arg.capital   the onboarding answers, PRD §3:
 *        { tradingCapital, concurrentTarget, savings, override }
 * @param {object}   arg.signals   fuseSignals() output: { agreement, confidence }
 * @returns {{ pass: boolean, violations: object[], warnings: object[], limits: object }}
 */
export function evaluateTrade({ proposal, portfolio, capital, signals } = {}) {
  const violations = [];
  const warnings = [];

  const p = proposal || {};
  const intent = p.intent === "close" ? "close" : "open";
  const isOpen = intent === "open";
  const limits = sizing(capital || {});
  const cap = limits.tradingCapital;

  /* ---- 1. paper mode. Rule 1: if it cannot be verified, reject. ---- */
  const paper = paperStatus(portfolio?.account);
  if (!paper.verified) {
    violations.push(V("PAPER_MODE",
      `Paper mode not verified: ${paper.why}. Non-negotiable rule 1 of this platform is paper ` +
      `trading only, so an order it cannot prove is paper does not leave — not even a closing one.`));
  }

  /* ---- 2. the structure exists at all ---- */
  const legs = Array.isArray(p.legs) ? p.legs : [];
  if (isOpen && legs.length === 0) {
    violations.push(V("NO_STRUCTURE",
      `The proposal has 0 legs, so there is no maximum loss to measure against your ` +
      `${money(limits.perTradeLimit)} per-trade limit. Nothing is sent.`));
  }

  /* ---- 3. defined risk only ---- */
  if (isOpen && legs.length) {
    const naked = undefinedRiskLegs(legs);
    for (const n of naked) {
      violations.push(V("UNDEFINED_RISK",
        `${n.uncovered} short ${n.type}${n.uncovered === 1 ? "" : "s"} ${n.uncovered === 1 ? "is" : "are"} ` +
        `not covered by a long ${n.type} (${n.short} short vs ${n.long} long). ` +
        `${n.type === "call" ? "The loss on an uncovered short call has no ceiling" : "An uncovered short put risks the whole strike"}, ` +
        `so the worst case cannot be printed before you send the order. Defined-risk structures only.`));
    }
  }
  if (isOpen && !isNum(p.maxLoss)) {
    violations.push(V("UNDEFINED_RISK",
      `Maximum loss is ${p.maxLoss === undefined ? "missing" : String(p.maxLoss)}, not a finite number, ` +
      `so it cannot be measured against your ${money(limits.perTradeLimit)} per-trade limit. ` +
      `A trade whose worst case cannot be computed cannot be sent.`));
  }

  /* ---- 3b. THE WORST CASE HAS TO COME FROM A REAL PRICE ----
     A finite maximum loss is not the same as a known one. A butterfly on BOIL
     priced at a net debit of zero reported a maximum loss of -$0 and passed
     every check below it, because -1e-14 is a finite number: the arithmetic was
     sound and the input was a market maker's placeholder on a strike nobody
     trades. Unknown is a VIOLATION, not a pass — rule 2 is that the maximum
     loss is always known, and nothing about "always" is satisfied by a zero the
     app cannot account for.

     `priceability()` in rules.js is the one implementation of that test, shared
     with the three places candidates are generated. The quality floors are NOT
     applied here and never will be: they ask whether a structure was worth
     offering, and a trade the user builds by hand on the desk is his to make.
     Whether it has a price at all is a different question, and it is this one. */
  if (isOpen && legs.length) {
    const pr = priceability({
      legs,
      quotes: Array.isArray(p.quotes) ? p.quotes : [],
      net: isNum(p.net) ? Number(p.net) : null,
      maxLoss: isNum(p.maxLoss) ? Number(p.maxLoss) : null,
    });
    if (!pr.priceable) {
      violations.push(V("UNPRICEABLE",
        `${pr.reasons[0]} Nothing is sent: below ${money(MIN_NET_DOLLARS)} a contract there is no maximum ` +
        `loss to measure against ${limits.answered ? "your" : "the suggested"} ` +
        `${money(limits.perTradeLimit)} per-trade limit.`));
    }
  }

  /* ---- 4. per-trade limit (the one the demo video shows) ---- */
  const tradeRisk = tradeRiskOf(p);
  if (isOpen && isNum(p.maxLoss) && tradeRisk > limits.perTradeLimit) {
    violations.push(V("PER_TRADE_LIMIT",
      `Max loss ${money(tradeRisk)} = ${pctText(tradeRisk / cap)} of capital ` +
      `(your limit: ${pctText(limits.perTradeLimit / cap)}, i.e. ${money(limits.perTradeLimit)}).`));
  }

  /* ---- 5. total exposure ---- */
  const openRisk = openRiskOf(portfolio);
  const totalAfter = openRisk + (isOpen ? tradeRisk : 0);
  if (isOpen && totalAfter > limits.totalLimit) {
    violations.push(V("TOTAL_EXPOSURE",
      `Total exposure would be ${money(totalAfter)} = ${pctText(totalAfter / cap)} of capital ` +
      `(${money(openRisk)} already open + ${money(tradeRisk)} for this trade). ` +
      `Your limit: ${pctText(RULES.totalExposurePct)}, i.e. ${money(limits.totalLimit)}.`));
  }

  /* ---- 6. DTE at entry ---- */
  if (isOpen && isNum(p.dte) && Number(p.dte) < RULES.minEntryDTE) {
    const room = Math.round(Number(p.dte) - RULES.exitDTE);
    violations.push(V("ENTRY_DTE",
      `Entry at ${Math.round(Number(p.dte))} DTE is below the ${RULES.minEntryDTE} DTE minimum. ` +
      `The exit rule fires at ${RULES.exitDTE} DTE, so this trade would have ` +
      `${room <= 0 ? "no days at all" : `only ${room} day${room === 1 ? "" : "s"}`} to work before it must be closed.`));
  }

  /* ---- warnings: shown, never blocking ---- */
  // The gate always enforces SOMETHING — a proposal cannot wait for a
  // questionnaire — but it must never let a suggested figure pass itself off as
  // the user's own limit. When the capital questions are unanswered the numbers
  // above come from the suggested starting point, and the gate says so out loud.
  if (isOpen && !limits.answered) {
    warnings.push(V("CAPITAL_NOT_SET", capitalSourceNote(limits)));
  }
  if (signals && signals.agreement === "CONFLICT") {
    warnings.push(V("SIGNAL_CONFLICT",
      `The four factors disagree (agreement: CONFLICT, score ${isNum(signals.score) ? signals.score : "n/a"}/100, ` +
      `confidence ${isNum(signals.confidence) ? signals.confidence : "n/a"}/100). ` +
      `${signals.narrative || "Read the narrative before you send this."}`));
  }
  if (signals && isNum(signals.confidence) && Number(signals.confidence) < RULES.lowConfidence) {
    warnings.push(V("LOW_CONFIDENCE",
      `Signal confidence is ${Math.round(Number(signals.confidence))}/100, under the ` +
      `${RULES.lowConfidence} mark. The signal is not saying much either way.`));
  }
  if (isNum(p.pnl) && isNum(p.maxLoss) && abs(p.maxLoss) > 0) {
    const stopAt = -RULES.stopLossPct * abs(p.maxLoss) * Math.max(1, Number(p.contracts) || 1);
    if (Number(p.pnl) <= stopAt) {
      warnings.push(V("STOP_LOSS_REACHED",
        `P&L is ${money(p.pnl)}, at or past the ${pctText(RULES.stopLossPct)} stop ` +
        `(${money(stopAt)} of a ${money(tradeRisk)} maximum loss). ` +
        `This is a warning, not an automatic close: the evidence for auto-closing here is thin.`));
    }
  }

  return {
    pass: violations.length === 0,
    violations,
    warnings,
    intent,
    limits: {
      answered: limits.answered,
      tradingCapital: cap,
      perTrade: limits.perTradeLimit,
      total: limits.totalLimit,
      tradeRisk,
      openRisk,
      totalAfter,
      paper,
    },
  };
}

/** One-line summary for a log, a timeline entry or a webhook brief. */
export function gateSummary(result) {
  if (!result) return "risk gate not run";
  if (result.pass) {
    return result.warnings.length
      ? `PASS with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}: ` +
        result.warnings.map((w) => w.message).join(" ")
      : "PASS: within every rule.";
  }
  return `BLOCKED: ${result.violations.map((v) => v.message).join(" ")}`;
}

export default evaluateTrade;
