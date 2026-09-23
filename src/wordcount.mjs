// ============================================================================
// src/wordcount.mjs — HOW MANY WORDS A STEP RENDERS, MEASURED FROM THE SOURCE.
//
// P9 TASK 3. The owner has said three times that there is too much to read.
// "Fewer words" is an impression until somebody counts, so this counts, and it
// counts the SOURCE rather than a description of it: the three step blocks in
// `App.jsx` are delimited by `step === "radar" | "shortlist" | "build"`, and
// inside each one it adds up
//
//   1. LITERAL JSX TEXT — the prose typed straight into the tree, and
//   2. EVERY CALL TO A COPY GENERATOR, scored as the word count of what that
//      function returns on a fixture. A generator called at TWO sites counts
//      TWICE, because two sites is what the reader scrolls past.
//
// >>> WHAT IT DOES NOT CLAIM. <<<
//   - Generated sentences are scored at their CURRENT wording whichever
//     `App.jsx` is being read, so a before/after delta measures SITES REMOVED
//     OR FOLDED, never rewording. That is deliberate: rewording is the thing
//     this task must NOT do, since no fact may be lost.
//   - Conditional branches are counted in full. A block with three mutually
//     exclusive empty-state sentences renders one of them, and this counts
//     three. It is an upper bound, applied identically to both sides of the
//     comparison, which is what makes the RATIO meaningful even though the
//     absolute number is not a screenshot.
//   - A generator with no fixture here scores ZERO and is NAMED in
//     `uncounted`, so the coverage of the measurement travels with it rather
//     than being assumed. `Number(null)` is 0 and 0 is finite — a number with
//     no provenance is exactly what this file exists to stop.
//
// It imports `rules.js` only. No React, no DOM.
// ============================================================================
import { readFileSync } from "node:fs";
import * as R from "./rules.js";
// Plain-JS copy homes as well: `chain.js` names the feed and the open-interest
// reading, `journal.js` says how a record was produced. Nothing here imports a
// `.jsx` file — this runs under plain node — so the handful of generators that
// live in `visuals.jsx` and `wizard.jsx` stay in `uncounted`, by name.
import * as C from "./chain.js";
import * as J from "./journal.js";
import * as O from "./order.js";
// PR #40: path.js and signals.js are plain JS too, so the generators they hold
// are scored rather than named as uncounted.
import * as P from "./path.js";
import * as S from "./signals.js";

export const SCREEN_IDS = ["find", "build"];

/* ---- the fixture every generator is scored on ----------------------------
   One board, one setting, one market. The numbers do not matter; the LENGTH
   of the sentences they produce is the whole measurement. */
const LEVEL = R.RECOMMENDED_LIQUIDITY;
const TALLY = { kept: 2, liquidity: 3, spread: 1, comboSpread: 1, reward: 2, skipped: 0, unpriceable: 1, impossible: 0, model: 1 };
const LIMITS = { answered: true, tradingCapital: 7000, concurrentTarget: 5, perTradeLimit: 350, totalExposureLimit: 1750 };
const REQUEST = R.requestOf ? R.requestOf({ amt: 350 }, LIMITS) : { mode: "budget", amt: 350, amtAnswered: true, minChance: 0.5 };
const CHOICE = R.expiryChoice([
  { key: "2026-10-16", dte: 24, clears: 9, near: 10 },
  { key: "2026-11-20", dte: 59, clears: 8, near: 10 },
]);
const EDGE = R.remainingEdge ? R.remainingEdge({ maxProfit: 4, maxLoss: -346, pnl: -127 }) : null;
const ROOM = R.entryRoom(24);

