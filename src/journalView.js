// ============================================================================
// src/journalView.js — WHAT THE JOURNAL SAYS, ARRANGED (redesign PR 3b; the owner's board "Journal"). Plain JS.
//
// IT COMPUTES NOTHING NEW. A closed trade's figure is `journalPnl()` (journal.js), its net `journalPnlTotal()`, how it
// ended `countsAsRuleClose()` and its `closeReason`; an open trade's profit and action are the Positions card's own
// (`positionModels` in App.jsx). This file only words them for the board's rows.
// ============================================================================
import { chanceText, RULES } from "./rules.js";
import { countsAsRuleClose, journalPnl, journalPnlTotal } from "./journal.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const known = (x) => x != null && x !== "" && Number.isFinite(Number(x));

/** "Tue 22 Sep 16:04", in the reader's own time. Null for anything that is not a time. */
export function stampWords(t) {
  const d = new Date(typeof t === "number" ? t : Date.parse(t || ""));
  if (!Number.isFinite(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

/** "+$24", "-$64", or a dash when the figure is not known. */
export function pnlWords(x) {
  if (!known(x)) return "—";
  const r = Math.round(Math.abs(Number(x)));
  return `${Number(x) < 0 && r > 0 ? "-" : "+"}$${r.toLocaleString("en-US")}`;
}

/** Every timeline entry, as the board prints it: "·01", its time, its words, and the order id in full when there is one. */
export function timelineItems(timeline = []) {
  return (timeline || []).map((x, i) => {
    const seq = String((x && x.seq) || "");
    return {
      key: seq || `t${i}`, seq: seq.includes("·") ? `·${seq.split("·").pop()}` : `·${String(i + 1).padStart(2, "0")}`,
      when: stampWords(x && x.t), what: (x && x.text) || "", order: x && x.orderId ? String(x.orderId) : null, raw: x,
    };
  });
}

/** "4 entries" / "1 entry". */
export const entriesWords = (n) => `${n} entr${n === 1 ? "y" : "ies"}`;

/**
 * THE REASON YOU OPENED IT, in one line (the board: "▼ 4 of 4 factors agree · score -41 · confidence 86 · chance
 * 66%."), from the four factors read the day it opened (`thesis.signals`, a `signalSnapshot()`) and the chance then.
 * A record opened before the snapshot existed says what it has: the chance, the volatility, the season.
 */
export function whyOpenedLine(thesis = null) {
  if (!thesis) return "Not recorded: this trade was opened before the app wrote its reasons down.";
  const chance = thesis.pop != null ? ` · chance ${chanceText(thesis.pop)}` : "";
  const s = thesis.signals;
  if (s && s.ready && s.factors && known(s.score)) {
    const read = Object.values(s.factors).filter((f) => f && Number.isFinite(f.dir));
    const sign = Math.sign(Number(s.score));
    if (s.agreement === "CONFLICT" || sign === 0) {
      return `≈ the factors contradict each other: Neutral${chance}.`;
    }
    const agree = read.filter((f) => Math.sign(f.dir) === sign).length;
    return `${sign > 0 ? "▲" : "▼"} ${agree} of ${read.length} factors agree · score ${Math.round(Number(s.score))}` +
      `${known(s.confidence) ? ` · confidence ${Math.round(Number(s.confidence))}` : ""}${chance}.`;
  }
  const parts = [thesis.pop != null ? `chance ${chanceText(thesis.pop)}` : null,
    known(thesis.iv) ? `volatility ${Math.round(Number(thesis.iv) * 100)}%` : null,
    known(thesis.seasonal) ? `season ${Number(thesis.seasonal).toFixed(1)}%/mo` : null, thesis.regime || null].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}.` : "Not recorded.";
}

/** The rest of the entry's reading, kept beside the board's line: volatility, season and regime, when the snapshot exists. */
export function openedDetailLine(thesis = null) {
  if (!thesis || !(thesis.signals && thesis.signals.ready)) return null;
  const parts = [known(thesis.iv) ? `volatility ${Math.round(Number(thesis.iv) * 100)}%` : null,
    known(thesis.seasonal) ? `season ${Number(thesis.seasonal).toFixed(1)}%/mo` : null, thesis.regime || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * HOW A CLOSED TRADE ENDED, in the board's words: "Closed by the rules: take profit at 50% of max profit." or
 * "Your reason: “USDA report on Friday; stepping aside before it.”" — from the stored `closeReason`, never re-decided.
 */
export function endedLine(entry = {}) {
  const r = (entry && entry.closeReason) || {};
  if (countsAsRuleClose(entry)) {
    const t = String(r.text || "").trim().replace(/\.$/, "");
    return t ? `Closed by the rules: ${t.charAt(0).toLowerCase()}${t.slice(1)}.` : "Closed by the rules.";
  }
  const w = String(r.written || r.text || "").trim();
  return w ? `Your reason: “${w}”` : "No reason was recorded.";
}

/** The state under a closed row's figure: RULE or YOUR REASON (a record Alpaca did not hold is NOT A FILL). */
export function closedState(entry = {}) {
  if (entry && entry.pnlNote && !countsAsRuleClose(entry) && journalPnl(entry).shown == null) return "NOT A FILL";
  return countsAsRuleClose(entry) ? "RULE" : "YOUR REASON";
}

/** "CLOSED TRADES · 4 · NET -$13" — the one sum (`journalPnlTotal()`); a figure that is not a fill is not in it. */
export function closedTitle(entries = []) {
  const n = (entries || []).length;
  const t = journalPnlTotal(entries);
  return `CLOSED TRADES · ${n}${t.total != null ? ` · NET ${pnlWords(t.total)}` : ""}`;
}

/** The line under the net when some figures were left out of it. */
export function netNote(entries = []) {
  const t = journalPnlTotal(entries);
  return t.excluded ? `The net leaves out ${t.excluded} figure${t.excluded === 1 ? "" : "s"} that ${t.excluded === 1 ? "is" : "are"} not a fill.` : null;
}

/** The state under an open row's figure, from the card's own reading. */
export function openState({ stage = "owned", working = false, action = null, kind = null } = {}) {
  if (stage === "working") return "ORDER WORKING";
  if (working) return "CLOSE WORKING";
  if (kind === "not-held") return "NOT ON ALPACA";
  return action || "NO QUOTE";
}

/* WHICH CHANCE CAME TRUE (PR 68, task 68.3): the words around `chanceCalibration()` (journal.js). */
export const CALIBRATION_HEAD = "WHICH CHANCE CAME TRUE";
/** "4 trades so far — too few to judge." */
export const calibrationTooFew = (n) => `${n} trade${n === 1 ? "" : "s"} so far — too few to judge.`;
export const calibrationNeeds = () => `It needs ${RULES.calibrationMinTrades} closed trades that carry both chances at entry: the market's ` +
  "(since PR 68) and the OSL model's, and a result read from a fill.";
/** A band's name: "40–60%". */
export const calibrationBand = (lo, hi) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
/** A band's cell: "said 52% · won 4 of 7", or "—" for an empty band. */
export const calibrationCell = (b) => (!b || !b.n ? "\u2014" : `said ${chanceText(b.said)} · won ${Math.round(b.won * b.n)} of ${b.n}`);
/** "Brier score (lower is better): Market 0.180 · OSL model 0.210". */
export const brierLine = (c) => `Brier score (lower is better): Market ${c.market.brier.toFixed(3)} · OSL model ${c.model.brier.toFixed(3)}`;
export const calibrationInfo = () => "For each band of the chance a trade was opened with, how often trades in it actually ended in profit: " +
  "a chance that is right says 30% and wins about 3 in 10. The Brier score is the average of (chance − result)², the result 1 " +
  "for a profit and 0 for a loss: 0 is perfect, 0.25 is what always saying 50% scores. A trade counts with both chances and a " +
  "result read from a fill.";

/* ---------------------------------------------------------------- PR 71: THE JOURNAL ON THE SERVER */
/**
 * THE ONE LINE UNDER THE JOURNAL'S TITLE (owner, 19 Oct 2026, task 71.3). `ok` is the last read or save of `/api/state`:
 * true → "Saved on the server · updated 14:05" (the time the server last confirmed it, the reader's clock); false → amber
 * "Only on this device: the server did not answer"; null (never asked: the demo, or before the first read) → nothing.
 */
export function journalSyncLine({ ok = null, at = null } = {}) {
  if (ok === true) {
    const d = new Date(Number(at));
    const hhmm = Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;
    return { text: `Saved on the server${hhmm ? ` · updated ${hhmm}` : ""}`, warn: false };
  }
  if (ok === false) return { text: "Only on this device: the server did not answer", warn: true };
  return null;
}
/** What a browser with nothing saved says when it adopted the server's book and Journal (PR #42; PR 71). */
export const restoredFromServerLine = (nPos = 0, nJournal = 0) =>
  `This browser had nothing saved, so ${[nPos ? `your ${nPos} open position${nPos === 1 ? "" : "s"}` : null,
    nJournal ? `the Journal (${entriesWords(nJournal)})` : null].filter(Boolean).join(" and ")} ${nPos > 1 || (nPos && nJournal) ? "were" : "was"} loaded from the server.`;
/** What the load says when another device had already filed positions this browser still showed open (PR 71). */
export const filedElsewhereLine = (n = 1) =>
  `${n} position${n === 1 ? " was" : "s were"} closed and filed in the Journal on another device: ${n === 1 ? "it is" : "they are"} no longer shown as open here.`;
