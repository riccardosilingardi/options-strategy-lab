// Tests for PR #44, TASK 3 — Back works. A fake browser history stands in for `window.history`, so the
// behaviour the owner's Android back button needs is proved without a browser: pushing on a move, restoring on
// popstate, stepping back when a sheet is closed from its own button, and leaving Home alone.
//
// Plain Node, no framework: `npm test` runs this file directly.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { navOf, sameNav, sheetOpen, planNav, createNavHistory } from "./nav.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/** A browser: a list of entries, a position, replaceState / pushState / back, and popstate. */
function fakeBrowser() {
  const entries = [{ state: null }];
  let index = 0;
  const listeners = [];
  const fire = () => listeners.forEach((fn) => fn({ state: entries[index].state }));
  const history = {
    replaceState(s) { entries[index] = { state: s }; },
    pushState(s) { entries.length = index + 1; entries.push({ state: s }); index += 1; },
    back() { if (index > 0) { index -= 1; fire(); } },
  };
  return {
    history, entries, get index() { return index; },
    addPopListener: (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    /** The user's own Back button. Returns false when there is nothing behind: that is the app being left. */
    userBack() { if (index === 0) return false; index -= 1; fire(); return true; },
    userForward() { if (index < entries.length - 1) { index += 1; fire(); return true; } return false; },
  };
}

/** The app: its screen is `nav`, a move is `go()`, and every move is followed by the same sync the React effect runs. */
function app() {
  const b = fakeBrowser();
  let nav = navOf({ view: "wizard" });
  const hist = createNavHistory({ history: b.history, addPopListener: b.addPopListener, get: () => nav,
    apply: (n) => { nav = { ...n }; } });
  return {
    b, hist,
    get nav() { return nav; },
    go(patch) { nav = { ...nav, ...patch }; return hist.sync(); },
    back() { const r = b.userBack(); hist.sync(); return r; },
  };
}

test("PLAN — nothing moved is nothing to do; a move is a push", () => {
  const a = navOf({ view: "wizard" }), b = navOf({ view: "desk", tab: "build", step: "find" });
  assert.equal(planNav([a], 0, a).type, "none");
  assert.equal(planNav([a], 0, b).type, "push");
  assert.equal(sameNav(a, { ...a }), true);
  assert.equal(sameNav(a, null), false);
});

test("PLAN — closing a sheet from its own button is a back, opening one is a push", () => {
  const screen = navOf({ view: "desk", tab: "positions" });
  const open = { ...screen, detailsId: 7 };
  assert.equal(sheetOpen(open), true);
  assert.equal(sheetOpen(screen), false);
  assert.equal(planNav([screen, open], 1, screen).type, "back");
  assert.equal(planNav([screen], 0, open).type, "push");
  // Closing a sheet AND moving elsewhere is not a plain back.
  assert.equal(planNav([screen, open], 1, navOf({ view: "desk", tab: "journal" })).type, "push");
});

test("BACK from Positions, Find and Build returns to the screen before, and Home is left alone", () => {
  const x = app();
  x.go({ view: "desk", tab: "build", step: "find" });
  x.go({ step: "build" });
  assert.equal(x.nav.step, "build");
  assert.equal(x.back(), true);
  assert.equal(x.nav.step, "find", "Build -> Back -> Find");
  assert.equal(x.back(), true);
  assert.equal(x.nav.view, "wizard", "Find -> Back -> Home");
  assert.equal(x.back(), false, "Back on Home leaves the app, as before: nothing was pushed under it");
});

test("every place is a screen: Positions, Watching, Journal and Settings each push and each go back", () => {
  const x = app();
  x.go({ view: "desk", tab: "positions" });
  x.go({ tab: "watching" });
  x.go({ tab: "journal" });
  x.go({ settings: true });
  assert.equal(x.b.entries.length, 5);
  x.back(); assert.equal(x.nav.settings, false);
  x.back(); assert.equal(x.nav.tab, "watching");
  x.back(); assert.equal(x.nav.tab, "positions");
  x.back(); assert.equal(x.nav.view, "wizard");
});

test("DETAILS and WHY are screens too: opening pushes, Back closes the sheet and stays on the place", () => {
  const x = app();
  x.go({ view: "desk", tab: "positions" });
  x.go({ detailsId: 12 });
  assert.equal(x.nav.detailsId, 12);
  x.back();
  assert.equal(x.nav.detailsId, null);
  assert.equal(x.nav.tab, "positions", "the place under the sheet is still there");
  x.go({ tab: "build", step: "find" });
  x.go({ ev: "why", whyTk: "GDX" });
  assert.equal(x.nav.ev, "why");
  x.back();
  assert.equal(x.nav.ev, null);
  assert.equal(x.nav.step, "find");
});

test("CLOSING a sheet from its own button steps back: no screen is left behind for Back to re-open", () => {
  const x = app();
  x.go({ view: "desk", tab: "positions" });
  const before = x.b.entries.length;
  x.go({ detailsId: 3 });
  assert.equal(x.b.entries.length, before + 1);
  const plan = x.go({ detailsId: null });
  assert.equal(plan.type, "back");
  assert.equal(x.nav.detailsId, null);
  assert.equal(x.b.index, before - 1, "the history stepped back to the entry under the sheet");
  // Back now leaves the Positions place for Home, rather than re-opening the sheet.
  x.back();
  assert.equal(x.nav.view, "wizard");
  assert.equal(x.nav.detailsId, null);
});

test("a render that does not move the screen pushes nothing, and sync is idempotent", () => {
  const x = app();
  x.go({ view: "desk", tab: "build", step: "find" });
  const n = x.b.entries.length;
  x.hist.sync(); x.hist.sync();
  assert.equal(x.b.entries.length, n);
});

test("two back-to-back syncs after a sheet close ask for ONE back, not two", () => {
  const x = app();
  x.go({ view: "desk", tab: "positions" });
  x.go({ detailsId: 3 });
  x.go({ detailsId: null });          // asks for a back (and the fake fires popstate at once)
  x.hist.sync();
  assert.equal(x.hist.state().idx, 1);
  assert.equal(x.nav.tab, "positions");
});

test("FORWARD restores what Back left, and a push after Back drops the forward entries", () => {
  const x = app();
  x.go({ view: "desk", tab: "build", step: "find" });
  x.go({ step: "build" });
  x.back();
  assert.equal(x.b.userForward(), true);
  assert.equal(x.nav.step, "build");
  x.back();
  x.go({ tab: "journal" });
  assert.equal(x.b.userForward(), false, "the Build entry was dropped by the new push");
});

test("an entry that is not ours (no osl / no id) is ignored", () => {
  const b = fakeBrowser();
  let applied = 0;
  createNavHistory({ history: b.history, addPopListener: b.addPopListener, get: () => navOf(), apply: () => { applied++; } });
  // Another library's entry, then Back to ours, then Forward onto the foreign one: only OUR entry is applied.
  b.history.pushState({ other: true });
  b.userBack();
  assert.equal(applied, 1);
  b.userForward();
  assert.equal(applied, 1, "the foreign entry is left alone");
});

test("a reload that left forward entries behind does not break the stack", () => {
  const b = fakeBrowser();
  let nav = navOf({ view: "desk", tab: "positions" });
  const hist = createNavHistory({ history: b.history, addPopListener: b.addPopListener, get: () => nav, apply: (n) => { nav = n; } });
  // A forward entry from before the reload, with an id this stack has never seen.
  b.entries.push({ state: { osl: navOf({ view: "desk", tab: "journal" }), id: 5 } });
  b.userForward();
  assert.equal(nav.tab, "journal");
  nav = { ...nav, settings: true };
  assert.equal(hist.sync().type, "push");
});

test("WIRING — App.jsx makes its screens out of this module, and every view has a heading to focus", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.match(app, /createNavHistory\(\{/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  // Redesign PR 1: the market page's ticker and tab ride along (`mktTk`, `mktTab`).
  assert.match(app, /navOf\(\{ view, tab, step, showSettings, ev, whyTk, detailsId, deskSheet, posSeg,\s*mktTk: tab === "build" && step === "market" \? mkt\.tk : null, mktTab: mkt\.tab \}\)/);
  const headings = (app.match(/data-view-heading/g) || []).length;
  assert.ok(headings >= 6, `Find, Build, Positions, Watching, Journal and Settings each carry one (found ${headings})`);
  // Round 2: Home is gone (the app opens on Find); Find's own heading is in find.jsx's header.
  assert.doesNotMatch(readFileSync("src/wizard.jsx", "utf8"), /function WizardOpen/, "Home is no longer a screen");
  assert.match(readFileSync("src/steps.jsx", "utf8"), /<h2 data-view-heading tabIndex=\{-1\}/, "and every sheet");
  assert.match(app, /requestAnimationFrame\(\(\) => \{\s*const el = document\.querySelector\('\[role="dialog"\] \[data-view-heading\]'\)/,
    "focus goes to the sheet's heading when one is open, else the view's");
});

test("BUILD FROM A CARD: the back link is the first thing, and it returns to that card", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  const at = app.indexOf("← Back to the list");
  assert.ok(at > 0);
  assert.ok(app.lastIndexOf("{cardOrigin && (", at) > app.lastIndexOf("<div style={{ marginTop: 12 }}>", at) - 400, "it sits at the top of the Build block");
  // Redesign PR 1: the cards live on their market's page, so the link returns there, to that card.
  assert.match(app, /scrollToCard\.current = buildOrigin \? buildOrigin\.key : null; goMarket\(/);
  assert.match(app, /if \(\(step !== "find" && step !== "market"\) \|\| ev \|\| !scrollToCard\.current\) return;/, "the market page scrolls back to it");
  assert.match(readFileSync("src/market.jsx", "utf8"), /cardKey=\{x\.key\}/, "every market card carries its key");
  assert.match(readFileSync("src/card.jsx", "utf8"), /data-card-key=\{cardKey \|\| undefined\}/);
});

test("THE MARKET PAGE (redesign PR 1): Back goes Build → the market page, same ticker and tab → Find; a tab is a screen", () => {
  const a = app();
  a.go(navOf({ view: "desk", tab: "build", step: "find" }));
  a.go({ step: "market", mkt: "CORN", mtab: "strategies" });
  a.go({ mtab: "chain" });                      // a tab is a screen: it pushes
  a.go({ step: "build" });                      // Build ›, from the chain's tray
  assert.equal(a.nav.step, "build");
  a.back();
  assert.equal(a.nav.step, "market"); assert.equal(a.nav.mkt, "CORN"); assert.equal(a.nav.mtab, "chain");
  a.back();
  assert.equal(a.nav.step, "market"); assert.equal(a.nav.mtab, "strategies");
  a.back();
  assert.equal(a.nav.step, "find");
  // navOf carries them, and no market means no tab.
  assert.deepEqual([navOf({ mktTk: "GLD" }).mkt, navOf({ mktTk: "GLD" }).mtab], ["GLD", "strategies"]);
  assert.equal(navOf({}).mtab, null);
  // A chip's sheet on Find is a sheet: closing it from its own button is a back.
  const screen = navOf({ view: "desk", tab: "build", step: "find" });
  const open = navOf({ view: "desk", tab: "build", step: "find", deskSheet: "find:budget" });
  assert.equal(planNav([screen, open], 1, screen).type, "back");
});

test("THE APP OPENS ON FIND (round 2, owner 5 Oct 2026): Find is the first entry, and Back on Find leaves the app", () => {
  const b = fakeBrowser();
  let nav = navOf({});                           // the screen the app starts on
  assert.deepEqual([nav.view, nav.tab, nav.step], ["desk", "build", "find"]);
  const hist = createNavHistory({ history: b.history, addPopListener: b.addPopListener, get: () => nav, apply: (n) => { nav = { ...n }; } });
  const go = (patch) => { nav = { ...nav, ...patch }; return hist.sync(); };
  go({ step: "market", mkt: "CORN", mtab: "strategies" });
  go({ tab: "positions", step: "find", mkt: null, mtab: null });
  assert.equal(b.userBack(), true); hist.sync();
  assert.equal(nav.step, "market");
  assert.equal(b.userBack(), true); hist.sync();
  assert.deepEqual([nav.view, nav.tab, nav.step], ["desk", "build", "find"]);
  assert.equal(b.userBack(), false, "Back on Find leaves the app: nothing was pushed under it");
  // A chip's sheet on Find is still a sheet over it: Back closes it and stays on Find.
  go({ sheet: "find:budget" });
  assert.equal(b.userBack(), true); hist.sync();
  assert.equal(nav.sheet, null); assert.equal(nav.step, "find");
  assert.match(readFileSync("src/App.jsx", "utf8"), /const \[view, setView\] = useState\("desk"\);/, "App.jsx starts on the desk, on Find");
});

console.log(`\nnav: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
