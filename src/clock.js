// ============================================================================
// src/clock.js — IS THE MARKET OPEN, AND WHAT TIME IS IT HERE. Plain JS, no React.
//
// PR #47, TASK 0d. Measured 2 Oct 2026, 22:08 in Milan: J-0001's close sat "0 of 9" at Alpaca and nothing on screen
// said the market had closed at 22:00 Milan time and would not open again until Monday. Alpaca's own clock
// (`GET /v2/clock`: `is_open`, `next_open`, `next_close`, `timestamp` — alpaca-py `Clock`) is read at each sync, and
// every order row, the confirm steps and Modify show ONE line when it is closed. A close stays sendable: Alpaca
// accepts a limit order outside the session and holds it until the open (that is how J-0001's close was queued).
//
// Times are the READER'S clock (the phone's time zone), never New York's: the owner reads "opens Mon 15:30".
// `timeZone` is a parameter only so a test can pin it.
// ============================================================================

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The parts of one instant in a time zone (the reader's when `timeZone` is undefined). Null for a bad date. */
function partsOf(t, timeZone) {
  if (!Number.isFinite(t)) return null;
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const o = {};
  for (const p of f.formatToParts(new Date(t))) o[p.type] = p.value;
  // A weekday from the formatted date, not the formatter's own word, so the language never leaks.
  const wd = new Date(Date.UTC(+o.year, +o.month - 1, +o.day)).getUTCDay();
  return { y: +o.year, mo: +o.month - 1, d: +o.day, wd, hh: o.hour, mm: o.minute, ss: o.second };
}

/** "2 Oct 22:08:06", in the reader's time (History, TASK 1). An unreadable time is "time not reported". */
export function localStamp(iso, { timeZone } = {}) {
  const p = partsOf(Date.parse(iso || ""), timeZone);
  return p ? `${p.d} ${MONTH[p.mo]} ${p.hh}:${p.mm}:${p.ss}` : "time not reported";
}

/** "2 Oct 22:08", the same without seconds (a row's sent time). */
export function localShort(iso, { timeZone } = {}) {
  const p = partsOf(Date.parse(iso || ""), timeZone);
  return p ? `${p.d} ${MONTH[p.mo]} ${p.hh}:${p.mm}` : "time not reported";
}

/**
 * THE ONE LINE. Null when the market is open, and null when the clock was never read: an unread clock is not a
 * closed market (unknown is not zero).
 * @param clock  Alpaca's `/v2/clock` reply, or null
 * @param queued true where an order can be sent now and waits for the open (a close, Modify): the line says so
 */
export function marketClockLine(clock, { timeZone, queued = false } = {}) {
  if (!clock || typeof clock !== "object" || clock.is_open !== false) return null;
  const p = partsOf(Date.parse(clock.next_open || ""), timeZone);
  const when = p ? `opens ${WEEKDAY[p.wd]} ${p.hh}:${p.mm} your time` : "next open not reported";
  return `Market closed · ${when}${queued ? " · Alpaca holds the order until then" : ""}`;
}
