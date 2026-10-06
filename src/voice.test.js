// ============================================================================
// src/voice.test.js — P9 TASK 3: EACH EXPLANATION ONCE PER SCREEN.
//
// >>> COUNTED ON THE OWNER'S SCREENS, 22 September 2026. <<<
//
//   - the floor paragraph, `qualityFloorSentence()` — ONE HUNDRED AND
//     SIXTY-TWO WORDS — rendered TWICE on the Radar and TWICE on the
//     Shortlist;
//   - the four-factor CONFLICT narrative across Build and its overlay;
//   - "Every figure on this card is in US dollars" on every card.
//
// His words, for the fourth time: "si capisce poco dalla UI. Troppe info da
// leggere, poco intuitivo."
//
// THE RULE THIS FILE ENFORCES: a long generated sentence has ONE HOME PER
// SCREEN. It reads the SOURCE — `App.jsx`'s three step blocks, expanded
// through the components they mount — so it cannot drift from what actually
// renders, the same discipline `riskGate.test.js`'s sweeps hold.
//
// AND IT COUNTS WORDS AT REST. What is behind a fold, a sheet or a tooltip is
// one tap away and does not count; that is what makes "FOLD, NEVER DELETE"
// measurable rather than a slogan.
// ============================================================================
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  measureScreens, repeatedSentences, SCREEN_IDS, stepBlock, screenSource, atRest,
  words, sentencesOf, isProse, generatorCalls, copyOf, COPY,
} from "./wordcount.mjs";
import { qualityFloorSentence, qualityFloorLine, voicePointer, filterFold, VOICE_HOMES,
  RECOMMENDED_LIQUIDITY, copilotOverreach, copilotOverreachNote } from "./rules.js";
import { isTestRecord, testRecordNote, scoredJournal } from "./journal.js";
import { SURFACE_IDS, SURFACE_BUDGET, SURFACE_BEFORE, renderedWords } from "./wordcount.mjs";
import { measureSurfaces } from "../scripts/surfaces.mjs";

