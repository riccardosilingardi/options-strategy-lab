// src/build.test.jsx — BUILD ON THE OWNER'S MOCKUP (redesign PR 2, TASKS 2–4), rendered.
//
// What is held here: the one summary sentence (`tradeTakeaway()`), Build's sections in the mockup's order, the numbers
// the card's (`sizedFigures()`, `futureFigures()`, `pastFigures()` — figures.test.jsx holds them to the card), the Why
// section's rule in its real words (not "2 or more against"), the copilot's four questions from SKILLS with the three new
// ones never proposing a trade, the cap checkbox writing the ONE free-sizing setting, the review sheet's checks being
// `gateChecklist()`'s, order path 2 being `useTicketSend()` (the ticket's send, moved unchanged), and the three states.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { BuildScreen, NumbersSection, WhySection, ReviewSheet, LegRow, OrderSection, ExitPlanSection, SendBar,
  BuildLoading, BuildNoQuotes, BuildEmpty, buildSkills } from "./build.jsx";
import { SKILLS, BUILD_SKILL_IDS, COPILOT_ROLE, BUILD_VERDICTS } from "./pro.jsx";
import { payoffBands } from "./visuals.jsx";
import { tradeTakeaway, buildSubLine, reasonRuleText, sizedFigures, futureFigures, pastFigures, money, CARD_LABELS,
  sendLabel, orderBookLine, capLabel, EXIT_ROWS, exitsPill, timeExitDay, reviewLimitLine, sentOrderLine } from "./rules.js";
import { AGAINST_MIN_SCORE, factorStands, signalStance } from "./signals.js";
import { T } from "./theme.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s, m) => { if (!h.includes(s)) throw new Error(`${m || "missing"}: ${JSON.stringify(s)}`); };
const hasNot = (h, s, m) => { if (h.includes(s)) throw new Error(`${m || "unexpected"}: ${JSON.stringify(s)}`); };
const app = readFileSync("src/App.jsx", "utf8");
const pro = readFileSync("src/pro.jsx", "utf8");

console.log("\nredesign PR 2 — Build, rendered\n");

/* ---- the one sentence ---- */
const PUT_CREDIT = [{ side: -1, type: "put", strike: 18, qty: 1 }, { side: 1, type: "put", strike: 17, qty: 1 }];
check("THE TAKEAWAY: the mockup's sentence, read off payoffBands() — a 17/18 put credit for $0.25", () => {
  const b = payoffBands({ legs: PUT_CREDIT, entryNet: -0.25, spot: 18.4 });
  eq(tradeTakeaway(b, { ticker: "CORN", expKey: "2026-11-20", n: 1, credit: true, legs: PUT_CREDIT }),
    "Keeps up to $25 if CORN closes above $18.00 on 20 Nov; loses up to $75 below $17.00. Breakeven $17.75.");
  // For the size shown: ×3 is three times the money, the same levels.
  has(tradeTakeaway(b, { ticker: "CORN", expKey: "2026-11-20", n: 3, credit: true, legs: PUT_CREDIT }), "Keeps up to $75 if CORN closes above $18.00");
});
check("…an iron condor loses on both sides, and says so; a debit 'Makes'; a long call has no ceiling", () => {
  const ic = [{ side: 1, type: "put", strike: 12, qty: 1 }, { side: -1, type: "put", strike: 13, qty: 1 },
    { side: -1, type: "call", strike: 14, qty: 1 }, { side: 1, type: "call", strike: 15, qty: 1 }];
  const t = tradeTakeaway(payoffBands({ legs: ic, entryNet: -0.67, spot: 13.24 }), { ticker: "UNG", expKey: "2026-12-18", credit: true, legs: ic });
  has(t, "if UNG closes between $13.00 and $14.00 on 18 Dec");
  has(t, "loses up to $33 below $12.00 or above $15.00");
  has(t, "Breakevens $12.33 and $14.67.");
  const bull = [{ side: 1, type: "call", strike: 18, qty: 1 }, { side: -1, type: "call", strike: 19, qty: 1 }];
  has(tradeTakeaway(payoffBands({ legs: bull, entryNet: 0.4, spot: 18.2 }), { ticker: "CORN", legs: bull }), "Makes up to $60 if CORN closes above $19.00 at expiry");
  const call = [{ side: 1, type: "call", strike: 18, qty: 1 }];
  has(tradeTakeaway(payoffBands({ legs: call, entryNet: 0.5, spot: 18 }), { ticker: "CORN", legs: call }), "Has no ceiling on what it makes");
  eq(tradeTakeaway(null), null, "no payoff read, no sentence");
});
check("THE TITLE LINE: 'CORN · 20 Nov · 47 days · ×1'", () => {
  eq(buildSubLine({ ticker: "CORN", expKey: "2026-11-20", dte: 47, n: 1 }), "CORN · 20 Nov · 47 days · ×1");
});

