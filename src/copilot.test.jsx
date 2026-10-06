// src/copilot.test.jsx — THE COPILOT, BY PLACE (redesign PR 3, TASK 0c; owner, 6 Oct 2026).
//
// "It depends where it is. In Find, a preset analyses the cards and, under the filters set, makes objective comparisons
// that highlight or suggest the best strategy. In Build it explains the strategy. In Positions it analyses the
// position, the exit strategy, where you started from." Every question in SKILLS (pro.jsx, the one home) names its
// place; a screen shows only its own place's questions; Build's and Positions' never propose, and Find's ranks only the
// cards the app built, naming the filters.
import { readFileSync } from "node:fs";
import { SKILLS, COPILOT_EXPLAIN_ONLY, BUILD_SKILL_IDS, POSITION_SKILL_IDS, skillsFor } from "./pro.jsx";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s, what = "") => { if (!String(h).includes(s)) throw new Error(`${what} missing ${JSON.stringify(s)}`); };
const hasNot = (h, s, what = "") => { if (String(h).includes(s)) throw new Error(`${what} should not contain ${JSON.stringify(s)}`); };
const byId = (id) => SKILLS.find((s) => s.id === id);

check("EVERY QUESTION NAMES ITS PLACE, and the places are the owner's three plus the old desk questions", () => {
  for (const s of SKILLS) if (!["find", "build", "positions", "desk"].includes(s.place)) throw new Error(`${s.id}: no place`);
  if (!BUILD_SKILL_IDS.every((id) => byId(id) && byId(id).place === "build")) throw new Error("Build's four are not Build's");
  if (!POSITION_SKILL_IDS.every((id) => byId(id) && byId(id).place === "positions")) throw new Error("the position's three are not Positions'");
});

check("IN BUILD IT EXPLAINS: every Build question opens with COPILOT_EXPLAIN_ONLY; Pre-trade analysis asks for no GO/NO-GO and no size of its own", () => {
  for (const s of skillsFor("build")) has(s.prompt, COPILOT_EXPLAIN_ONLY, s.id);
  const pre = byId("pretrade").prompt;
  has(pre, "Do not say GO or NO-GO"); has(pre, "do not suggest another size");
  hasNot(pre, "Finish with a GO/NO-GO checklist and a position size");
  // It reads the gate's checks and the app's size from the context, never its own.
  has(pre, "review checklist in the context"); has(pre, "the size the app sized");
});

check("IN POSITIONS IT REVIEWS THE POSITION: three questions, each about one position, its entry and its exit plan; none closes or rolls", () => {
  const three = POSITION_SKILL_IDS.map(byId);
  if (three.map((s) => s.label).join(" | ") !== "Review this position | The exit from here | Since I opened it") throw new Error("the three labels");
  for (const s of three) {
    has(s.prompt, COPILOT_EXPLAIN_ONLY, s.id);
    has(s.prompt, "position in the context", s.id);
    hasNot(s.prompt, "ROLL", s.id);
  }
  if (SKILLS.find((s) => s.id === "positions")) throw new Error("PR #38's HOLD / CLOSE / ROLL review is still offered");
});

check("IN FIND IT RANKS ONLY THE CARDS THE APP BUILT: the filters named, each card's figures cited, no new structure, no size past the gate, no send", () => {
  const r = byId("radar");
  if (r.place !== "find") throw new Error("the compare preset is not Find's");
  for (const w of ["ONLY the cards the app built", "Name the filters", "you risk, max profit, chance, return on risk, future avg and past yrs",
    "never propose a structure, a strike or an expiry that is not one of these cards", "per-trade limit", "never tell me to send an order"]) has(r.prompt, w, "radar");
  hasNot(r.prompt, "propose the 2 best opportunities");
});

check("A SCREEN SHOWS ITS OWN PLACE'S QUESTIONS: Build's More and the desk's CopilotTab never offer Find's or Positions'", () => {
  const build = readFileSync("src/build.jsx", "utf8"), pro = readFileSync("src/pro.jsx", "utf8");
  has(build, `(s.place === "build" || s.place === "desk")`, "build.jsx's More");
  has(pro, `skills = SKILLS.filter((s) => s.place === "build" || s.place === "desk")`, "CopilotTab's default");
  for (const p of ["build", "positions", "find"]) for (const s of skillsFor(p)) if (s.place !== p) throw new Error(`${s.id} leaked into ${p}`);
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