let passed = 0; const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}`); }
};

const APP = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

/* ================================================================
   1. THE RULE, AND IT FAILS THE BUILD
================================================================ */

test("NO SENTENCE OVER 20 WORDS RENDERS TWICE ON ONE SCREEN", () => {
  const bad = repeatedSentences(APP, { maxWords: 20 });
  const report = bad.map((b) =>
    `\n    [${b.screen}] via ${[...new Set(b.sites)].join(" + ")}\n      "${b.sentence.slice(0, 110)}…"`).join("");
  assert.equal(bad.length, 0,
    `${bad.length} long sentence(s) render more than once on one screen:${report}\n` +
    `  Fold the second site, or print a one-line pointer there (voicePointer / qualityFloorLine).`);
});

test("…and the check can SEE a repeat, so it is a check and not a wall", () => {
  /* The matcher has to be capable of failing, or a passing run proves
     nothing. The floor paragraph is what it was built for: two call sites of
     `qualityFloorSentence` on one screen is exactly the fault, and at a
     threshold of one word every multi-word sentence repeats. */
  const twice = `
    {step === "find" && (<div>{qualityFloorSentence(a)}{qualityFloorSentence(b)}</div>)}
  `;
  const seen = repeatedSentences(twice, { maxWords: 20 });
  assert.ok(seen.length > 0, "two sites of a 162-word paragraph on one screen must be caught");
  assert.equal(seen[0].screen, "find");
  assert.equal(seen[0].sites.length, 2);
  // ...and a SHORT sentence twice is not a finding: this is a rule about long
  // explanations, not about the word "and".
  const shortTwice = `{step === "find" && (<div>{qualityFloorLine(a)}{qualityFloorLine(b)}</div>)}`;
  assert.deepEqual(repeatedSentences(shortTwice, { maxWords: 20 }), []);
});

test("the floor paragraph has ONE home, and the pointer names where", () => {
  const full = qualityFloorSentence(RECOMMENDED_LIQUIDITY);
  assert.ok(words(full) > 100, "the full explanation is still the full explanation");
  const line = qualityFloorLine(RECOMMENDED_LIQUIDITY);
  assert.ok(words(line) <= 20, `the one-line version is ${words(line)} words`);
  // FOLD, NEVER DELETE: the pointer says where the paragraph went.
  assert.ok(VOICE_HOMES.floors, "the home is named, not implied");
  assert.ok(voicePointer("floors", { count: 3, what: "XLE" }).includes(VOICE_HOMES.floors));
  assert.ok(voicePointer("floors", { count: 3 }).includes("3 structures"),
    "and the count is in the line, so nobody has to open it to know if it is worth opening");
});

test("the filter fold states every reason it folded, with its count", () => {
  const f = filterFold({ liquidity: 3, reward: 2, model: 1, unpriceable: 4 }, { what: "XLE" });
  assert.equal(f.total, 10);
  for (const id of ["unpriceable", "model", "liquidity", "reward"]) {
    assert.ok(f.reasons.some((r) => r.id === id), `${id} is named`);
  }
  assert.ok(f.summary.includes("XLE"));
  assert.ok(f.summary.includes("10 structures"));
  // Nothing removed is a different answer from nothing to say.
  assert.equal(filterFold({}).total, 0);
  assert.equal(filterFold({}).summary, null);
});

/* ================================================================
   2. THE MEASUREMENT — words at rest, on three screens
================================================================ */

test("MEASURED: the three screens, and the table in the PRD is this number", () => {
  const m = measureScreens(APP);
  for (const id of SCREEN_IDS) {
    assert.ok(m[id].total > 0, `${id} measured something`);
  }
  /* >>> THE BASELINE, MEASURED ON A CLEAN `main` (68b75a5), BY THIS SAME
     COUNTER, OVER THE WHOLE TREE. <<< It is written down rather than
     recomputed because `main` is not on disk during a test run. To re-derive
     it — and it MUST be a whole-tree checkout, not `App.jsx` alone, because a
     screen is its block plus the components it mounts:

         git worktree add --detach /tmp/wt 68b75a5
         cp src/wordcount.mjs /tmp/wt/src/
         cp scripts/measure-words.mjs /tmp/wt/scripts/
         (cd /tmp/wt && node scripts/measure-words.mjs)
         git worktree remove /tmp/wt

     Swapping only `App.jsx` under today's components reads low, in the
     direction that FLATTERS the session doing the measuring, which is exactly
     why the number here is the worktree's.

     >>> RE-DERIVED BY P10, BECAUSE THE COUNTER WAS FIXED. <<< It read
     { radar 1162, shortlist 1881, build 963, total 4006 } until `atRest()` was
     made to strip each piece of a screen BEFORE they are joined. Run over the
     concatenation, a fold's non-greedy `<Fold …>` → `</Fold>` match crossed the
     boundary between the step block and a component body, so which words a fold
     hid depended on which components the block mounted and in what order — the
     Shortlist scored 533 words of its own 776 before the P10 controls block
     mounted one more component and 707 after, on a screen whose source had
     SHRUNK. Only `build` moves here (963 -> 593): the other two screens read
     exactly as they did. Both sides of this table are measured by one counter,
     or the table means nothing. */
  /* >>> PR #40 REPLACED THREE SCREENS WITH TWO (TASK 1). <<< Radar, the
     Shortlist and the guided door are one screen, Find; Build is Build. The
     table the owner was given, measured by this counter on `main` (c621491):

         radar 481 + shortlist 1216 = 1697 words at rest   ->  find  ≤ 450
         build 559                                         ->  build ≤ 400

     The CEILING is the target the owner set, and it fails the build on one
     word more. Raising it is a session saying why, in the PRD. */
  const BEFORE = { radarPlusShortlist: 1697, build: 559 };
  /* >>> PR #45 MOVED FIND TO `find.jsx` AND MADE IT ONE CONTROL STYLE. <<< Measured by this counter (which now reads
     `ui.jsx` and `find.jsx` too): find 384 -> 309 words at rest (51 typed + 258 generated, 24 sites), build 264 -> 244.
     The two headings and their empty-state sentence became one counted line, and the paragraph under the old chance
     slider went with it. The ceilings are those numbers, so the next word fails the build. */
  /* >>> PR #47: "positions" IS THE POSITIONS SEGMENT (`posSeg === "positions"`), and the counter now reads
     `positions.jsx`, `positionCard.jsx` and `navBar.jsx` — the card's own file was never read before, so the old 209
     did not include a word of the card. Measured: 217 (110 typed + 107 generated, 5 sites), an upper bound that
     counts the filing dialog and the close confirm, which appear only after a tap. The owner's ≤ 120 is held on the
     RENDERED segment below. */
  /* >>> PR #48: +6 ON FIND AND ON BUILD, AND IT IS THE COUNTER SEEING, NOT THE SCREEN GROWING. <<< The badge printed
     "CONFLUENT · +64 · conf 86" as JSX expressions the counter could not score (0 words); it is now `badgeText()`,
     a registered generator, "CORN ↑ +64 · conf 86" (6). The real change is one word, the ticker the owner asked
     for. Everything else PR #48 adds to these screens is behind a fold or an ⓘ ("Why this place", "How the numbers
     fit") or offset; measured: find 309 → 315, build 244 → 250. */
  /* >>> PR #49 (owner decisions, 3 Oct 2026): the words Find was asked to grow by, counted one by one. <<<
     0d: the results line says its noun ("1 card matches what you asked"): +1.
     Task 2: the chance slider's leftmost value reads "any" (`chanceAskText()`, now a counted generator): +1.
     Task 3: the two tiles the owner asked for, on Find's card and on Build's top card (the same component):
     FUTURE (MONTE CARLO) "-$9 −3.6 per $100 at risk to 30 Oct 2026" (`futureTile()`, 10) and PAST YRS (BACKTEST)
     "won 9 of 14 · avg +$310" (`pastTileText()`, 7): find +17, build +17. Their names are `CARD_LABELS`, read as
     expressions, which this counter does not score (nor the four it already had).
     Task 1: under "Future avg + signal" the card says its sum at rest, "sorted by −12.0 + signal +27.5 = 15.5 per
     $100" (`placeLine()`, out of the fold): find +10, an upper bound — the other four orders print no line.
     Measured: find 317 → 344, build 250 → 267. */
  /* >>> REDESIGN PR 1 (owner's mockups, 4 Oct 2026): FIND IS ONE ROW PER MARKET, AND THE MARKET PAGE IS A SCREEN. <<<
     Find 344 → 332, measured by this counter: the request block, the long list of cards, the "why" fold and the "Go to
     Build" button left Find (the controls moved into the chips' sheets, which the counter reads as one tap away —
     `Sheet` joined FOLDED; the cards moved to the market page; Build is on the bottom bar). What came in, counted:
     the eight chips (`chipText()`, 16), the summary line (`rowsResultsLine()`, 6), the column head (3), one row
     (`rowSubtitleText()` 6, `rowRiskText()` 2), the states — reading (12), stale (22), nothing fits (`nothingFitsLine`
     4, `allMissLine` 12, `overLimitNote` 7, `showMissesCta` 5), a market not read (7) — and every sheet's
     "Show N of M" (4). An upper bound: the states never all show at once. The ceiling is that 332: Find did not grow.
     "market" is new: 566 (245 typed + 321 generated), an upper bound that counts all three tabs (one is on screen),
     the chart's and the copilot's own words (PriceChart, TaCopilot, unchanged), the Why sheet's content and the
     chain's tray. Its ceiling is that 566, so the next word fails the build. */
  /* >>> ROUND 2 (owner's mockups, 5 Oct 2026): THE LOOK, NO NEW FUNCTION. <<< Measured by this counter: find 332 → 327
     (the desk's count line and Saved's heading left Find's screen; Find's header moved into find.jsx). market 566 → 587:
     the event box says its parts ("in 5 days" `inDaysText()` 3, the holiday note `holidayWeekNote()` 5), the compact
     card says what the trade needs (`needsText()` 7) and Strategies its second line (`strategiesNote()` 10); the expected
     move's sentence became a label and a figure. build 267 → 286, and Build's screen did not change: the counter expands
     `CandidateCard` in full, so the compact layout's four figure sites (`chanceText`, `returnText`, `futureTile`,
     `pastTileText`, 19 words) are scored on Build too — the documented upper bound (every branch counted), which the
     ROADMAP's counter fix will lower. The ceilings are those numbers, so the next word fails the build. */
  /* >>> REDESIGN PR 2 (owner's mockup "3 · Build", 5 Oct 2026): BUILD IS REBUILT. <<< Measured by this counter: build
     286 → 428 (293 typed + 135 generated, 22 sites). What LEFT the screen at rest: the trade card's five lines (now
     behind "Why this trade"), the card (in "More on this trade ▾", with the compact layout's 19 counted words, the
     badge 6, the news line 17, the reading line 2), the price block's crossing sentence 13, the warnings panel's summary
     20, the open-interest and source notes 13, the card-vs-Build lines 23. What the mockup ADDS, site by site: the one
     sentence `tradeTakeaway()` 20; the title line `buildSubLine()` 9 (×3: Build, loading, no quotes); the stance line
     `stanceText()` 9; the rule for when Send asks why `reasonRuleText()` 19; `orderBookLine()` 8, `capLabel()` 7,
     `exitsPill()` 6, `sendLabel()` 6, the two greeks 3, the time exit's day 2, the legs' expiry 4; the FUTURE and PAST
     boxes (`futureTile()` 10, `chanceText()` 1); typed: the section titles and labels (Build 18, What it does 8, Why 4,
     Legs 4, Order 19, the figure labels 5, More 8), the copilot section 61 (its heading, the field, the footer the prompt
     asks for, and its states: writing, thinking, cut off, filed), the chart's 22 (its range buttons and its states), the
     entry-room warning 46 and Send's held reason 10 (each only when it applies), and the three states (loading 23, empty
     31, no quotes 24) — an upper bound: the states never show together. The review sheet is one tap away (a Sheet,
     assembled outside the block) and "More on this trade ▾" is folded (`Reveal`). The ceiling is that 428. */
  /* >>> REDESIGN PR 3, TASK 0a: THE SHIPPED SCREENS CHECKED AGAINST THE BOARDS THEMSELVES (scripts/audit-screen.mjs). <<<
     The audit looks for every board phrase on the app's screen; the words it added are the boards' own, site by site:
     find 327 -> 336 (the stale status line `staleStatusLine()` and its bold half `staleFailLine()`, the chips' "Direction"
     and "≥", the reading bar's line moved into `ReadingLine`); market 587 -> 604 (the read's score line `readScoreLine()`,
     the chart copilot's "The chart copilot never proposes a trade." and its question box's label, the Overview's
     panels' headings); build 428 -> 435 (the review sheet's "is known" and "5%", the empty state's "Build" title, the
     copilot's question-box label, now on screen for a screen reader). The ceilings are those numbers. */
  const CEILING = { find: 336, market: 604, build: 435, positions: 217 };
  /* >>> PR #46: ONE ORDERS LIST. <<< The record-based "WORKING AT THE BROKER" panel (its paragraph about what a
     working order is, the stale-DAY warning, the per-row sentences) left Positions; the one list lives in
     `orders.jsx`, which the counter now reads. Measured: positions 304 -> 209 (4 typed + 205 generated, 14 sites).
     The row's own words are built by `orderRowModel()` in orderRow.js, which the counter does not score — so 209
     is a floor for that screen, written down as such in ROADMAP. */
  /* >>> POSITIONS IS A THIRD SCREEN SINCE PR #44 (TASK 1). <<< Measured by this counter on `main` (ae4b1e0), by the
     worktree procedure above: positions 422 words at rest (99 typed + 323 generated, 14 sites). The Positions card
     was rebuilt to say its action, its profit and its three exits first; the paragraph the Alpaca panel repeated
     for every holding is one line for a holding that has a record, and the Details sheet is built outside the block
     (it is one tap away). Rebuilt: positions 304 words at rest (99 typed + 205 generated, 12 sites). The ceiling is
     that 304 and the test asserts it is below 422; both fail the build on one word more. */
  const POSITIONS_BEFORE = 422;
  // …and nothing on either screen is left uncounted: the five generators the
  // counter could not see (legsLine, compareDistNote, setCompareNote,
  // tradeOffSentence, setText) are scored or gone (PR #40, TASK 2).
  assert.deepEqual(m.uncounted, [], `uncounted: ${m.uncounted.join(", ")}`);
  for (const id of SCREEN_IDS) {
    assert.ok(m[id].total <= CEILING[id], `${id} grew: ${m[id].total} against ${CEILING[id]}`);
  }
  assert.ok(m.find.total < BEFORE.radarPlusShortlist, "Find reads less than Radar and Shortlist did");
  assert.ok(m.positions.total < POSITIONS_BEFORE, `Positions reads less than it did: ${m.positions.total} against ${POSITIONS_BEFORE}`);
});

/* ================================================================
   2b. PR #47, TASK 3 — FOUR SURFACES, RENDERED ON J-0001, AT REST
================================================================ */
const SURF = await measureSurfaces();
test("MEASURED: Positions ≤ 120, one order row ≤ 35, the close confirm ≤ 35 and Modify ≤ 40 (PR #49: the ⓘ labels)", () => {
  /* Measured on main (e38261f) with the same fixtures and this same counter: one row 44, the orders panel with the
     false "not sent from this browser" warning 136, the close confirm 79, the orders panel + J-0001's and J-0002's
     cards 371. On the owner's phone, 2 Oct 2026: 78, 171, 51. After: see SURFACE_BUDGET. */
  for (const id of SURFACE_IDS) {
    assert.ok(Number.isFinite(SURF[id]) && SURF[id] > 0, `${id} measured`);
    assert.ok(SURF[id] <= SURFACE_BUDGET[id], `${id}: ${SURF[id]} words at rest against ${SURFACE_BUDGET[id]}`);
  }
  assert.ok(SURF.orders < SURFACE_BEFORE.orders && SURF.confirm < SURFACE_BEFORE.confirm);
});

test("…and the rendered counter counts what is on screen: a closed ⓘ and a hidden panel are not read", () => {
  assert.equal(renderedWords("<div>Sell 9 GDX <button>ⓘ</button></div>"), 3, "the ⓘ glyph is not a word");
  assert.equal(renderedWords('<div>a b<div hidden="">x y <div>z</div> w</div> c</div>'), 3);
  assert.equal(renderedWords("<p>Market closed · opens Mon 15:30 your time</p>"), 7, "a separator is not a word");
});

test("…and the counter can SEE a budget broken (it is a check, not a wall)", () => {
  assert.ok(renderedWords(`<p>${"word ".repeat(36)}</p>`) > SURFACE_BUDGET.orders);
});

test("…and a screen's reading is the SUM OF ITS PARTS, not the order it was joined in", () => {
  /* >>> THE DEFECT P10 MEASURED, AND THE GUARD AGAINST IT COMING BACK. <<<
     `atRest()` strips a fold with a non-greedy match from `<Fold …>` to the next
     `</Fold>`. It used to run over the CONCATENATION of the step block and every
     component body, so that match could cross the boundary between two pieces:
     which words a fold hid depended on which components the block mounted, and
     in what order. The Shortlist scored 533 words before the P10 controls block
     mounted one more component and 707 after, on a source that had SHRUNK.

     A counter that moves when nothing on the screen moved is not a guard. Each
     piece is put at rest BEFORE the join now, so appending a body can only ADD
     that body's own words. */
  const body = `<div>\n  Alpha beta gamma delta epsilon zeta.\n  <Fold summary={"x"}>\n    Hidden words that nobody reads at rest.\n  </Fold>\n</div>`;
  // A piece whose fold is balanced hides its own children and nothing else.
  assert.ok(!atRest(body).includes("Hidden words"));
  assert.ok(atRest(body).includes("Alpha beta gamma"));
  // AND A DANGLING CLOSE IN A LATER PIECE CANNOT REACH BACK INTO AN EARLIER ONE.
  const opened = `<div>\n  <Fold summary={"y"}>\n  Visible after the fix: this fold never closes.\n</div>`;
  const later = `<div>\n  Words in a component body that must still be counted.\n</Fold>\n</div>`;
  const joined = [atRest(opened), atRest(later)].join("\n");
  assert.ok(joined.includes("Words in a component body"),
    "a later piece's </Fold> must not swallow it: that is the fault this guards");
  // ...and the counter really is piecewise: the whole equals the sum of parts.
  for (const id of SCREEN_IDS) {
    const whole = screenSource(APP, id);
    assert.equal(atRest(whole), whole,
      `${id}: screenSource() must hand back text that is already at rest`);
  }
});

test("…and the measurement counts PROSE, not JavaScript", () => {
  // The first version of the counter scored `const [busy, setBusy] =
  // useState(false)` as six words of reading. Counting the wrong thing
  // carefully is worse than not counting.
  assert.equal(isProse("const [busy, setBusy] = useState(false);"), false);
  assert.equal(isProse("style={{ fontSize: 13, color: T.body }}"), false);
  assert.equal(isProse("Every structure offered here carries at least ten open contracts."), true);
  assert.equal(isProse("OK fine"), false, "four tokens is the floor");
});