/* ---- the screen, at rest ---- */
const AE = { maxProfit: 25, maxLoss: -75, breakevens: [17.75], profitUnbounded: false, entry: -0.25, greeks: { delta: 0.2, theta: 1.5 } };
const MC = { pop: 0.71, ev: 4, runs: 8000 };
const BT = { wins: 11, n: 16, winRate: 11 / 16, avg: 6, span: 2, month: 9 };
const FUSED = { ticker: "CORN", score: 46, confidence: 84, agreement: "MIXED", factors: ["seasonal", "technical", "weather", "news"],
  components: { seasonal: { dir: 1, strength: 70, why: "x" }, technical: { dir: -1, strength: 40, why: "x" }, weather: { dir: 0, strength: 0, why: "x" }, news: { dir: 1, strength: 20, why: "x" } } };
const order = { contracts: 1, onContracts: () => {}, qtyMin: 1, qtyMax: 20, qtyNote: "1 contract × $75 at risk each", limitSide: "credit", limit: 0.25,
  onStep: () => {}, bookLine: orderBookLine({ mid: -0.25, natural: -0.15 }), verdict: { known: true, state: "waiting", label: "WAITING — $10 over what trades today", sentence: "s", tifSentence: "t" },
  risk: { value: "$75", pct: "0.8% of capital" },
  cap: { checked: true, label: capLabel({ perTrade: 500, tradingCapital: 10000 }), over: null, freeLine: null, draft: null, setDraft: () => {}, draftOk: false,
    draftLeft: "15 more characters", onCheck: () => {}, onTurnOff: () => {}, onCancelDraft: () => {} },
  openRisk: { value: "$75", of: "of $2,500" }, room: null };
const v = {
  back: { label: "CORN", onClick: () => {} },
  title: { name: "Bull Put Spread", sub: buildSubLine({ ticker: "CORN", expKey: "2026-11-20", dte: 47, n: 1 }), signs: null, note: null },
  takeaway: tradeTakeaway(payoffBands({ legs: PUT_CREDIT, entryNet: -0.25, spot: 18.4 }), { ticker: "CORN", expKey: "2026-11-20", credit: true, legs: PUT_CREDIT }),
  chart: <div data-chart />,
  numbers: { figures: sizedFigures(AE, 1), rr: 25 / 75, pop: MC.pop, breakevens: AE.breakevens, future: futureFigures(MC, AE, 1, "2026-11-20"),
    past: pastFigures(BT, AE, 1), delta: "+20 sh", theta: "+$2/day" },
  why: { stance: "with the signals, 2 of 4 · 1 against", factors: factorStands(FUSED, 1), reasonRule: reasonRuleText(AGAINST_MIN_SCORE, null),
    lines: [{ id: "bet", label: "BETS ON", text: "CORN goes up." }], onMarketRead: () => {}, readLabel: "The market's read ›" },
  copilot: { apiKey: "server", convo: { msgs: [] }, setConvo: () => {}, onAnalysis: () => {}, ctx: { store: { positions: [] }, ticker: "CORN" } },
  legs: { expLabel: "20 Nov", onEditInChain: () => {}, snapNote: null, legs: [
    { side: -1, qty: 1, strike: 18, type: "put", mid: 0.55, bid: 0.5, ask: 0.6, delta: -0.4 },
    { side: 1, qty: 1, strike: 17, type: "put", mid: null, bid: null, ask: null, delta: null }] },
  order,
  exit: { pill: exitsPill("CORN"), footer: "Exits go in as limit orders.", rows: [
    { label: "Take profit", sub: EXIT_ROWS.takeProfit("max-profit"), value: "$13" },
    { label: "Time exit", sub: EXIT_ROWS.time(), value: timeExitDay("2026-11-20") },
    { label: "Stop", sub: EXIT_ROWS.stop(), value: "$38" }] },
  send: { label: sendLabel({ net: -0.25, n: 1 }), disabled: false, reason: null, footer: "Paper account · Alpaca · day order", onSend: () => {} },
  review: { open: false, onClose: () => {}, sub: "x", viaBroker: true, legs: [], limitLine: "", checks: [], checksFull: null, clockLine: null, waitLine: null,
    reason: null, canSend: true, blocked: null, secondLabel: "Send to Alpaca", onLocal: () => {}, sentLine: () => "", filedLine: () => "", onJournal: () => {}, onOrders: () => {} },
  ticket: { legs: PUT_CREDIT, expKey: "2026-11-20", ticker: "CORN", quotes: [], net: -0.25, estNet: -0.25, gate: () => ({ pass: true, violations: [], warnings: [] }),
    dte: 47, maxLoss: -75, maxProfit: 25, qty: 1, cfg: { type: "limit", tif: "day" }, legPrices: [0.55, 0.3], setMsg: () => {}, onSent: () => {} },
};
const html = renderToStaticMarkup(<BuildScreen v={v} foldedNode={<div data-more-content>MORE CONTENT</div>} />);