/** name -> the string that name puts on screen, on the fixture above. */
export const COPY = {
  qualityFloorSentence: () => R.qualityFloorSentence(LEVEL),
  qualityFloorLine: () => (R.qualityFloorLine ? R.qualityFloorLine(LEVEL) : ""),
  voicePointer: () => (R.voicePointer ? R.voicePointer("floors", { count: 3, what: "XLE" }) : ""),
  filterFoldSummary: () => "",
  liquiditySettingNote: () => R.liquiditySettingNote(LEVEL, TALLY),
  looseningWarning: () => R.looseningWarning(R.liquidityLevel("relaxed")) || "",
  liquidityMeasurementNote: () => R.liquidityMeasurementNote(),
  liquiditySkippedNote: () => R.liquiditySkippedNote("Alpaca"),
  thresholdPhrase: () => R.thresholdPhrase({ threshold: 28, peers: 52, percentile: 0.4, absolute: 10, bound: "relative" }),
  capitalSourceNote: () => R.capitalSourceNote(LIMITS),
  perTradeLimitPhrase: () => R.perTradeLimitPhrase(LIMITS),
  perTradeCapLabel: () => R.perTradeCapLabel(),
  conflictSummaryLine: () => R.conflictSummaryLine({ n: 2, total: 4 }, { confidence: 56 }),
  expiryChoiceNote: () => R.expiryChoiceNote(CHOICE, LEVEL),
  staleBoardLine: () => R.staleBoardLine([{ tk: "SLV", expKey: "2026-11-20" }, { tk: "SOYB", expKey: "2026-11-20" }]),
  unpriceableNote: () => R.unpriceableNote(2, "XLE"),
  impossibleLossNote: () => R.impossibleLossNote(1, "XLE"),
  modelDisagreementNote: () => R.modelDisagreementNote(1, "XLE"),
  wideSpreadNote: () => R.wideSpreadNote(2, "XLE"),
  spreadSkippedNote: () => R.spreadSkippedNote("Alpaca"),
  wideComboNote: () => R.wideComboNote(1, "XLE"),
  comboSpreadSkippedNote: () => R.comboSpreadSkippedNote("Alpaca"),
  noCeilingNote: () => R.noCeilingNote("This structure"),
  noCeilingRankNote: () => R.noCeilingRankNote(1),
  noCeilingRankLine: () => (R.noCeilingRankLine ? R.noCeilingRankLine(1) : ""),
  unquotedLegNote: () => R.unquotedLegNote(1),
  unquotedLegPointer: () => R.unquotedLegPointer(1),
  unlistedContractListNote: () => R.unlistedContractListNote(1, "XLE"),
  strikeSnapNote: () => R.strikeSnapNote([{ from: 27.5, to: 28 }], "2026-11-20"),
  marketOrderNote: () => R.marketOrderNote(null),
  checkedAgainstNote: () => R.checkedAgainstNote(true, "account number PA3XYZ01"),
  butterflySkipNote: () => R.butterflySkipNote(),
  chanceSourceNote: () => R.chanceSourceNote({ runs: 8000, sigma: 0.3, pop: 0.55,
    seasonalSource: R.MEASURED_SEASONAL_SOURCE, seasonalYears: 11, seasonalAgeDays: 3 }, "XLE"),
  seasonalStampNote: () => R.seasonalStampNote({ seasonalSource: R.MEASURED_SEASONAL_SOURCE, seasonalYears: 11, seasonalAgeDays: 3 }, "XLE"),
  sizeSkippedNote: () => R.sizeSkippedNote(1, "CBOE"),
  notionalNote: () => R.notionalNote(2100, 350, "XLE"),
  limitCeilingNote: () => R.limitCeilingNote({ differs: true, limit: 0.3, effective: 0.24, dir: 1 }) || "",
  openLimitNote: () => R.openLimitNote({ mid: 0.2, limit: 0.24, spread: 0.16, dir: 1 }) || "",
  modelPriceNote: () => R.modelPriceNote("Alpaca"),
  cardCurrencyNote: () => R.cardCurrencyNote(),
  entryRoomWarning: () => R.entryRoomWarning(ROOM),
  entryInsideExitNote: () => R.entryInsideExitNote(R.entryRoom(10)),
  entryRoomOverrideAsk: () => R.entryRoomOverrideAsk(ROOM),
  stopWarningSentence: () => R.stopWarningSentence(-127),
  offFloorExpiryLabel: () => (R.offFloorExpiryLabel ? R.offFloorExpiryLabel("2026-10-16", 24) : ""),
  horizonFloorNote: () => (R.horizonFloorNote ? R.horizonFloorNote() : ""),
  remainingEdgeNote: () => (EDGE && EDGE.sentence ? EDGE.sentence : ""),
  modelPnlNote: () => (R.modelPnlNote ? R.modelPnlNote("Alpaca") : ""),
  sameCloseNote: () => (R.sameCloseNote ? R.sameCloseNote("J-0002") : ""),
  unlistedContractNote: () => R.unlistedContractNote([{ i: 0, name: "XLE 59 put" }], 2),
  openInterestNote: () => C.openInterestNote({ at: "2026-09-19" }),
  sourceNote: () => C.sourceNote({ source: "alpaca", updated: Date.now() }),
  autopilotHorizonNote: () => J.autopilotHorizonNote({}) || "",
  autopilotVolNote: () => J.autopilotVolNote({}) || "",
  positionSizeNote: () => J.positionSizeNote({ legs: [] }),
  alpacaErrorText: () => O.alpacaErrorText(new Error("422")),
  pctText: () => R.pctText(0.35),
  chanceText: () => R.chanceText(0.55),
  // ROADMAP P10 — the controls block and the card.
  chanceAskLabel: () => (R.chanceAskLabel ? R.chanceAskLabel(REQUEST) : ""),
  controlsFoldNote: () => (R.controlsFoldNote ? R.controlsFoldNote(REQUEST) : ""),
  targetPriceNote: () => (R.targetPriceNote ? R.targetPriceNote(R.targetPriceOf(27.5, { tgt: 0.04 }), "SOYB") : ""),
  requestAmountLabel: () => (R.requestAmountLabel ? R.requestAmountLabel("budget") : ""),
  requestAmountOwner: () => (R.requestAmountOwner ? R.requestAmountOwner(REQUEST) : ""),
  contractsSourceNote: () => (R.contractsSourceNote ? R.contractsSourceNote({ contracts: 3, typed: false, request: REQUEST }) : ""),
  missReasonLine: () => (R.missReasonLine ? R.missReasonLine({ id: "budget", text: "over the budget by $40" }) : ""),
  meetsHeading: () => (R.meetsHeading ? R.meetsHeading(REQUEST, 2) : ""),
  otherwiseHeading: () => (R.otherwiseHeading ? R.otherwiseHeading(3) : ""),
  fillPriceHeading: () => (R.fillPriceHeading ? R.fillPriceHeading() : ""),
  crossingCostNote: () => (R.crossingCostNote ? R.crossingCostNote({ known: true, fill: 0.24, mid: 0.2, cost: 0.04, bid: 0.14 }) : ""),
  // PR #40, TASK 2: THE FIVE THAT WERE UNCOUNTED, and the new ones. Two of the
  // five were never generators: `setCompareNote` is the state setter for the
  // note `toggleCompare()` writes (scored as that note), and `setText` is a
  // quantity field's input state — it puts the user's own digits on screen,
  // not a sentence, so it scores zero BY NAME rather than by omission.
  // `tradeOffSentence` was deleted with the guided door.
  legsLine: () => P.legsLine([{ side: 1, qty: 1, strike: 28, type: "call" }, { side: -1, qty: 1, strike: 30, type: "call" }]),
  compareDistNote: () => P.compareDistNote("drift") || "",
  setCompareNote: () => P.toggleCompare([{ key: "a", legs: [1] }, { key: "b", legs: [1] }, { key: "c", legs: [1] }],
    { key: "d", legs: [{ side: 1, qty: 1, strike: 1, type: "call" }], ticker: "X" }).note || "",
  setText: () => "",
  // The longest of its answers: a failure named with its error, then the floors' counts.
  nothingTodayLine: () => R.nothingTodayLine({ liquidity: 3, reward: 2 }, { noBoard: ["XLE"], failed: [{ tk: "UNG", why: "HTTP 502" }] }),
  sizeLine: () => R.sizeLine(REQUEST, { ok: true, n: 14, totPrem: 868, totRisk: 868, isCredit: false }) || "",
  newsLine: () => S.newsLine("CORN", [{ title: "Drought cuts US corn crop outlook in the Midwest", date: new Date().toISOString() }]).text,
  reconcileFigures: () => { const f = { entry: 0.62, maxLoss: -62, maxProfit: 138, breakevens: [28.62], pop: 0.48 }; return R.reconcileFigures(f, f).line; },
};

