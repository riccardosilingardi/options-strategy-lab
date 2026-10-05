// ============================================================================
// src/events.js — THE EVENT CALENDAR (redesign PR 1, TASK 4; owner decision, 4 Oct 2026: an official table in the app).
//
// NEWS IS NOT A CALENDAR. A headline carries the date it was published, not the date of the next report, so the dates
// below come from the publishers' own calendars, each block beside its source URL. They are COPIED, never typed from
// memory, and the table runs to EVENT_TABLE_END. After that date — and for a market with no calendar copied in — the
// event line is the placeholder "events-calendar" (rules.js `PLACEHOLDERS`). The dates were read on 4–5 Oct 2026 (round 2).
//
// WHICH MARKET GETS WHICH CALENDAR is the `events` key on its row in markets.js, never a list in this file.
//
// HOLIDAY WEEKS. A weekly report in a week (Monday to Sunday) holding a US federal holiday carries "holiday week: <the
// publisher> may move it", unless its block lists the moved date, or its page lists every holiday change (`holidaysRead`). The holidays are WORKED OUT from their
// rules (the second Monday of October, 11 November, the fourth Thursday of November, 25 December), not typed.
//
// TIMES ARE THE PUBLISHERS' (Eastern Time) and the screen prints them in the user's own zone, like every other time in
// the app; the ET time and the source sit behind the line's ⓘ.
//
// Plain JS: `events.test.js` reads THIS table at 4 Oct 2026 (round 2: no test-only table any more).
// ============================================================================
import { getU } from "./markets.js";
import { RULES } from "./rules.js";

/** Weekdays by name (0 = Sunday), so a cadence reads as a day, not a number. */
const WD = Object.freeze(Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d, i) => [d, i])));

/** The last day the table holds. Past it, the event line is the placeholder "events-calendar". */
export const EVENT_TABLE_END = "2026-12-31";

/*
 * THE TABLE — READ ON THE PUBLISHERS' PAGES ON 4–5 OCT 2026 (owner decision, 5 Oct 2026). The owner's assistant read each
 * page; the dates below are copied from that reading, each block beside its source, `read` saying when. A block is a list
 * of dates (`dates`) or a weekly cadence (`weekly`: weekday from `WD`, from today to `through`), with the publisher's
 * Eastern Time (`time`). Three things a page can say, and nothing more:
 *   - `time: null` with dates: the page gives the DAY, not the hour (the Fed's calendar). The line says the day and no
 *     time; never an hour nobody read.
 *   - `moves`: a weekly date the page lists as moved, to its new day and time (EIA petroleum's holiday schedule).
 *   - `holidaysRead`: the page lists every holiday change, so a holiday week with no move listed is NOT flagged. Without
 *     it, a weekly report in a federal-holiday week carries "holiday week: <publisher> may move it" (round 1's rule,
 *     kept by the owner, 5 Oct 2026).
 * `major` marks the reports the line leads with (WASDE, FOMC); `what` is the word after the name ("crop report").
 */