check("THE ORDER OF THE SCREEN: header, title, what it does, numbers, why, copilot, legs, order, exit plan, Send, More", () => {
  const marks = ["data-build-header", "Bull Put Spread", "What this trade does", "The numbers", "data-why-trade", "ASK THE COPILOT ABOUT THIS TRADE",
    "data-build-legs", "data-build-order", "data-build-exits", "data-build-send", "More on this trade"];
  let at = -1;
  for (const m of marks) { const i = html.indexOf(m); if (i < 0) throw new Error(`missing ${m}`); if (i < at) throw new Error(`${m} out of order`); at = i; }
  has(html, "‹ CORN"); has(html, ">Paper<");
  has(html, "CORN · 20 Nov · 47 days · ×1");
  has(html, "Keeps up to $25 if CORN closes above $18.00 on 20 Nov");
  hasNot(html, "MORE CONTENT", "More is closed at rest");
});
check("THE NUMBERS ARE THE CARD'S: sizedFigures, futureFigures, pastFigures, under CARD_LABELS (the grid in the mockup's sentence case)", () => {
  has(html, ">Max profit<"); has(html, ">Max loss<"); has(html, ">Breakeven<"); has(html, ">Return on risk<");
  has(html, CARD_LABELS.future); has(html, CARD_LABELS.past);
  hasNot(html, ">MAX PROFIT<", "the grid's labels are the mockup's sentence case, read off CARD_LABELS");
  has(html, money(25)); has(html, money(75)); has(html, "17.75"); has(html, "0.33");
  has(html, "71%"); has(html, "11 of 16"); has(html, "+$6");
  has(html, "Delta (shares)"); has(html, "+20 sh"); has(html, "Theta");
  // The mockup: the grid's values mono 18 bold, Delta and Theta mono 15 bold (scripts/audit-build.mjs measures it live).
  if (!/font-size:15px[^>]*>\+20 sh</.test(html)) throw new Error("Delta's value is not 15px");
  if (!/font-size:18px[^>]*>\$25</.test(html)) throw new Error("Max profit's value is not 18px");
});
check("WHY THIS TRADE: closed at rest with the stance line; open, the factors and the rule in its REAL words", () => {
  has(html, "with the signals, 2 of 4 · 1 against");
  hasNot(html, "BETS ON", "the five lines are behind the tap");
  // The rule: a written reason when the score points against the trade by AGAINST_MIN_SCORE or more — not "2 or more".
  const rule = reasonRuleText(AGAINST_MIN_SCORE, null);
  has(rule, `by ${AGAINST_MIN_SCORE} or more`);
  hasNot(rule, "2 or more");
  has(reasonRuleText(AGAINST_MIN_SCORE, { n: 3, total: 4 }), "3 of 4 factors oppose it");
  const rows = factorStands(FUSED, 1);
  eq(rows.map((r) => r.stand).join(","), "supports,against,quiet,supports", "stands, on the stance line's own counting");
  eq(signalStance(FUSED, 1).n, 2, "the stance counts the same two");
  eq(factorStands(FUSED, 0).every((r) => r.stand === "quiet"), true, "a direction-neutral trade: nothing to support or oppose");
});
check("THE COPILOT: seven questions from SKILLS (one home): the mockup's four with PR 4's variants, Greeks and chart; each opens with Build's role", () => {
  eq(BUILD_SKILL_IDS.join(","), "pretrade,variants,greeks,chart,wrong,compare,newsmove");
  eq(buildSkills().map((s) => s.label).join(" | "),
    "Pre-trade analysis | Which variant fits best? | Explain the Greeks | The chart and this trade | What would make it wrong? | Compare with the other cards | News that could move it");
  for (const id of BUILD_SKILL_IDS) {
    const sk = SKILLS.find((s) => s.id === id);
    has(sk.prompt, COPILOT_ROLE.build, id);
    hasNot(sk.prompt, "send it.", `${id}: never an instruction to send`);
  }
  has(COPILOT_ROLE.build, "never change its strikes, its expiry or its size yourself");
  has(SKILLS.find((s) => s.id === "pretrade").prompt, `exactly one of ${BUILD_VERDICTS.join(", ")}`);
  // PR 4 (the copilot by place): Find's two and the market page's news question are not Build's.
  for (const id of ["radar", "newsAll", "newsMarket"]) if (!SKILLS.find((s) => s.id === id)) throw new Error(`${id} left SKILLS`);
  for (const q of ["Pre-trade analysis", "Which variant fits best?", "Explain the Greeks", "The chart and this trade", "What would make it wrong?", "Compare with the other cards", "News that could move it", "Or ask your own…"]) has(html, q);
  has(html, "Educational analysis on a paper account, not financial advice. Every answer is filed in the Journal.");
  // One send, filed in the Journal: Build's, Find's, the market page's and a position's sections all run useCopilot().
  has(pro, "export function useCopilot(");
  has(pro, "if (onAnalysis) onAnalysis({ label: label || \"Question\", prompt: text, answer: reply, ticker: ctx?.ticker || null });");
  hasNot(pro, "export function CopilotTab", "the desk's old panel is gone");
});
check("THE LEGS: SELL ringed, BUY filled; the mid with its bid / ask · Δ; a missing quote is a dash, never zero", () => {
  const sell = renderToStaticMarkup(<LegRow leg={v.legs.legs[0]} />);
  has(sell, ">SELL<"); has(sell, "1 × 18 put"); has(sell, "0.55"); has(sell, "0.50 / 0.60 · Δ -0.40");
  has(sell, `inset 0 0 0 2px ${T.amber}`);
  const missing = renderToStaticMarkup(<LegRow leg={v.legs.legs[1]} />);
  has(missing, ">BUY<"); has(missing, "— / — · Δ —"); hasNot(missing, "0.00");
  has(html, "Legs · 20 Nov"); has(html, "Edit in chain ›");
});
check("THE ORDER, INLINE: two steppers, the book line, the limit note, the risk, the cap and the open risk", () => {
  has(html, "Contracts"); has(html, "Limit credit"); has(html, "0.25");
  has(html, "Mid 0.25 · natural 0.15 · tick 0.01");
  has(html, "WAITING — $10 over what trades today");
  has(html, "Risk on this trade"); has(html, "0.8% of capital");
  has(html, "Enforce the 5% cap per trade ($500)");
  has(html, "Open risk after this"); has(html, "of $2,500");
  const over = renderToStaticMarkup(<OrderSection order={{ ...order, cap: { ...order.cap, over: "Max loss $528 = 5.3% of capital." } }} />);
  has(over, 'role="alert"'); has(over, "Max loss $528");
  // The checkbox writes the ONE free-sizing setting Settings shows: off → the typed reason first, on → cleared.
  has(app, 'onCheck: (on) => { if (on) { setFreeDraft(null); setSetting("sizingFree", null); } else setFreeDraft(""); }');
  has(app, 'onTurnOff: () => { setSetting("sizingFree", { reason: String(freeDraft || "").trim(), at: Date.now() }); setFreeDraft(null); }');
  has(app, "draftOk: sizingFreeOn({ reason: freeDraft || \"\" })");
});
check("THE EXIT PLAN AND SEND: the three rules from RULES, the pill only when not backtested; Send held with its reason", () => {
  has(html, "at 50% of max profit"); has(html, "21 days before expiry"); has(html, "30 Oct"); has(html, "alert at 50% of max loss, no order");
  has(html, "defaults · not backtested on CORN");
  has(html, "Send limit order · credit $25"); has(html, "Paper account · Alpaca · day order");
  const held = renderToStaticMarkup(<SendBar label="Send limit order" disabled reason="Max loss $528 = 5.3% of capital." footer="f" />);
  has(held, "disabled"); has(held, `background:${T.raise}`); has(held, "Max loss $528");
});