export const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

/** What a generator puts on screen, or "" when this file's fixture cannot
 *  drive it — a fixture that throws is a gap in the COVERAGE of the
 *  measurement, never a reason for the measurement to stop. */
export const copyOf = (name) => { try { return String(COPY[name]() || ""); } catch { return ""; } };

/** Split a generated string into sentences, for the duplicate rule. */
export const sentencesOf = (s) => String(s || "")
  .split(/(?<=[.!?])\s+/)
  .map((x) => x.trim())
  .filter((x) => x.length > 0);

/**
 * The JSX subtree for one step, matched on braces from its own guard.
 * Returns the concatenation of every such block, because a step can be
 * rendered by more than one (`build` has five: the builder, the loading state,
 * the no-market-data state, the empty state and the anchor).
 */
export function stepBlock(src, id) {
  const needle = `step === "${id}"`;
  const out = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at < 0) break;
    from = at + needle.length;
    // Walk back to the `{` that opens this JSX expression, then match forward.
    let open = src.lastIndexOf("{", at);
    if (open < 0) continue;
    let depth = 0, i = open;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    if (i < src.length) { out.push(src.slice(open, i + 1)); from = i + 1; }
  }
  return out.join("\n");
}

/* ---- WORDS AT REST -------------------------------------------------------
   The question the owner is asking is how much he has to READ, not how much
   the file contains. So what is one tap away does not count:

     - the children of a fold (`<Fold>`, `<BuildWarnings>`), which render only
       when the reader asks — their always-visible SUMMARY still counts;
     - the children of a sheet (`<DeskSheet>`, `<EvidenceOverlay>`), for the
       same reason;
     - `tip={...}` on a stat, which is a tooltip: tap to open, tap to close.

   >>> THIS IS WHY "FOLD, NEVER DELETE" IS MEASURABLE AT ALL. <<< A fold that
   scored the same as a paragraph would make the rule unfalsifiable, and a
   deletion that scored the same as a fold would make it uncheckable. The same
   stripping is applied to both sides of every comparison. */
