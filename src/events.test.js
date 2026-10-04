// ============================================================================
// src/events.test.js — THE EVENT CALENDAR (redesign PR 1, TASK 4), read at 4 Oct 2026.
//
// The owner's cases: CORN with a 20 Nov expiry → the next major event is WASDE Fri 9 Oct 12:00 ET, in 5 days, and
// 2 WASDE and 7 Crop Progress reports fall before 20 Nov; UNG → EIA storage Thu 8 Oct 10:30 ET; GLD → FOMC statement
// Wed 28 Oct 14:00 ET; a weekly report in Thanksgiving week (23–27 Nov) carries the holiday note; on 2 Jan 2027 the
// line is the placeholder.
// ============================================================================
import assert from "node:assert/strict";
import { CALENDARS, CALENDAR_KEYS, EVENT_TABLE_END, eventsFor as eventsForShipped, nextEvent as nextEventShipped, daysUntil,
  localWhen, etDay, etInstant, federalHolidays, holidayWeekOf, calendarsOf, WEEKDAYS } from "./events.js";
import { EVENT_CALENDARS, MARKET_ROWS, BASKET } from "./markets.js";
import { eventLineText, HOLIDAY_WEEK_NOTE, PLACEHOLDERS } from "./rules.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };

/* >>> TEST DATA, NOT A CALENDAR (owner decision, 4 Oct 2026). <<< The shipped table carries no dates: the publishers'
   pages could not be read from the session that built it, so the app shows the placeholder. The logic is held on this
   table instead — the dates the owner's prompt named for its test cases — and nothing in the app reads it. */
const TEST_TABLE = {
  grains: [
    { id: "wasde", name: "WASDE", major: true, time: "12:00", dates: ["2026-10-09", "2026-11-10", "2026-12-10"], source: CALENDARS.grains[0].source },
    { id: "cropProgress", name: "Crop Progress", major: false, time: "16:00", weekly: { weekday: WEEKDAYS.mon, through: "2026-11-30" }, source: CALENDARS.grains[1].source },
  ],
  natgas: [{ id: "eiaStorage", name: "EIA storage", major: false, time: "10:30", weekly: { weekday: WEEKDAYS.thu, through: EVENT_TABLE_END }, source: CALENDARS.natgas[0].source }],
  petroleum: [{ id: "eiaPetroleum", name: "EIA petroleum", major: false, time: "10:30", weekly: { weekday: WEEKDAYS.wed, through: EVENT_TABLE_END }, source: CALENDARS.petroleum[0].source }],
  fomc: [{ id: "fomc", name: "FOMC statement", major: true, time: "14:00", dates: ["2026-10-28", "2026-12-09"], source: CALENDARS.fomc[0].source }],
};
const eventsFor = (tk, o = {}) => eventsForShipped(tk, { ...o, calendars: TEST_TABLE });
const nextEvent = (tk, o = {}) => nextEventShipped(tk, { ...o, calendars: TEST_TABLE });

// 4 Oct 2026, 09:00 in Milan (07:00 UTC): a Sunday.
const NOW = Date.UTC(2026, 9, 4, 7, 0);
const MILAN = "Europe/Rome";
console.log("\nTHE EVENT CALENDAR — at 4 Oct 2026, on a test-only table (the shipped one has no dates)\n");

test("CORN, expiry 20 Nov → the next MAJOR event is WASDE, Fri 9 Oct 12:00 ET, in 5 days", () => {
  const n = nextEvent("CORN", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "WASDE");
  assert.equal(n.ev.etDate, "2026-10-09");
  assert.equal(n.ev.etTime, "12:00");
  assert.equal(etDay(n.ev.etDate), "Fri 9 Oct");
  assert.equal(daysUntil(n.ev.at, NOW, MILAN), 5);
  // In Milan that is 18:00 (EDT is UTC−4, CEST UTC+2).
  assert.equal(localWhen(n.ev.at, MILAN), "Fri 9 Oct, 18:00");
  assert.equal(eventLineText({ name: n.ev.name, when: localWhen(n.ev.at, MILAN), days: 5, beforeDay: "20 Nov" }),
    "WASDE · Fri 9 Oct, 18:00 your time · in 5 days · before 20 Nov");
});