/* ---- the review sheet ---- */
const ts = (over = {}) => ({ busy: false, outcome: null, fire: () => {}, setOutcome: () => {}, ...over });
const R = { ...v.review, open: true, sub: "Paper account · Alpaca · second of two taps",
  legs: [{ words: ["Sell to open", "1 × 18 put"], occ: "CORN261120P00018000" }, { words: ["Buy to open", "1 × 17 put"], occ: "CORN261120P00017000" }],
  limitLine: reviewLimitLine({ net: -0.25, tif: "day", n: 1 }),
  checks: [{ id: "loss", ok: true, text: "Most it can lose", value: "$75" }, { id: "oi", ok: null, text: "Open interest above the chain's floor (10, Find's liquidity floor)", value: "not read" }],
  clockLine: "Market closed · opens Mon 15:30 your time · queued", lastSent: null, onSecond: () => {} };
check("THE REVIEW SHEET: legs with their OCC symbols, the limit line, the gate's checks (unknown is a dash), Back / Send to Alpaca", () => {
  const h = renderToStaticMarkup(<ReviewSheet r={R} ts={ts()} />);
  has(h, "Review, then send"); has(h, "Paper account · Alpaca · second of two taps");
  has(h, "Sell to open"); has(h, "CORN261120P00018000");
  has(h, "Limit $0.25 credit · day · ×1");
  has(h, "✓"); has(h, "—"); has(h, "not read");
  has(h, "Market closed · opens Mon 15:30 your time · queued");
  has(h, ">Back<"); has(h, "Send to Alpaca");
  // The checks are gateChecklist()'s rows, read only; the OI row is Find's floor, labelled as such.
  has(app, "const rows = guard ? gateChecklist(guard, { dte }) : [];");
});
check("…after Alpaca accepts it: '✓ Sent. Alpaca accepted it.', the order line, the Journal sentence, Journal and Orders", () => {
  const o = { id: "x", qty: "1", filled_qty: "0" };
  const h = renderToStaticMarkup(<ReviewSheet r={{ ...R, lastSent: o, sentLine: (x) => sentOrderLine({ net: -0.25, tif: "day", filled: x.filled_qty, qty: x.qty }),
    filedLine: () => "J-0004 is filed in the Journal; its state is on its row in Orders." }} ts={ts({ outcome: { label: "SENT · WORKING, NOT FILLED" } })} />);
  has(h, "✓ Sent. Alpaca accepted it."); has(h, "0.25 credit · day · filled 0 of 1"); has(h, "J-0004 is filed in the Journal");
  has(h, ">Journal<"); has(h, "See it in Orders");
  const no = renderToStaticMarkup(<ReviewSheet r={{ ...R, lastSent: o }} ts={ts({ outcome: { label: "NOT SENT · THE RISK GATE REFUSED IT", headline: "Nothing was sent to Alpaca.", detail: "why" } })} />);
  has(no, 'role="alert"'); has(no, "Nothing was sent to Alpaca."); hasNot(no, "Alpaca accepted it");
});
check("ORDER PATH 2 IS THE TICKET'S SEND, MOVED UNCHANGED: one hook, the same gate call, orderBody() and POST", () => {
  const hook = pro.slice(pro.indexOf("export function useTicketSend("), pro.indexOf("export function OrderTicket("));
  for (const s of ["const preview = runGate(gate, evidence);", "const g = runGate(gate, evidence);", "contractListing({ legs, occs })",
    "const body = orderBody({ legs, occs, userQty: qtyNum, type: cfg.type, limit: signedLimit, tif: cfg.tif, intent: \"open\" });",
    "const o = await alpacaReq(\"/v2/orders\", \"POST\", body);", "if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 2 of six",
    "if (!confirm && !armed) { setConfirm(true); return; }"]) has(hook, s);
  const ticket = pro.slice(pro.indexOf("export function OrderTicket("));
  has(ticket, "= useTicketSend({");
  if (/orderBody\(|alpacaReq\(/.test(ticket.slice(0, ticket.indexOf("return (")))) throw new Error("the ticket builds no second body");
  // Build's second tap fires the hook; the first tap opened the sheet with the order written out.
  const build = readFileSync("src/build.jsx", "utf8");
  has(build, "const ts = useTicketSend(");
  has(build, "onSecond: v.review.viaBroker ? () => ts.fire() : v.review.onLocal");
  has(app, 'onSend: () => setDeskSheet("review")');
  // On "More on this trade ▾" the ticket has no Send: one route to an order from the screen.
  has(app, "<OrderTicket noSend");
  // The local book only when Alpaca is not connected (owner, 5 Oct 2026).
  has(app, 'secondLabel: alpaca ? "Send to Alpaca" : "Open on the app\'s own book"');
});

/* ---- the three states ---- */
check("THE STATES: loading says what it waits for and shows dashes; no quotes offers Retry and another expiry; empty points to Find", () => {
  const back = { label: "Find", onClick: () => {} };
  const l = renderToStaticMarkup(<BuildLoading back={back} title="Bull Put Spread" sub="CORN · 20 Nov · 47 days · ×1" reading="Reading CORN's chain for 20 Nov…" />);
  has(l, "Reading CORN&#x27;s chain for 20 Nov…"); has(l, "The chart waits for a bid and an ask on both legs.");
  has(l, "A dash is a number not read yet, never a zero."); hasNot(l, "$0");
  has(l, ">Max profit<"); has(l, ">Max loss<"); has(l, ">Breakeven<"); has(l, ">Chance<");
  const q = renderToStaticMarkup(<BuildNoQuotes back={back} title="Bull Put Spread" sub="s" sentence="CORN's option prices have not come back." legs={PUT_CREDIT}
    lastRead="Last read: 15:02 your time. The feed is indicative; a missing quote is shown as missing, never as zero." onRetry={() => {}} onPickExpiry={() => {}} />);
  has(q, "No quotes for these two legs."); has(q, ">Retry<"); has(q, "Pick another expiry"); has(q, "bid — / ask —"); hasNot(q, "Δ —");
  has(q, "a missing quote is shown as missing, never as zero.");
  const e = renderToStaticMarkup(<BuildEmpty onFind={() => {}} onChain={() => {}} />);
  has(e, "Nothing on Build yet."); has(e, "Go to Find"); has(e, "Open a chain");
  // The state is buildScreenState()'s, unchanged.
  has(app, "const buildScreen = buildScreenState({ spot, hasTrade: !!A, chainLoading });");
});
check("EDIT IN CHAIN: the legs go to the market page's Chain tray; the tray's Build › comes back through buildHandOff()", () => {
  has(app, 'onEditInChain: () => { goMarket(ticker, "chain"); setMktTray({ expKey, legs: legs.map((l) => ({ ...l })), note: null }); }');
  has(app, "initialTray={mktTray}");
  has(app, 'openOnBuild({ ticker: tk, expKey: ek, legs: lg, name, origin: { kind: "chain", tk, key: null } })');
  has(readFileSync("src/market.jsx", "utf8"), "const [tray, setTray] = useState(initialTray);");
});
check("NO DESK HEADER ON BUILD, NO EVIDENCE BAR; WHY THIS MARKET IS THE MARKET PAGE'S", () => {
  has(app, 'onMarketRead: () => goMarket(ticker, "overview"), readLabel: MARKET_READ_LINK');
  has(app, "const chromeless = onFindStep || onMarketStep || onBuildStep ||");
  if (app.includes("<EvidenceBar items={EVIDENCE}")) throw new Error("the bar is back");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