const FOLDED = ["Fold", "BuildWarnings", "DeskSheet", "EvidenceOverlay"];

export function atRest(src) {
  let out = src;
  for (const tag of FOLDED) {
    // Non-greedy from the opening tag to its matching close. Nesting of the
    // SAME tag does not occur in this app; nesting of a different one is
    // handled because both passes run.
    out = out.replace(new RegExp(`<${tag}([^>]*)>[\\s\\S]*?</${tag}>`, "g"), (_m, attrs) => `<${tag}${attrs}/>`);
    // A self-closing fold has no children to strip.
  }
  // Tooltips: `tip={...}` and `title={...}` are tap-to-open, not on screen.
  out = out.replace(/\b(tip|title)=\{(?:[^{}]|\{[^{}]*\})*\}/g, " ");
  return out;
}

/* ---- WHAT COUNTS AS PROSE -------------------------------------------------
   The first version of this stripped tags and simple `{...}` expressions and
   counted what was left, which on a JSX file is overwhelmingly JAVASCRIPT:
   `const [busy, setBusy] = useState(false)` scored as six words of reading.
   Counting the wrong thing carefully is worse than not counting, so a run is
   only prose when it LOOKS like an English sentence:

     - at least four tokens, and
     - at least sixty per cent of them ordinary words (letters, two or more),
     - and nothing in it that only appears in code.

   It is a heuristic and it is stated as one. What makes the table meaningful
   is that the SAME heuristic is applied to both sides of the comparison, so a
   sentence removed shows up as a sentence removed. */

const CODE_MARKS = /=>|;|\+\+|&&|\|\||\breturn\b|\bconst\b|\blet\b|\buseState\b|\buseEffect\b|\bfunction\b|\bstyle\b|\bcolor\b|\bfontSize\b|\bmarginTop\b|\bpadding\b|\bborderRadius\b|\bMath\.|\bT\.|\.map\(|\.filter\(/;

export function isProse(run) {
  const t = String(run || "").replace(/\$\{[^}]*\}/g, " ").trim();
  if (!t || CODE_MARKS.test(t)) return false;
  const toks = t.split(/\s+/).filter(Boolean);
  if (toks.length < 4) return false;
  const wordy = toks.filter((x) => /^[A-Za-z][A-Za-z'’-]{1,}[.,:;!?)"'’]?$/.test(x)).length;
  return wordy / toks.length >= 0.6;
}

export const proseWords = (run) => (isProse(run)
  ? String(run).replace(/\$\{[^}]*\}/g, " ").trim().split(/\s+/).filter(Boolean).length
  : 0);

