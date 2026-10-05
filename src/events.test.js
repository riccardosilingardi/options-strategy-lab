// ============================================================================
// src/events.test.js — THE EVENT CALENDAR, read at 4 Oct 2026, ON THE SHIPPED TABLE (round 2, owner decision 5 Oct 2026).
//
// The dates were read on the publishers' pages on 4–5 Oct 2026 and copied into src/events.js. Round 1 tested a test-only
// table; this one tests what the app shows. The owner's cases: CORN with a 20 Nov expiry → WASDE Fri 9 Oct, in 5 days, and
// 2 WASDE and 7 Crop Progress before 20 Nov; UNG → Thu 8 Oct 10:30 ET; USO → Wed 7 Oct 10:30 ET, then Thu 15 Oct 12:00 ET in
// place of Wed 14 Oct (the Columbus Day move; and from 8 Oct it is the next one); GLD → FOMC decision Wed 28 Oct, no time;
// 2 Jan 2027 → the placeholder. Holiday weeks: round 1's rule, kept by the owner (5 Oct 2026), except where the page lists
// every holiday change (EIA petroleum).
// ============================================================================
import assert from "node:assert/strict";
import { CALENDARS, CALENDAR_KEYS, EVENT_TABLE_END, eventsFor, nextEvent, daysUntil,
  localWhen, etDay, etInstant, federalHolidays, holidayWeekOf, calendarsOf } from "./events.js";
import { EVENT_CALENDARS, MARKET_ROWS, BASKET } from "./markets.js";
import { eventLineText, eventInfoText, dateOnlyWhen, holidayWeekNote, PLACEHOLDERS } from "./rules.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };

// 4 Oct 2026, 09:00 in Milan (07:00 UTC): a Sunday.
const NOW = Date.UTC(2026, 9, 4, 7, 0);
const MILAN = "Europe/Rome";
console.log("\nTHE EVENT CALENDAR — at 4 Oct 2026, on the table the app ships (read 5 Oct 2026)\n");

test("CORN, expiry 20 Nov → the next MAJOR event is WASDE, Fri 9 Oct 12:00 ET, in 5 days", () => {
  const n = nextEvent("CORN", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "WASDE");
  assert.equal(n.ev.what, "crop report");
  assert.equal(n.ev.etDate, "2026-10-09");
  assert.equal(n.ev.etTime, "12:00");
  assert.equal(etDay(n.ev.etDate), "Fri 9 Oct");
  assert.equal(daysUntil(n.ev.at, NOW, MILAN), 5);
  // In Milan that is 18:00 (EDT is UTC−4, CEST UTC+2).
  assert.equal(localWhen(n.ev.at, MILAN), "Fri 9 Oct, 18:00");
  assert.equal(eventLineText({ name: n.ev.name, when: localWhen(n.ev.at, MILAN), days: 5, beforeDay: "20 Nov" }),
    "WASDE · Fri 9 Oct, 18:00 your time · in 5 days · before 20 Nov");
});

