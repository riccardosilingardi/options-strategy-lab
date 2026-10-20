// ============================================================================
// scripts/audit-computer.mjs — THE APP ON A COMPUTER, CHECKED (PR 73; owner 19 Oct 2026: "the app uses the screen", "no
// horizontal scrollbars on desktop").
//
//   node scripts/audit-computer.mjs [1280x800,1024x768,1440x900]
//
// The whole app on fixtures (scripts/app-harness.mjs, "+all+book"), in the pre-installed headless Chromium, at each size
// (the owner's 1280×800 first). For Find with a market open, its Chain tab with the tray, Build, Positions and a position
// beside the table it checks: nothing scrolls sideways — the page or any element inside it; Find's chips wrap; the tray
// sits inside the market's pane, not over the list; Build is two columns; Positions is a table. Exits 1 on any miss.
// PR 74: and Learn, the figure lab, with an iron condor loaded: two columns, the picture inside its column.
// ============================================================================
import { openHarness, tap } from "./app-harness.mjs";

const SIZES = (process.argv[2] || "1280x800,1024x768,1440x900").split(",").map((s) => s.split("x").map(Number));
const toMarket = async (p) => { await p.waitForTimeout(1500); await tap(p, "[data-row-button]", "UNG", 1500); };
const toChain = async (p) => { await toMarket(p); await tap(p, "[data-market] button", "Chain", 1200); };
const toBuild = async (p) => { await toMarket(p); await tap(p, "[data-market] button", "Build ›", 2200); };
const toPositions = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Positions", 2500); };
const toPosition = async (p) => { await toPositions(p); await tap(p, "[data-position-open]", null, 1500); };
const toLearn = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Learn", 2500); await tap(p, '[data-learn-figure="iron-condor"]', null, 800); };
const SCREENS = [
  ["find + market", toMarket, ["chipsWrap"]],
  ["chain + tray", toChain, ["chipsWrap", "trayInPane"]],
  ["build", toBuild, ["buildCols"]],
  ["positions", toPositions, ["table"]],
  ["position beside the table", toPosition, ["table", "screenBeside"]],
  ["learn", toLearn, ["learnCols", "chartInCol"]],
];

const h = await openHarness();
let misses = 0, checks = 0;
try {
  for (const [w, ht] of SIZES) {
    for (const [name, go, wants] of SCREENS) {
      const { page, ctx, errors } = await h.open("app+all+book", "dark", { width: w, height: ht, scale: 1 });
      try {
        await go(page);
        const r = await page.evaluate(() => {
          const sideways = document.documentElement.scrollWidth > window.innerWidth + 1;
          const inner = [];
          for (const el of document.querySelectorAll("body *")) {
            const ox = getComputedStyle(el).overflowX;
            if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) inner.push(el.tagName.toLowerCase() + [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join(""));
          }
          const chips = document.querySelector("[data-chip-row]");
          const tray = document.querySelector("[data-chain-tray]"), pane = document.querySelector("[data-pane=detail]");
          const tb = tray && tray.getBoundingClientRect(), pb = pane && pane.getBoundingClientRect();
          return { sideways, inner,
            chipsWrap: !!chips && getComputedStyle(chips).flexWrap === "wrap",
            trayInPane: !!(tb && pb && tb.left >= pb.left - 1 && tb.right <= pb.right + 1),
            buildCols: document.querySelector("[data-build-cols]")?.getAttribute("data-build-cols") === "2",
            table: !!document.querySelector("[data-positions-table]"),
            screenBeside: !!document.querySelector("[data-panes=positions] [data-position-screen]"),
            learnCols: document.querySelector("[data-learn-cols]")?.getAttribute("data-learn-cols") === "2",
            chartInCol: (() => {
              const c = document.querySelector("[data-figure-chart=lab]"), col = document.querySelector("[data-learn-col=lab]");
              const cb = c && c.getBoundingClientRect(), kb = col && col.getBoundingClientRect();
              return !!(cb && kb && cb.left >= kb.left - 1 && cb.right <= kb.right + 1 && document.querySelectorAll("[data-lab-point]").length === 4);
            })() };
        });
        const bad = [];
        if (r.sideways) bad.push("the page scrolls sideways");
        if (r.inner.length) bad.push(`scrolls sideways inside: ${r.inner.join(", ")}`);
        for (const k of wants) if (!r[k]) bad.push(`not ${k}`);
        if (errors.length) bad.push(`page errors: ${errors.join(" | ")}`);
        checks += 1 + wants.length;
        misses += bad.length;
        console.log(`${bad.length ? "✗" : "✓"} ${w}×${ht} ${name}${bad.length ? ` — ${bad.join("; ")}` : ""}`);
      } catch (e) { misses++; console.log(`✗ ${w}×${ht} ${name} — ${e.message}`); }
      await ctx.close();
    }
  }
} finally { await h.close(); }
console.log(`\n${checks} checks · ${misses} missed`);
if (misses) process.exit(1);