test("CORN, before 20 Nov: 2 WASDE and 7 Crop Progress reports", () => {
  const { before } = nextEvent("CORN", { now: NOW, expKey: "2026-11-20" });
  assert.equal(before.filter((e) => e.id === "wasde").length, 2);
  const cp = before.filter((e) => e.id === "cropProgress");
  assert.equal(cp.length, 7, cp.map((e) => e.etDate).join(", "));
  assert.deepEqual(cp.map((e) => e.etDate), ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.ok(cp.every((e) => e.etTime === "16:00"));
});

test("UNG → EIA storage, Thu 8 Oct 10:30 ET (weekly: the line names it when no major report is before the expiry)", () => {
  const n = nextEvent("UNG", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "EIA storage");
  assert.equal(etDay(n.ev.etDate), "Thu 8 Oct");
  assert.equal(n.ev.etTime, "10:30");
});

test("GLD → FOMC statement, Wed 28 Oct 14:00 ET", () => {
  const n = nextEvent("GLD", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "FOMC statement");
  assert.equal(etDay(n.ev.etDate), "Wed 28 Oct");
  assert.equal(n.ev.etTime, "14:00");
});

test("THANKSGIVING WEEK (23–27 Nov): a weekly report there carries the holiday note; one the week before does not", () => {
  const all = eventsFor("UNG", { now: NOW, untilIso: EVENT_TABLE_END });
  const thx = all.find((e) => e.etDate === "2026-11-26");
  assert.ok(thx, "the Thursday of Thanksgiving week is in the cadence");
  assert.equal(thx.holiday, "Thanksgiving");
  const usoWed = eventsFor("USO", { now: NOW }).find((e) => e.etDate === "2026-11-25");
  assert.equal(usoWed.holiday, "Thanksgiving");
  assert.equal(all.find((e) => e.etDate === "2026-11-19").holiday, null);
  assert.ok(eventLineText({ name: "EIA storage", when: "Thu 26 Nov, 16:30", days: 53, holiday: true }).endsWith(HOLIDAY_WEEK_NOTE));
  // The holidays are worked out from their rules, not typed.
  assert.deepEqual(federalHolidays(2026).map((h) => h.date), ["2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]);
  assert.equal(holidayWeekOf("2026-11-23").name, "Thanksgiving");
  // A major report is a dated release, never flagged as a weekly one.
  assert.ok(eventsFor("CORN", { now: NOW }).filter((e) => e.major).every((e) => e.holiday === null));
});

test("ON 2 JAN 2027 THE LINE IS THE PLACEHOLDER 'events-calendar' — and that id is in PLACEHOLDERS", () => {
  const n = nextEvent("CORN", { now: Date.UTC(2027, 0, 2, 12), expKey: "2027-02-19" });
  assert.deepEqual(n, { placeholder: "events-calendar" });
  assert.ok(PLACEHOLDERS.some((p) => p.id === "events-calendar"));
});

test("EASTERN TIME HONOURS DAYLIGHT SAVING: 12:00 ET is 16:00 UTC in October and 17:00 UTC in December", () => {
  assert.equal(new Date(etInstant("2026-10-09", "12:00")).toISOString(), "2026-10-09T16:00:00.000Z");
  assert.equal(new Date(etInstant("2026-12-10", "12:00")).toISOString(), "2026-12-10T17:00:00.000Z");
});

test("WHICH MARKET GETS WHICH CALENDAR IS ITS ROW'S `events` KEY; every key has a table; every basket market has one", () => {
  assert.deepEqual([...EVENT_CALENDARS].sort(), [...CALENDAR_KEYS].sort());
  for (const r of MARKET_ROWS) if (r.events) assert.ok(CALENDARS[r.events], `${r.ticker}: ${r.events} has no table`);
  for (const tk of BASKET) assert.ok(calendarsOf(tk).length, `${tk} reads no calendar`);
  assert.equal(nextEventShipped("SPY", { now: NOW }), null, "SPY reads none");
});

test("EVERY BLOCK NAMES ITS SOURCE, AND THE TABLE ENDS ON 31 DEC 2026", () => {
  assert.equal(EVENT_TABLE_END, "2026-12-31");
  for (const [k, blocks] of Object.entries(CALENDARS)) for (const b of blocks) {
    assert.match(b.source, /^https:\/\//, `${k}.${b.id} has no source`);
    for (const d of b.dates || []) assert.ok(d <= EVENT_TABLE_END, `${b.id} ${d} is past the table`);
  }
});

test("THE SHIPPED TABLE CARRIES NO DATE (owner, 4 Oct 2026): every market's line is the placeholder until the pages are read", () => {
  for (const blocks of Object.values(CALENDARS)) for (const b of blocks) {
    assert.ok(!(b.dates && b.dates.length) && !b.weekly && !b.time, `${b.id} carries a date, a weekday or a time nobody copied from its page`);
  }
  for (const tk of BASKET) assert.deepEqual(nextEventShipped(tk, { now: NOW, expKey: "2026-11-20" }), { placeholder: "events-calendar" }, tk);
  assert.equal(eventsForShipped("CORN", { now: NOW }).length, 0);
});

test("EXPIRIES AND 21-DAY EXITS JOIN THE LIST, read only", () => {
  const xs = eventsFor("CORN", { now: NOW, untilIso: "2026-11-20", expiries: ["2026-10-16", "2026-11-20", "2026-12-18"],
    exits: [{ date: "2026-10-30", label: "21-day exit · J-0009" }] });
  assert.ok(xs.some((e) => e.id === "expiry" && e.etDate === "2026-10-16"));
  assert.ok(!xs.some((e) => e.etDate === "2026-12-18"), "past the expiry shown");
  assert.ok(xs.some((e) => e.id === "exit" && e.name === "21-day exit · J-0009"));
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
