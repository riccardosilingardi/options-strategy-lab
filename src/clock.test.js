// src/clock.test.js — the market clock line and local times (PR #47, TASK 0d).
import assert from "node:assert/strict";
import { marketClockLine, localStamp, localShort } from "./clock.js";
import { routeAllowed } from "../netlify/functions/alpaca.mjs";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };

// Alpaca's clock as it reads on Friday 2 Oct 2026 at 22:08 Milan (16:08 New York): the session ended at 16:00 NY.
const FRI_NIGHT = { timestamp: "2026-10-02T16:08:00-04:00", is_open: false,
  next_open: "2026-10-05T09:30:00-04:00", next_close: "2026-10-05T16:00:00-04:00" };

test("2 Oct 22:08 in Milan: 'Market closed · opens Mon 15:30 your time'", () => {
  assert.equal(marketClockLine(FRI_NIGHT, { timeZone: "Europe/Rome" }), "Market closed · opens Mon 15:30 your time");
  assert.equal(marketClockLine(FRI_NIGHT, { timeZone: "America/New_York" }), "Market closed · opens Mon 09:30 your time");
});

test("a close stays sendable, and the line says Alpaca holds it", () => {
  assert.equal(marketClockLine(FRI_NIGHT, { timeZone: "Europe/Rome", queued: true }),
    "Market closed · opens Mon 15:30 your time · Alpaca holds the order until then");
});

test("open market: no line. Unread clock: no line — unknown is not closed", () => {
  assert.equal(marketClockLine({ ...FRI_NIGHT, is_open: true }), null);
  assert.equal(marketClockLine(null), null);
  assert.equal(marketClockLine({}), null, "a reply without is_open says nothing");
  assert.equal(marketClockLine({ is_open: false }, { timeZone: "Europe/Rome" }), "Market closed · next open not reported");
});

test("History reads the owner's time: '2 Oct 22:08:06'", () => {
  assert.equal(localStamp("2026-10-02T20:08:06.123Z", { timeZone: "Europe/Rome" }), "2 Oct 22:08:06");
  assert.equal(localShort("2026-10-02T20:08:06Z", { timeZone: "Europe/Rome" }), "2 Oct 22:08");
  assert.equal(localStamp(null), "time not reported");
});

test("the proxy passes GET /v2/clock and nothing else on it", () => {
  assert.equal(routeAllowed("GET", "/v2/clock").ok, true);
  assert.equal(routeAllowed("POST", "/v2/clock").ok, false);
});

console.log(`\nclock: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