test("…and it counts words AT REST: a fold, a sheet and a tooltip are one tap away", () => {
  const folded = `<div>Visible words here for the reader.<Fold summary="x">Hidden explanation that nobody reads until they ask for it.</Fold></div>`;
  assert.ok(!atRest(folded).includes("Hidden explanation"));
  assert.ok(atRest(folded).includes("Visible words here"));
  const tipped = `<Stat k="A" v="1" tip={noCeilingNote("This structure")} />`;
  assert.equal(generatorCalls(atRest(tipped)).noCeilingNote, undefined,
    "a tooltip is tap-to-open, so it is not words on screen");
});

test("…and the coverage of the measurement travels with it", () => {
  const m = measureScreens(APP);
  /* A generator this file has no fixture for scores ZERO and is NAMED. The
     ones left are in `.jsx` files, which a plain-node counter cannot import. */
  assert.ok(Array.isArray(m.uncounted));
  assert.ok(m.uncounted.length <= 10, `too much is uncounted: ${m.uncounted.join(", ")}`);
  // And the fixtures it does have all produce something.
  for (const name of Object.keys(COPY)) {
    assert.equal(typeof copyOf(name), "string", `${name} scores a string`);
  }
});

test("the step blocks are really found, and they are the right ones", () => {
  for (const id of SCREEN_IDS) {
    assert.ok(stepBlock(APP, id).length > 500, `${id} block found`);
    // A screen is its block PLUS what the block mounts: Build's own JSX
    // carries almost no prose, because the ticket and the confirm step are
    // components.
    assert.ok(screenSource(APP, id).length > stepBlock(APP, id).length, `${id} expanded`);
  }
  assert.ok(screenSource(APP, "build").includes("OrderTicket") || stepBlock(APP, "build").includes("OrderTicket"));
});

