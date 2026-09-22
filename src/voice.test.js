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
    {step === "radar" && (<div>{qualityFloorSentence(a)}{qualityFloorSentence(b)}</div>)}
  `;
  const seen = repeatedSentences(twice, { maxWords: 20 });
  assert.ok(seen.length > 0, "two sites of a 162-word paragraph on one screen must be caught");
  assert.equal(seen[0].screen, "radar");
  assert.equal(seen[0].sites.length, 2);
  // ...and a SHORT sentence twice is not a finding: this is a rule about long
  // explanations, not about the word "and".
  const shortTwice = `{step === "radar" && (<div>{qualityFloorLine(a)}{qualityFloorLine(b)}</div>)}`;
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
  const BASELINE = { radar: 1162, shortlist: 1881, build: 593, total: 3636 };
  const now = m.total.total;
  assert.ok(now < BASELINE.total, `the screens must not grow: ${now} against ${BASELINE.total}`);
  const cut = 1 - now / BASELINE.total;
  // The target P9 was set. It is asserted, so it cannot quietly regress.
  assert.ok(cut >= 0.40,
    `words at rest fell ${(cut * 100).toFixed(1)}%, and the target is 40% (${now} against ${BASELINE.total})`);
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