test("CORN, before 20 Nov: 2 WASDE and 7 Crop Progress reports, Mondays 16:00 ET", () => {
  const { before } = nextEvent("CORN", { now: NOW, expKey: "2026-11-20" });
  assert.deepEqual(before.filter((e) => e.id === "wasde").map((e) => e.etDate), ["2026-10-09", "2026-11-10"]);
  const cp = before.filter((e) => e.id === "cropProgress");
  assert.equal(cp.length, 7, cp.map((e) => e.etDate).join(", "));
  assert.deepEqual(cp.map((e) => e.etDate), ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.ok(cp.every((e) => e.etTime === "16:00"));
  // Crop Progress runs through Mon 30 Nov and no further.
  const all = eventsFor("CORN", { now: NOW }).filter((e) => e.id === "cropProgress");
  assert.equal(all[all.length - 1].etDate, "2026-11-30");
});

test("UNG → EIA storage, Thu 8 Oct 10:30 ET (weekly: the line names it when no major report is before the expiry)", () => {
  const n = nextEvent("UNG", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "EIA storage");
  assert.equal(etDay(n.ev.etDate), "Thu 8 Oct");
  assert.equal(n.ev.etTime, "10:30");
  assert.equal(nextEvent("BOIL", { now: NOW, expKey: "2026-11-20" }).ev.etDate, "2026-10-08", "BOIL reads the same calendar");
});

test("USO → Wed 7 Oct 10:30 ET; the week after is Thu 15 Oct 12:00 ET in place of Wed 14 Oct (Columbus Day); from 8 Oct that is the next one", () => {
  const n = nextEvent("USO", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "EIA petroleum");
  assert.equal(etDay(n.ev.etDate), "Wed 7 Oct"); assert.equal(n.ev.etTime, "10:30");
  const xs = eventsFor("USO", { now: NOW });
  assert.ok(!xs.some((e) => e.etDate === "2026-10-14"), "Wed 14 Oct is moved, not kept");
  const moved = xs.find((e) => e.etDate === "2026-10-15");
  assert.equal(moved.etTime, "12:00"); assert.equal(moved.moved, "Columbus Day"); assert.equal(moved.holiday, null);
  const later = nextEvent("USO", { now: Date.UTC(2026, 9, 8, 12), expKey: "2026-11-20" });
  assert.equal(etDay(later.ev.etDate), "Thu 15 Oct"); assert.equal(later.ev.etTime, "12:00");
  // Veterans Day: Thu 12 Nov 12:00 in place of Wed 11 Nov. XLE reads the same calendar.
  const vet = eventsFor("XLE", { now: NOW }).find((e) => e.etDate === "2026-11-12");
  assert.equal(vet.etTime, "12:00"); assert.equal(vet.moved, "Veterans Day");
  assert.ok(!eventsFor("XLE", { now: NOW }).some((e) => e.etDate === "2026-11-11"));
});

test("GLD → FOMC decision Wed 28 Oct, NO TIME (the Fed's page gives days, not the hour)", () => {
  const n = nextEvent("GLD", { now: NOW, expKey: "2026-11-20" });
  assert.equal(n.ev.name, "FOMC");
  assert.equal(etDay(n.ev.etDate), "Wed 28 Oct");
  assert.equal(n.ev.etTime, null); assert.equal(n.ev.dateOnly, true);
  const when = dateOnlyWhen(n.ev.what, etDay(n.ev.etDate));
  assert.equal(when, "decision Wed 28 Oct");
  const line = eventLineText({ name: n.ev.name, when, days: daysUntil(n.ev.at, NOW, "America/New_York"), dateOnly: true });
  assert.equal(line, "FOMC · decision Wed 28 Oct · in 24 days");
  assert.doesNotMatch(line, /\d:\d\d|your time/, "never a time nobody read");
  assert.match(eventInfoText(n.ev, etDay(n.ev.etDate)), /gives the day, not the hour/);
  // The decision day counts until it is over: on the day itself it is still the next one.
  assert.equal(nextEvent("SLV", { now: Date.UTC(2026, 9, 28, 20) }).ev.etDate, "2026-10-28");
  assert.equal(nextEvent("GDX", { now: Date.UTC(2026, 9, 29, 12) }).ev.etDate, "2026-12-09");
});

test("HOLIDAY WEEKS (owner, 5 Oct 2026: as round 1): every weekly report not listed as moved carries the note in a federal-holiday week; EIA petroleum, whose page lists its changes, never does", () => {
  const ung = eventsFor("UNG", { now: NOW });
  const flagged = ung.filter((e) => e.holiday).map((e) => `${e.etDate} ${e.holiday}`);
  assert.deepEqual(flagged, ["2026-10-15 Columbus Day", "2026-11-12 Veterans Day", "2026-11-26 Thanksgiving", "2026-12-24 Christmas Day"]);
  assert.equal(ung.find((e) => e.etDate === "2026-11-19").holiday, null);
  const cp = eventsFor("CORN", { now: NOW }).filter((e) => e.holiday).map((e) => e.etDate);
  assert.deepEqual(cp, ["2026-10-12", "2026-11-09", "2026-11-23"], "Crop Progress: Columbus, Veterans, Thanksgiving weeks");
  assert.ok(eventsFor("USO", { now: NOW }).every((e) => e.holiday === null), "petroleum: the page's own moves only");
  assert.ok(eventsFor("CORN", { now: NOW }).filter((e) => e.major).every((e) => e.holiday === null), "a dated release is never flagged");
  const thx = ung.find((e) => e.etDate === "2026-11-26");
  assert.ok(eventLineText({ name: "EIA storage", when: "Thu 26 Nov, 16:30", days: 53, holiday: true, publisher: thx.publisher })
    .endsWith("holiday week: EIA may move it"));
  assert.equal(holidayWeekNote(null), "holiday week: the publisher may move it");
  // The holidays are worked out from their rules, not typed.
  assert.deepEqual(federalHolidays(2026).map((h) => h.date), ["2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]);
  assert.equal(holidayWeekOf("2026-11-23").name, "Thanksgiving");
});

test("ON 2 JAN 2027 THE LINE IS THE PLACEHOLDER 'events-calendar' — and that id is in PLACEHOLDERS; SPY reads no calendar", () => {
  for (const tk of BASKET) assert.deepEqual(nextEvent(tk, { now: Date.UTC(2027, 0, 2, 12), expKey: "2027-02-19" }), { placeholder: "events-calendar" }, tk);
  assert.ok(PLACEHOLDERS.some((p) => p.id === "events-calendar"));
  assert.equal(nextEvent("SPY", { now: NOW }), null);
});

test("BEFORE THE END, NO MARKET IN THE BASKET SHOWS THE PLACEHOLDER: every one has a date", () => {
  for (const tk of BASKET) {
    const n = nextEvent(tk, { now: NOW, expKey: "2026-11-20" });
    assert.ok(n && n.ev, `${tk}: ${JSON.stringify(n)}`);
  }
});

test("EASTERN TIME HONOURS DAYLIGHT SAVING: 12:00 ET is 16:00 UTC in October and 17:00 UTC in December", () => {
  assert.equal(new Date(etInstant("2026-10-09", "12:00")).toISOString(), "2026-10-09T16:00:00.000Z");
  assert.equal(new Date(etInstant("2026-12-10", "12:00")).toISOString(), "2026-12-10T17:00:00.000Z");
});

test("WHICH MARKET GETS WHICH CALENDAR IS ITS ROW'S `events` KEY; every key has a table; every basket market has one", () => {
  assert.deepEqual([...EVENT_CALENDARS].sort(), [...CALENDAR_KEYS].sort());
  for (const r of MARKET_ROWS) if (r.events) assert.ok(CALENDARS[r.events], `${r.ticker}: ${r.events} has no table`);
  for (const tk of BASKET) assert.ok(calendarsOf(tk).length, `${tk} reads no calendar`);
  assert.equal(nextEvent("SPY", { now: NOW }), null, "SPY reads none");
});

test("EVERY BLOCK NAMES ITS SOURCE AND WHEN IT WAS READ, AND THE TABLE ENDS ON 31 DEC 2026", () => {
  assert.equal(EVENT_TABLE_END, "2026-12-31");
  for (const [k, blocks] of Object.entries(CALENDARS)) for (const b of blocks) {
    assert.match(b.source, /^https:\/\//, `${k}.${b.id} has no source`);
    assert.equal(b.read, "read 5 Oct 2026", `${k}.${b.id} does not say when it was read`);
    for (const d of b.dates || []) assert.ok(d <= EVENT_TABLE_END, `${b.id} ${d} is past the table`);
  }
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