/* ================================================================
   3. A TEST IS NOT A TRADE
================================================================ */

const sameDay = (pnl, ruleExit) => ({
  pnl, ruleExit, openedAt: "2026-09-22T09:00:00.000Z",
  t: new Date("2026-09-22T09:02:00.000Z").getTime(),
});

test("THREE BUTTON-TESTS DO NOT MOVE THE OWNER UP A LEVEL", () => {
  assert.equal(isTestRecord(sameDay(0, false)), true);
  assert.equal(scoredJournal([sameDay(0, false), sameDay(0, false)]).length, 0);
});

test("…and all three conditions are required, because each alone is a real trade", () => {
  assert.equal(isTestRecord(sameDay(12, false)), false, "a scratch is not zero");
  assert.equal(isTestRecord(sameDay(0, true)), false,
    "a rule exit on the same day is a real trade that hit its take profit");
  assert.equal(isTestRecord({ ...sameDay(0, false), t: new Date("2026-09-29T09:00:00.000Z").getTime() }), false,
    "a week later is a trade that had time to happen");
});

test("…and UNKNOWN IS NOT ZERO, for the tenth time in this repository", () => {
  // `Number(null)` is 0 and 0 is finite: a P&L nobody read is not a P&L of nothing.
  assert.equal(isTestRecord(sameDay(null, false)), false);
  assert.equal(isTestRecord(sameDay("", false)), false);
  assert.equal(isTestRecord({ pnl: 0, ruleExit: false }), false, "no dates, no verdict");
  assert.equal(isTestRecord(null), false);
});

