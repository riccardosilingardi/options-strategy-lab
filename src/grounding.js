// ============================================================================
// src/grounding.js — A COPILOT NUMBER MUST EXIST IN THE APP'S FIGURES (PR 62, owner 7 Oct 2026; "class 4": prose that
// contradicts the computed values).
//
// The copilot is handed the app's figures (the LIVE CONTEXT JSON, and the standing instructions with the rule numbers)
// and told to quote only those. This checks that it did, once an answer is finished: every DOLLAR AMOUNT and every
// PERCENTAGE in the answer is looked for among the numbers that were sent. One that is not there is listed under the
// answer in one quiet line ("Not in the app's figures: $X, Y%."). When every figure is found, nothing is printed.
//
// WHAT IS LOOKED AT, AND WHAT IS NOT.
//   · Looked at: "$4,725", "-$153", "$4.7k", "29%", "−3.6%". Formatting is ignored: "$4,725" is 4725, "29%" is 29 and
//     also 0.29 (the context carries a chance either way), and a sign is ignored (a loss is written "-$153" or "loses
//     $153"). Only a ROUNDING tolerance is allowed: half a unit of the last digit written ("$4,725" ± 0.50, "29.4%" ±
//     0.05), or half of a round hundred or thousand written as such ("$4,700" ± 50).
//   · Not looked at: STRIKES (a "$" amount followed by put / call / strike, or written as "$382/$363"), DATES, and PLAIN
//     COUNTS ("7 contracts", "9 of 16", "44 days") — they carry no "$" and no "%", so they are never extracted, and a
//     strike is a leg the trade already names. "per $100" and "per $1" are units, not figures.
//   · The rule numbers in the standing instructions (5%, 25%, 50%, 21 days…) are part of what was sent, so a copilot
//     that quotes a rule is never flagged (the owner, 7 Oct 2026: "forget these rules").
//
// Plain JS, no React: grounding.test.js holds it.
// ============================================================================

/** Every number in a piece of text, as a value ("$1,234.50" → 1234.5, "29%" → 29, "-3.6" → 3.6). Signs are dropped. */
// A number as written in prose: thousands grouped by commas ("4,725") or not ("4725"), and a decimal part. "12,13" is two
// numbers, never 1213 (a comma between them is a list, not a thousands separator).
const NUM = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
export function numbersIn(text) {
  const out = [];
  const re = new RegExp(`(${NUM})\\s*([kK]\\b|thousand\\b|million\\b|m\\b)?`, "g");
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const mult = !m[2] ? 1 : /^k|thousand/i.test(m[2]) ? 1e3 : 1e6;
    out.push(base * mult);
  }
  return out;
}

/**
 * Every number the app sent. `sent` is { text, context }: the standing instructions as text (their rule numbers), and the
 * context — the JSON string that was sent, or its object — walked value by value, so an array [12,130] is 12 and 130.
 */
export function sentNumbers(sent) {
  const vals = new Set();
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "number") { if (Number.isFinite(v)) vals.add(Math.abs(v)); return; }
    if (typeof v === "string") { for (const n of numbersIn(v)) vals.add(Math.abs(n)); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  const { text = "", context = null } = sent && typeof sent === "object" && ("text" in sent || "context" in sent) ? sent : { context: sent };
  for (const n of numbersIn(text)) vals.add(Math.abs(n));
  if (typeof context === "string") {
    try { walk(JSON.parse(context)); } catch { for (const n of numbersIn(context)) vals.add(Math.abs(n)); }
  } else walk(context);
  return [...vals];
}

const DOLLAR = new RegExp(`([-−+]?)\\$\\s?([-−]?)(${NUM})(\\s?(?:[kK]\\b|thousand\\b|million\\b|m\\b))?`, "g");
const PERCENT = new RegExp(`([-−+]?)(${NUM})\\s?%`, "g");

/** The rounding a written figure allows: half a unit of its last digit, or of a round hundred / thousand. */
function tolerance(digits, mult) {
  const [int, dec = ""] = digits.replace(/,/g, "").split(".");
  if (dec) return 0.5 * 10 ** -dec.length * mult;
  if (mult > 1) return 0.5 * mult;
  const zeros = int.length >= 3 ? (int.match(/0+$/) || [""])[0].length : 0;
  return 0.5 * 10 ** Math.min(zeros, 3);
}

/**
 * The figures in an answer, each with the value it means and the tolerance its writing allows.
 * @returns [{ raw, kind: "$" | "%", value, tol }]
 */
export function figuresIn(answer) {
  const text = String(answer || "");
  const out = [];
  let m;
  DOLLAR.lastIndex = 0;
  while ((m = DOLLAR.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 5), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/per\s$/i.test(before)) continue;                                     // "per $100": a unit
    if (/^\s?(?:\/|put|call|strike|P\b|C\b)/i.test(after)) continue;          // "$382/$363", "$380 put": a strike
    if (/\/\s?$/.test(before)) continue;                                      // the second half of "$382/$363"
    const unit = m[4] ? m[4].trim() : "";
    const mult = !unit ? 1 : /^k|thousand/i.test(unit) ? 1e3 : 1e6;
    const value = Number(m[3].replace(/,/g, "")) * mult;
    if (!Number.isFinite(value)) continue;
    out.push({ raw: m[0].trim(), kind: "$", value, tol: tolerance(m[3], mult) });
  }
  PERCENT.lastIndex = 0;
  while ((m = PERCENT.exec(text)) !== null) {
    const value = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const dec = (m[2].split(".")[1] || "").length;
    out.push({ raw: m[0].trim(), kind: "%", value, tol: 0.5 * 10 ** -dec });
  }
  return out;
}

/**
 * THE CHECK. Which figures in a finished answer are not among the numbers that were sent?
 * @param answer the copilot's whole answer
 * @param sent   what the app sent: the standing instructions and the context as one text, or the context object
 * @returns the figures not found, as written, each once, in the order they appear ([] when every one is found)
 */
export function ungroundedFigures(answer, sent) {
  const known = sentNumbers(sent);
  const near = (v, tol) => known.some((k) => Math.abs(k - v) <= tol + 1e-9);
  const missing = [];
  for (const f of figuresIn(answer)) {
    const ok = f.kind === "%" ? near(f.value, f.tol) || near(f.value / 100, f.tol / 100) : near(f.value, f.tol);
    if (!ok && !missing.includes(f.raw)) missing.push(f.raw);
  }
  return missing;
}