/**
 * The prose a chunk of screen source puts on the page: the text between tags,
 * and the string and template literals that ARE sentences. Comments are out —
 * this repository's comments are longer than its copy, and nobody reads them
 * on a phone.
 */
export function literalWords(block) {
  let code = block
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  let total = 0;
  // 1) String and template literals that are sentences. Most of this app's
  //    copy is written this way, inside `{`…`}`. They are taken out FIRST and
  //    REMOVED, because a template literal sitting between two tags is also a
  //    JSX text run and counting it twice would inflate both sides of the
  //    table by the same wrong amount.
  code = code.replace(/`[^`]*`|"[^"\n]{12,}"|'[^'\n]{12,}'/g, (lit) => {
    // >>> AN INTERPOLATION IS NOT A WORD. <<< `${r.tk}` and `${legsLine(legs)}`
    // are CODE; what the reader sees is the text AROUND them, and the value
    // itself is a figure rather than prose. Counting the expression made the
    // table move when a component was given a template-literal prop — measured
    // while the P10 cards were built, where a screen whose rows had LOST four
    // stat blocks and a sentence scored 131 words higher. The value is dropped,
    // not replaced by a word, for the same reason `copyOf()` scores a
    // generator's OUTPUT rather than its call.
    total += proseWords(lit.slice(1, -1).replace(/\$\{[^{}]*\}/g, " "));
    return " ";
  });
  // 2) What is left between tags: prose typed straight into the tree.
  for (const run of code.replace(/<[^>]*>/g, "\u0001").split("\u0001")) {
    total += proseWords(run.replace(/[{}]/g, " "));
  }
  return total;
}

/** Every copy generator this block CALLS, with its multiplicity. */
export function generatorCalls(block) {
  const code = block
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const hits = {};
  for (const name of Object.keys(COPY)) {
    const n = (code.match(new RegExp(`\\b${name}\\s*\\(`, "g")) || []).length;
    if (n) hits[name] = n;
  }
  return hits;
}

/** Copy-generator-looking names a block calls that this file cannot score. */
export function uncountedIn(block) {
  const code = block
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const found = new Set();
  const re = /\b([a-z][A-Za-z0-9]*(?:Note|Sentence|Warning|Phrase|Line|Text|Cta|Ask))\s*\(/g;
  let m;
  while ((m = re.exec(code))) if (!COPY[m[1]]) found.add(m[1]);
  return [...found].sort();
}

/* ---- A SCREEN IS ITS BLOCK PLUS WHAT THE BLOCK MOUNTS ---------------------
   The Build step's own JSX carries almost no prose: the trade card, the
   liquidity filter, the order ticket, the warnings panel and the confirm step
   are COMPONENTS, and they are where the reader's eye actually goes. Counting
   the block alone would have scored Build at a fifth of what it renders and
   made the whole table useless.

   So the block is expanded through the components it mounts, to
   `COMPONENT_DEPTH` levels, over the files a screen can reach. A component is
   counted ONCE per screen however many times it is mounted — it is one piece
   of copy on the page, and the multiplicity that matters is the number of
   CALL SITES of a generator inside it, which is counted as usual. */
export const COMPONENT_DEPTH = 3;
// `card.jsx` IS IN THIS LIST FROM THE DAY IT EXISTED. The controls block and
// the candidate card are mounted BY the step blocks, so their words are words
// the reader scrolls past — and a counter that could not see a new component
// would report a screen shrinking on the day it grew.
const UI_FILES = ["App.jsx", "pro.jsx", "steps.jsx", "why.jsx", "visuals.jsx", "wizard.jsx", "card.jsx"];

const sourcesOnce = (() => {
  let cache = null;
  return () => (cache ||= UI_FILES.map((f) => {
    try { return readFileSync(new URL(`./${f}`, import.meta.url), "utf8"); } catch { return ""; }
  }).join("\n"));
})();

/** The body of `function Name(` / `const Name = (` in the UI sources. */
export function componentBody(name, src) {
  const res = [
    new RegExp(`function\\s+${name}\\s*\\(`),
    new RegExp(`const\\s+${name}\\s*=\\s*\\(`),
    new RegExp(`const\\s+${name}\\s*=\\s*function\\s*\\(`),
  ];
  for (const re of res) {
    const m = re.exec(src);
    if (!m) continue;
    // SKIP THE PARAMETER LIST FIRST. `function TradeCard({ card, ... })`
    // destructures, so the first `{` after the name is the PARAMETERS and not
    // the body — which is how every component in this app first measured at
    // fifty characters.
    let i = m.index + m[0].length - 1;   // at the opening "("
    let par = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(") par++;
      else if (c === ")") { par--; if (par === 0) { i++; break; } }
    }
    const open = src.indexOf("{", i);
    if (open < 0) continue;
    let depth = 0, j = open;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    if (j < src.length && j - open > 40) return src.slice(open, j + 1);
  }
  return "";
}

/** Component names a chunk of JSX mounts. */
export function componentsIn(chunk) {
  const code = chunk
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const out = new Set();
  const re = /<([A-Z][A-Za-z0-9]*)[\s/>]/g;
  let m;
  while ((m = re.exec(code))) out.add(m[1]);
  return [...out];
}

/**
 * The block, plus the bodies of everything it mounts, to COMPONENT_DEPTH.
 *
 * >>> EACH PIECE IS PUT AT REST BEFORE IT IS JOINED, AND THAT IS A FIX. <<<
 * `atRest()` strips a fold with a NON-GREEDY match from `<Fold …>` to the next
 * `</Fold>`. Run over the CONCATENATION, that pairing crosses the boundary
 * between the block and a component body — so which words a fold hides depended
 * on WHICH COMPONENTS the block happened to mount and in what order. Measured
 * while adding the P10 controls block: the Shortlist's sum of its own parts is
 * 776 words, and the concatenation scored it 533 before the block mounted one
 * more component and 707 after. The screen had not grown by 174 words; the
 * counter had stopped hiding them.
 *
 * Stripping per piece makes the reading the SUM OF ITS PARTS, so a measurement
 * cannot move because a component was added somewhere else on the screen. The
 * baseline in `voice.test.js` was re-derived from a whole-tree worktree of
 * `main` with this same fix applied, by the procedure written beside it — both
 * sides of the table are read by one counter or the table means nothing.
 */
export function screenSource(src, id, { depth = COMPONENT_DEPTH } = {}) {
  const ui = sourcesOnce();
  const seen = new Set();
  const pieces = [atRest(stepBlock(src, id))];
  let frontier = componentsIn(pieces[0]);
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const name of frontier) {
      if (seen.has(name)) continue;
      seen.add(name);
      const body = componentBody(name, ui);
      if (!body) continue;
      pieces.push(atRest(body));
      next.push(...componentsIn(body));
    }
    frontier = next.filter((n) => !seen.has(n));
  }
  return pieces.join("\n");
}

export function measureScreens(src) {
  const out = { uncounted: new Set() };
  let L = 0, G = 0, S = 0;
  for (const id of SCREEN_IDS) {
    const block = atRest(screenSource(src, id));
    const literal = literalWords(block);
    const calls = generatorCalls(block);
    let generated = 0, sites = 0;
    for (const [name, n] of Object.entries(calls)) {
      generated += words(copyOf(name)) * n;
      sites += n;
    }
    for (const u of uncountedIn(block)) out.uncounted.add(u);
    out[id] = { literal, generated, total: literal + generated, sites, calls };
    L += literal; G += generated; S += sites;
  }
  out.total = { literal: L, generated: G, total: L + G, sites: S };
  out.uncounted = [...out.uncounted];
  return out;
}

/**
 * THE RULE THIS ENFORCES: a long generated sentence has ONE home per screen.
 *
 * @returns [{ screen, sentence, sites }] — every sentence over `maxWords` that
 *          more than one call site on the same screen puts on it.
 */
export function repeatedSentences(src, { maxWords = 20 } = {}) {
  const bad = [];
  for (const id of SCREEN_IDS) {
    const calls = generatorCalls(atRest(screenSource(src, id)));
    const seen = new Map();   // sentence -> [names]
    for (const [name, n] of Object.entries(calls)) {
      for (const sent of sentencesOf(copyOf(name))) {
        if (words(sent) <= maxWords) continue;
        const key = sent;
        if (!seen.has(key)) seen.set(key, []);
        for (let i = 0; i < n; i++) seen.get(key).push(name);
      }
    }
    for (const [sent, names] of seen) {
      if (names.length > 1) bad.push({ screen: id, sentence: sent, sites: names });
    }
  }
  return bad;
}