test("THEY ARE MARKED, NEVER DELETED", () => {
  const note = testRecordNote();
  assert.ok(/not counted/.test(note) && /level/.test(note));
  assert.ok(/stays on the record/.test(note), "the Journal is what happened");
  // The screen renders the marker; the score steps over it.
  assert.ok(/isTestRecord\(e\)/.test(APP), "the Journal row marks one");
  assert.ok(/scoredJournal\(store\.journal/.test(APP), "and the level reads the filtered list");
});

/* ================================================================
   4. AN ANALYSIS THAT CLAIMS IT CAN TRADE IS FLAGGED, NOT QUOTED
================================================================ */

test("an analysis claiming it can route an order is FLAGGED", () => {
  for (const s of [
    "I'll place this order for you now.",
    "I have submitted the trade on your behalf.",
    "Placing the order at the mid.",
    "I’ll go ahead and send this spread order.",
  ]) {
    assert.equal(copilotOverreach(s).flagged, true, `not caught: ${s}`);
  }
});

test("…and an ordinary analysis that merely MENTIONS an order is not", () => {
  for (const s of [
    "You could place this order yourself at the mid; the spread is wide.",
    "The trade risks $450 and the order would be a debit of $60.",
    "If you decide to open it, the order goes through the risk gate first.",
    "I would not enter here: the reward-to-risk is under the floor.",
  ]) {
    assert.equal(copilotOverreach(s).flagged, false, `false positive: ${s}`);
  }
  assert.equal(copilotOverreach("").flagged, false);
  assert.equal(copilotOverreach(null).flagged, false);
});

test("…and the report names the sentence instead of reproducing the analysis", () => {
  const note = copilotOverreachNote("I'll place this order");
  assert.ok(note.includes("NOT QUOTED"));
  assert.ok(note.includes("I'll place this order"), "the reader sees WHAT tripped it");
  assert.ok(/tapping twice/.test(note), "and the rule it breaks");
  assert.ok(/kept in the Journal/.test(note), "it is not deleted either");
});

test("REPORT SECTION 6 IS THIS PERIOD'S, not the last five ever", () => {
  const pro = readFileSync(new URL("./pro.jsx", import.meta.url), "utf8");
  assert.ok(/settings\?\.reportLast/.test(pro), "the period is the last report's date");
  assert.ok(/copilotOverreach\(c\.answer\)/.test(pro), "and every quoted answer is checked");
  assert.ok(!/\(store\.copilotLog \|\| \[\]\)\.slice\(0, 5\)/.test(pro),
    "the unfiltered `last five ever` is gone");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`${f.name}:\n${f.e.message}\n`); process.exit(1); }