const READ = "read 5 Oct 2026";
const CME_USDA = "https://www.cmegroup.com/articles/2026/understanding-major-usda-reports-in-2026.html";
export const CALENDARS = Object.freeze({
  grains: Object.freeze([
    Object.freeze({ id: "wasde", name: "WASDE", what: "crop report", publisher: "USDA", major: true, time: "12:00",
      dates: Object.freeze(["2026-10-09", "2026-11-10", "2026-12-10"]), source: CME_USDA, read: READ }),
    Object.freeze({ id: "cropProgress", name: "Crop Progress", what: "crop report", publisher: "USDA", major: false, time: "16:00",
      weekly: Object.freeze({ weekday: WD.mon, through: "2026-11-30" }), source: CME_USDA, read: READ }),
  ]),
  natgas: Object.freeze([
    // The 2026 holiday changes could not be read on this page: a holiday week carries the note.
    Object.freeze({ id: "eiaStorage", name: "EIA storage", what: "report", publisher: "EIA", major: false, time: "10:30",
      weekly: Object.freeze({ weekday: WD.thu, through: EVENT_TABLE_END }), source: "https://ir.eia.gov/ngs/ngs.html", read: READ }),
  ]),
  petroleum: Object.freeze([
    Object.freeze({ id: "eiaPetroleum", name: "EIA petroleum", what: "report", publisher: "EIA", major: false, time: "10:30",
      weekly: Object.freeze({ weekday: WD.wed, through: EVENT_TABLE_END }), holidaysRead: true,
      moves: Object.freeze([
        Object.freeze({ from: "2026-10-14", to: "2026-10-15", time: "12:00", why: "Columbus Day" }),
        Object.freeze({ from: "2026-11-11", to: "2026-11-12", time: "12:00", why: "Veterans Day" }),
      ]),
      source: "https://www.eia.gov/petroleum/supply/weekly/schedule.php", read: READ }),
  ]),
  fomc: Object.freeze([
    // Meetings 27–28 Oct and 8–9 Dec 2026; the decision is the second day. The page gives days, not the hour.
    Object.freeze({ id: "fomc", name: "FOMC", what: "decision", publisher: "the Fed", major: true, time: null,
      dates: Object.freeze(["2026-10-28", "2026-12-09"]), meetings: Object.freeze(["27–28 Oct", "8–9 Dec"]),
      source: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", read: READ }),
  ]),
});
/** Weekdays by name, for a weekly block once its day is copied in. */
export const WEEKDAYS = WD;
export const CALENDAR_KEYS = Object.freeze(Object.keys(CALENDARS));

/* ---- DATES, WITHOUT A DATE LIBRARY ---- */
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? [+m[1], +m[2], +m[3]] : null; };
const utcDay = (iso) => { const p = parts(iso); return p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN; };
const addDays = (iso, n) => { const d = new Date(utcDay(iso) + n * 86400000); return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
const weekdayOf = (iso) => new Date(utcDay(iso)).getUTCDay();

/** The calendar date in a time zone, "YYYY-MM-DD". */
export function dateIn(ms, timeZone = "America/New_York") {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** A wall-clock time in New York as an instant (ms): the offset is read from the zone, so daylight saving is right. */
export function etInstant(iso, hhmm) {
  const [h, mi] = String(hhmm).split(":").map(Number);
  const p = parts(iso);
  for (const off of [4, 5]) {
    const ms = Date.UTC(p[0], p[1] - 1, p[2], h + off, mi);
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
    if (f === `${pad(h)}:${pad(mi)}` && dateIn(ms) === iso) return ms;
  }
  return Date.UTC(p[0], p[1] - 1, p[2], h + 5, mi);
}

/** The n-th weekday of a month (n = -1: the last), as "YYYY-MM-DD". */
const nthWeekday = (y, m, weekday, n) => {
  const first = isoOf(y, m, 1);
  const shift = (weekday - weekdayOf(first) + 7) % 7;
  return addDays(first, shift + (n - 1) * 7);
};
/**
 * THE US FEDERAL HOLIDAYS THAT CAN FALL IN THE TABLE'S MONTHS, worked out from their rules for a year: Columbus Day
 * (second Monday of October), Veterans Day (11 November), Thanksgiving (fourth Thursday of November), Christmas
 * (25 December). A holiday on a weekend is observed on the nearest weekday.
 */
export function federalHolidays(year) {
  const observed = (iso) => (weekdayOf(iso) === 6 ? addDays(iso, -1) : weekdayOf(iso) === 0 ? addDays(iso, 1) : iso);
  return [
    { name: "Columbus Day", date: nthWeekday(year, 10, 1, 2) },
    { name: "Veterans Day", date: observed(isoOf(year, 11, 11)) },
    { name: "Thanksgiving", date: nthWeekday(year, 11, 4, 4) },
    { name: "Christmas Day", date: observed(isoOf(year, 12, 25)) },
  ];
}
/** The holiday in the Monday-to-Sunday week of a date, or null. */
export function holidayWeekOf(iso) {
  const monday = addDays(iso, -((weekdayOf(iso) + 6) % 7));
  const sunday = addDays(monday, 6);
  const p = parts(iso);
  return federalHolidays(p[0]).find((h) => h.date >= monday && h.date <= sunday) || null;
}

/** The calendar keys a market reads, from its row in markets.js. */
export const calendarsOf = (tk) => {
  const k = getU(tk).events;
  return Array.isArray(k) ? k : k ? [k] : [];
};

/**
 * EVERY EVENT FOR A MARKET FROM `now` UP TO (NOT INCLUDING) THE END OF `untilIso`, oldest first.
 * The calendars from its row, plus its option `expiries` (from the chain) and the time-exit `exits` (RULES.exitDTE) of any open position
 * in it ([{ date, label }], read only). Each: { id, name, at (ms), etDate, etTime, major, weekly, holiday, source }.
 */
export function eventsFor(tk, { now = Date.now(), untilIso = EVENT_TABLE_END, expiries = [], exits = [], calendars = CALENDARS } = {}) {
  const today = dateIn(now);
  const end = untilIso < EVENT_TABLE_END ? untilIso : EVENT_TABLE_END;
  const out = [];
  for (const key of calendarsOf(tk)) {
    for (const b of calendars[key] || []) {
      if (!(b.dates && b.dates.length) && !b.weekly) continue;   // a block with nothing copied in yet
      if (b.weekly && !b.time) continue;                          // a weekly cadence always has the publisher's time
      const days = b.dates ? [...b.dates]
        : (() => {
          const xs = [];
          const through = b.weekly.through < end ? b.weekly.through : end;
          let d = addDays(today, (b.weekly.weekday - weekdayOf(today) + 7) % 7);
          for (; d <= through; d = addDays(d, 7)) xs.push(d);
          return xs;
        })();
      for (const d0 of days) {
        // A date the page lists as moved goes to its new day and time, and is not a guess: no holiday note.
        const mv = (b.moves || []).find((m) => m.from === d0) || null;
        const d = mv ? mv.to : d0;
        const time = mv ? mv.time : b.time;
        if (d > end) continue;
        // No time read (the Fed's calendar): the day counts until it is over in New York, and no hour is printed.
        const at = time ? etInstant(d, time) : etInstant(d, "00:00");
        if ((time ? at : etInstant(addDays(d, 1), "00:00")) < now) continue;
        const hol = b.weekly && !mv && !b.holidaysRead ? holidayWeekOf(d) : null;
        out.push({ id: b.id, name: b.name, what: b.what || null, publisher: b.publisher || null, at, etDate: d, etTime: time || null,
          dateOnly: !time, major: !!b.major, weekly: !!b.weekly, moved: mv ? mv.why : null,
          holiday: hol ? hol.name : null, source: b.source, read: b.read || null });
      }
    }
  }
  for (const e of expiries || []) {
    if (!e || e < today || e > (untilIso || e)) continue;
    out.push({ id: "expiry", name: "Option expiry", at: etInstant(e, "16:00"), etDate: e, etTime: "16:00", major: false, weekly: false,
      holiday: null, source: null });
  }
  for (const x of exits || []) {
    if (!x || !x.date || x.date < today || x.date > (untilIso || x.date)) continue;
    out.push({ id: "exit", name: x.label || `${RULES.exitDTE}-day exit`, at: etInstant(x.date, "09:30"), etDate: x.date, etTime: "09:30", major: false,
      weekly: false, holiday: null, source: null });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * THE ONE EVENT THE LINE NAMES: the next MAJOR report (WASDE, FOMC) before the expiry shown, otherwise the next
 * weekly one. Past the table's end it is the placeholder.
 * @returns {{ placeholder: "events-calendar" } | { ev, before: [...] } | null}
 */
export function nextEvent(tk, { now = Date.now(), expKey = null, calendars = CALENDARS } = {}) {
  const keys = calendarsOf(tk);
  if (!keys.length) return null;
  // Past the table's end, or no date copied in for this market yet: the placeholder, never a guessed date.
  const filled = keys.some((k) => (calendars[k] || []).some((b) => (b.dates && b.dates.length) || (b.weekly && b.time)));
  if (dateIn(now) > EVENT_TABLE_END || !filled) return { placeholder: "events-calendar" };
  const before = eventsFor(tk, { now, untilIso: expKey || EVENT_TABLE_END, calendars }).filter((e) => !expKey || e.etDate < expKey);
  const ev = before.find((e) => e.major) || before.find((e) => e.weekly) || null;
  return ev ? { ev, before } : null;
}

/** Whole days from today to the event's date, both in the user's zone ("in 5 days"). */
export function daysUntil(at, now = Date.now(), timeZone) {
  return Math.round((utcDay(dateIn(at, timeZone)) - utcDay(dateIn(now, timeZone))) / 86400000);
}

/** "Fri 9 Oct, 18:00" in a time zone (the user's when none is given). */
export function localWhen(at, timeZone) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit",
    minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g("weekday")} ${g("day")} ${g("month")}, ${g("hour")}:${g("minute")}`;
}
/** "Fri 9 Oct" — an ET calendar date, for the ⓘ. */
export function etDay(iso) {
  const d = new Date(utcDay(iso));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}
