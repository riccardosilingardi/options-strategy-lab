// ============================================================================
// scripts/audit-map.mjs — WHICH BOARD ELEMENT IS WHICH APP ELEMENT, PER SCREEN (redesign PR 3, TASK 0a).
//
// Read by scripts/audit-screen.mjs. One entry per board (docs/mockups/src/<Board>.dc.html):
//   mode   the fixture hash scripts/app-screens.jsx opens ("app+all", "loading", …)
//   go     how to reach the screen from there (taps through the real app)
//   root   the app element whose text the board's words are looked for in (default #root)
//   bWords the board element whose words are looked for (default the whole board) — a state board drawn over another
//          page (the Find states sit on version A's page, which was not chosen) checks only its own region
//   pairs  { n: name, b: board selector (inside the mounted board), a: app selector, p?: props, why?: { prop: rule } }
//          A selector may end "::text=<start>" to pick an element by the text it starts with.
//   skipWords [regex, reason]: board phrases not looked for, each with the rule that wins over the drawing.
//
// ADDING A SCREEN: write its board's entry here (dump both trees with `node scripts/dump-tree.mjs board <Board>` and
// `node scripts/dump-tree.mjs app <mode> tap:…` to pair them), give the app's element a `data-*` attribute when no
// stable selector exists, run `node scripts/audit-screen.mjs <Board>`, and fix every ✗ the README does not explain.
// A "why" names the rule from docs/mockups/README.md or CLAUDE.md, never a taste.
// ============================================================================
import { tap, toBuild } from "./app-harness.mjs";

/** The README's rules, one sentence each, so every explained ✗ cites the same words. */
export const TAP_RULE = "touch targets are at least 44px (TAP); the board draws some at 40 (README)";
export const R = {
  sample: "a sample figure or name from the board: every figure and market comes from its function and the fixture (README)",
  loss: "a loss is violet: red is for errors and refusals only (CLAUDE.md)",
  down: "a down reading is violet: red is for errors only, and the board draws only the up case (CLAUDE.md)",
  times: "times are printed in the user's own time, with ET behind an ⓘ (README)",
  ivrank: "IV rank reads 'collecting N of 20 days' until 20 days of history exist (README)",
  entry: "the entry floor is RULES.minEntryDTE (30 days), not the 21-day exit (README)",
  tenYear: "the app reads Alpha Vantage's whole history since PR #49, not ten years (README)",
  kept: "no function is dropped: the app's own control stays where the board has none (README)",
  data: "the fixture decides which state shows (one feed, UNG's contracts under every ticker); the board's sample state differs",
  monoNum: "mono only for numbers, tickers, legs and OCC symbols (CLAUDE.md); the board sets a word in mono",
  labels: "the card's names live in rules.js (CARD_LABELS, the owner's, 3 Oct 2026); the board abbreviates",
  versionA: "the board's page under the state is version A (Main), which was not chosen; only the state is compared",
  cancel: "Cancel is the red outline (CLAUDE.md, PR #47); the board draws it in ink",
  layout: "the same space is carried by the page's own padding (FIND_LIST_END), not this element",
};

const waitRows = (page) => page.waitForFunction(() => document.querySelectorAll("[data-row]").length >= 2, null, { timeout: 20000 });
const toUng = async (page, tab = null) => {
  await waitRows(page);
  await page.waitForTimeout(600);
  await tap(page, "[data-row-button]", "UNG", 1500);
  if (tab) await tap(page, "[data-market] [role=group] button", tab, 1500);
};

// ---- shared pieces (the same element on several boards)
const FIND_HEADER = [
  { n: "Header row", b: "header", a: "[data-find-header] > div:nth-child(1)", p: ["padding", "gap"] },
  { n: "Title", b: "header h1", a: "[data-find-header] h1" },
  { n: "Results | Saved bar", b: "[aria-label^='Find: results']", a: "[data-find-header] [aria-label^='Find: results']" },
  { n: "Segment on", b: "[aria-label^='Find: results'] a.seg.on", a: "[data-find-header] [aria-label^='Find: results'] button[aria-pressed=true]" },
  { n: "Segment off", b: "[aria-label^='Find: results'] a.seg:not(.on)", a: "[data-find-header] [aria-label^='Find: results'] button[aria-pressed=false]" },
];
const STATUS = { n: "Status line", b: "div.sans > p", a: "[data-find-status]" };
const BOTTOM_BAR = [
  { n: "Bottom bar", b: "nav[aria-label=Places]", a: "[data-bottom-bar] > div", p: ["bg", "border", "radius", "padding", "gap"] },
  { n: "Bottom bar · place on", b: "nav[aria-label=Places] a.place.on", a: "[data-bottom-bar] button[aria-current=page]", p: ["size", "weight", "color", "bg", "radius", "minh"] },
];
const SHEET = [
  { n: "Sheet scrim", b: ":scope > div > div > div:nth-child(2)", a: "[data-scrim]", p: ["bg"] },
  { n: "Sheet", b: ":scope > div > div > section", a: "[role=dialog][aria-modal=true]", p: ["bg", "border", "radius", "padding"] },
  { n: "Sheet handle", b: ":scope > div > div > section > span:first-child", a: "[role=dialog][aria-modal=true] > div:first-child", p: ["bg", "radius"] },
  { n: "Sheet title", b: ":scope > div > div > section h2", a: "[role=dialog][aria-modal=true] h2" },
];
const MARKET_HEADER = [
  { n: "Header row", b: "header", a: "[data-market-header] > div:nth-child(2)", p: ["padding", "gap"] },
  { n: "Ticker", b: "header span.mono", a: "[data-market-header] > div:nth-child(2) button:nth-child(2) span.mono, [data-market-header] [data-market-ticker]" },
  { n: "Name · category", b: "header a > span:nth-child(2) > span:nth-child(2)", a: "[data-market-header] > div:nth-child(2) button:nth-child(2) > span:nth-child(2) > span:nth-child(2)" },
  { n: "Price", b: "section div.mono", a: "[data-market-header] > div:nth-child(3) > div:nth-child(1) > div:nth-child(1)" },
  { n: "Day change", b: "section div.mono:nth-child(2)", a: "[data-market-header] > div:nth-child(3) > div:nth-child(1) > div:nth-child(2)" },
  { n: "Figures (IV, IV rank, move)", b: "section dl", a: "[data-market-header] > div:nth-child(3) > div:nth-child(2)", p: ["gap"] },
  { n: "Figure label", b: "section dl dt", a: "[data-market-header] > div:nth-child(3) > div:nth-child(2) > :nth-child(1)" },
  { n: "Figure value", b: "section dl dd", a: "[data-market-header] > div:nth-child(3) > div:nth-child(2) > :nth-child(2)" },
  { n: "Event box", b: "div.sans > div:nth-child(3)", a: "[data-event-line]", p: ["bg", "border", "radius", "padding", "gap"] },
  { n: "Event name", b: "div.sans > div:nth-child(3) b", a: "[data-event-line] b" },
  { n: "Tabs", b: "nav[aria-label='Market sections']", a: "[data-market] > div:nth-child(2)", p: ["border", "padding", "gap"] },
  { n: "Tab on", b: "nav[aria-label='Market sections'] a.tab.on", a: "[data-market] > div:nth-child(2) button[aria-pressed=true]" },
  { n: "Tab off", b: "nav[aria-label='Market sections'] a.tab:not(.on)", a: "[data-market] > div:nth-child(2) button[aria-pressed=false]" },
];
const BUILD_HEADER = [
  { n: "Header row", b: "header", a: "[data-build-header]", p: ["padding"],
    why: { padding: "left: the three states draw Build's own header row (6px 8px 0 4px, the board 'Build'); their boards draw 12px on the right" } },
  { n: "Paper pill", b: "header > span", a: "[data-build-header] > span" },
  { n: "Title", b: "main h1", a: "[data-build] main h2, [data-build-state] h2" },
  { n: "Title sub", b: "main h1 + p", a: "[data-build] main h2 + div, [data-build-state] h2 + div" },
];
const MARKET_WORDS_SKIP = [
  [/^(CORN|Corn · Grains|WASDE|crop report)/, R.sample],
  [/^Close ·/, R.times],
  [/^IV rank$/, R.ivrank],
];

export const SCREENS = {
  // ======================================== FIND (redesign PR 1) ========================================
  FindB: {
    mode: "app+all", go: async (page) => { await waitRows(page); await page.waitForTimeout(800); },
    pairs: [
      ...FIND_HEADER, STATUS,
      { n: "Category tabs", b: "nav[aria-label=Categories]", a: "[data-find] [aria-label=Categories]" },
      { n: "Tab on", b: "button.tab.on", a: "[data-find] [aria-label=Categories] button[aria-pressed=true]" },
      { n: "Tab off", b: "button.tab:not(.on)", a: "[data-find] [aria-label=Categories] button[aria-pressed=false]" },
      { n: "Tab count", b: "button.tab:not(.on) span.mono", a: "[data-find] [aria-label=Categories] button[aria-pressed=false] span" },
      { n: "Chip row", b: "[aria-label='Sort and filter']", a: "[data-chip-row]" },
      { n: "Order chip", b: "button.fchip.sort", a: "[data-chip-row] button:nth-child(1)" },
      { n: "Chip (default)", b: "button.fchip:nth-child(2)", a: "[data-chip-row] button:nth-child(2)" },
      { n: "Chip label", b: "button.fchip:nth-child(2) span.k", a: "[data-chip-row] button:nth-child(2) span:nth-child(1)" },
      { n: "Chip value", b: "button.fchip:nth-child(2) span.mono", a: "[data-chip-row] button:nth-child(2) span:nth-child(2)" },
      { n: "Summary line", b: "div.sans > div:nth-child(6)", a: "[data-find-summary]", p: ["padding", "gap", "minh"] },
      { n: "Summary text", b: "div.sans > div:nth-child(6) > span:first-child", a: "[data-find-summary] > span:first-child" },
      { n: "Column head", b: "div.sans > div:nth-child(7)", a: "[data-find-colhead]" },
      { n: "Row", b: "li.row:not(.miss)", a: "[data-row]:not([data-miss])" },
      { n: "Row button", b: "li.row:not(.miss) a", a: "[data-row]:not([data-miss]) [data-row-button]" },
      { n: "Row ticker", b: "li.row:not(.miss) span.tk", a: "[data-row]:not([data-miss]) [data-row-ticker]" },
      { n: "Row direction", b: "li.row:not(.miss) span.dir", a: "[data-row]:not([data-miss]) [data-row-dir]", why: { color: R.down } },
      { n: "Row subtitle", b: "li.row:not(.miss) a > span > span:nth-child(2)", a: "[data-row]:not([data-miss]) [data-row-sub]" },
      { n: "Row figure", b: "li.row:not(.miss) span.fig", a: "[data-row]:not([data-miss]) [data-row-figure]" },
      { n: "Row risk", b: "li.row:not(.miss) span.fig + span", a: "[data-row]:not([data-miss]) [data-row-figure] + span" },
      ...BOTTOM_BAR,
    ],
    skipWords: [[/^(Hide them|≈ Neutral|▲ Bull)$/, R.data], [/^Close ·/, R.times]],
  },
  FindLoading: {
    mode: "app+all+reading", go: async (page) => { await page.waitForTimeout(2000); },
    bWords: "div.sans > div:nth-child(2)",
    pairs: [
      { n: "Reading line", b: "div.sans > div:nth-child(2)", a: "[data-find-reading]", p: ["padding", "gap"] },
      { n: "Reading text", b: "div.sans > div:nth-child(2) > span:first-child", a: "[data-find-reading] > span:first-child" },
      { n: "Reading bar", b: "div.sans > div:nth-child(2) > span:nth-child(2)", a: "[data-find-reading] > span:nth-child(2)", p: ["bg", "radius"] },
      { n: "Reading bar fill", b: "div.sans > div:nth-child(2) > span:nth-child(2) > span", a: "[data-find-reading] > span:nth-child(2) > span", p: ["bg"] },
    ],
    skipWords: [],
  },
  FindStale: {
    mode: "app+all+stale", go: async (page) => { await page.waitForTimeout(2500); },
    bWords: "div.sans > div:nth-child(3)",
    pairs: [
      { n: "Stale status line", b: "div.sans > p", a: "[data-find-status]" },
      { n: "Stale dot", b: "div.sans > p > span:first-child", a: "[data-find-status] > span:first-child", p: ["bg", "radius"] },
      { n: "Stale banner", b: "div.sans > div:nth-child(3)", a: "[data-stale]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Stale text", b: "div.sans > div:nth-child(3) > span:nth-child(2)", a: "[data-stale] > span" },
      { n: "Retry", b: "div.sans > div:nth-child(3) button", a: "[data-stale] button" },
    ],
    skipWords: [[/The feed didn't answer/, R.times]],
  },
  FindEmpty: {
    mode: "app+all+poor", go: async (page) => { await page.waitForTimeout(2500); },
    bWords: "div.sans > div:nth-child(6)",
    pairs: [
      { n: "Nothing fits block", b: "div.sans > div:nth-child(6)", a: "[data-nothing-fits]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Nothing fits title", b: "div.sans > div:nth-child(6) > p:nth-child(2)", a: "[data-nothing-fits] > :nth-child(1)" },
      { n: "Nothing fits text", b: "div.sans > div:nth-child(6) > p:nth-child(3)", a: "[data-nothing-fits] > :nth-child(2)" },
      { n: "Fix (primary)", b: "div.sans > div:nth-child(6) button:nth-child(1)", a: "[data-nothing-fits] button:nth-child(1)" },
      { n: "Second action", b: "div.sans > div:nth-child(6) button:nth-child(2)", a: "[data-nothing-fits] button:nth-child(2)",
        whyMissing: "left: shown only while misses are hidden ('Hide them'), which the board's state has and the fixture's has not" },
    ],
    skipWords: [],
  },
  FindSaved: {
    mode: "app+all", go: async (page) => {
      await waitRows(page); await page.waitForTimeout(600);
      await page.evaluate(() => { const b = document.querySelectorAll("[data-row] button[aria-label^='Save']"); b[0].click(); b[1].click(); });
      await page.waitForTimeout(500);
      await tap(page, "[data-find-header] [aria-label^='Find: results'] button", "Saved", 1200);
    },
    pairs: [
      ...FIND_HEADER,
      { n: "Saved list", b: "ul", a: "[data-saved] [role=list]", p: ["padding", "gap"], why: { padding: R.layout } },
      { n: "Saved card", b: "ul > li:first-child", a: "[data-saved-row]" },
      { n: "Saved ticker", b: "ul > li:first-child span.mono", a: "[data-saved-row] [data-saved-ticker]" },
      { n: "Saved name", b: "ul > li:first-child > div:first-child > span:first-child > span:nth-child(2)", a: "[data-saved-row] [data-saved-name]" },
      { n: "Saved when", b: "ul > li:first-child > div:first-child > span:nth-child(2)", a: "[data-saved-row] [data-saved-when]" },
      { n: "When saved / Now grid", b: "ul > li:first-child > div:nth-child(2)", a: "[data-saved-row] [data-saved-grid]", p: ["gap"] },
      { n: "Grid head", b: "ul > li:first-child > div:nth-child(2) > span:nth-child(2)", a: "[data-saved-row] [data-saved-grid] > :nth-child(2)" },
      { n: "Grid label", b: "ul > li:first-child > div:nth-child(2) > span:nth-child(4)", a: "[data-saved-row] [data-saved-grid] > :nth-child(4)" },
      { n: "Grid then", b: "ul > li:first-child > div:nth-child(2) > span:nth-child(5)", a: "[data-saved-row] [data-saved-grid] > :nth-child(5)" },
      { n: "Remove", b: "ul > li:first-child button.ghost", a: "[data-saved-row] button::text=Remove" },
      { n: "Build ›", b: "ul > li:first-child a.amberA", a: "[data-saved-row] button::text=Build", p: ["size", "weight", "color", "bg", "border", "radius", "minh"] },
    ],
    skipWords: [[/^(SOYB|GLD|· Iron condor|· Bull put spread)/, R.sample], [/^saved /, R.sample],
      [/^Priced again at every read/, "the board's 'Now is Friday's close' is a sample day; the app says what Now is: the last price read"]],
  },
  FindFilters: {
    mode: "app+all", go: async (page) => { await waitRows(page); await tap(page, "[data-chip-row] button", "Budget", 900); },
    bWords: ":scope > div > div > section > div:last-child",
    pairs: [
      ...SHEET,
      { n: "Sheet secondary (Reset)", b: ":scope > div > div > section button.ghost", a: "[role=dialog] [data-sheet-footer] button:nth-child(1)" },
      { n: "Sheet primary (Show N)", b: ":scope > div > div > section a.amberA", a: "[role=dialog] [data-sheet-footer] button:last-child", p: ["size", "weight", "color", "bg", "border", "radius", "minh"] },
    ],
    skipWords: [[/^Show /, R.data]],
  },
  Define: {
    mode: "app+all", go: async (page) => { await waitRows(page); await tap(page, "[data-find-colhead] button", null, 900); },
    bWords: ":scope > div > div > section h2",
    pairs: [
      ...SHEET,
      { n: "Sheet sub", b: ":scope > div > div > section p.mono", a: "[role=dialog] [data-sheet-sub]" },
      { n: "Step row", b: ":scope > div > div > section ol > li", a: "[role=dialog] ol > li" },
      { n: "Step number", b: ":scope > div > div > section ol > li > span.mono", a: "[role=dialog] ol > li > span:first-child" },
      { n: "Step name", b: ":scope > div > div > section ol > li > div > div > span:first-child", a: "[role=dialog] ol > li [data-step-name]" },
      { n: "Step value", b: ":scope > div > div > section ol > li > div > div > span.mono", a: "[role=dialog] ol > li [data-step-value]" },
      { n: "Step sentence", b: ":scope > div > div > section ol > li > div > p", a: "[role=dialog] ol > li [data-step-text]" },
    ],
    skipWords: [[/^How CORN/, R.sample]],
  },

  // ======================================== THE MARKET PAGE (redesign PR 1) ========================================
  MarketStrategies: {
    mode: "app+all", go: (page) => toUng(page),
    pairs: [
      ...MARKET_HEADER,
      { n: "Body", b: "main", a: "[data-market-body]", p: ["padding", "gap"] },
      { n: "Signals line", b: "main > p:first-child", a: "[data-market-body] [data-signals-line] > :first-child" },
      { n: "Order line", b: "main > p:first-child > span:nth-of-type(2)", a: "[data-market-body] [data-signals-line] > :nth-child(2)" },
      { n: "Group head", b: "main h2.grp", a: "[data-market-body] section > div:first-child" },
      { n: "Card", b: "article.card", a: "article[data-compact]" },
      { n: "Card name", b: "article.card > div:first-child > div > div:first-child", a: "article[data-compact] > div:first-child > div > div:first-child" },
      { n: "Card legs", b: "article.card > div:first-child > div > div.mono", a: "article[data-compact] > div:first-child > div > div:nth-child(2)" },
      { n: "Figures", b: "article.card dl", a: "article[data-compact] [data-compact-figures]", p: ["gap"] },
      { n: "Figure label", b: "article.card dl dt", a: "article[data-compact] [data-tile] button > span" },
      { n: "Figure value", b: "article.card dl dd", a: "article[data-compact] [data-tile] > div" },
      { n: "Needs / stance line", b: "article.card > p:nth-child(3)", a: "article[data-compact] [data-needs]" },
      { n: "Future · Past line", b: "article.card > p.mono", a: "article[data-compact] [data-future-past]",
        why: { gap: "left: the app lays the line out as two pieces that wrap between the figures, never inside one (round 2)" } },
      { n: "Actions", b: "article.card > div:nth-child(5)", a: "article[data-compact] [data-card-actions]", p: ["gap"] },
      { n: "Open in chain", b: "article.card a.ghostA", a: "article[data-compact] [data-card-actions] button::text=Open in chain" },
      { n: "Build ›", b: "article.card a.amberA", a: "article[data-compact] [data-card-actions] button::text=Build" },
    ],
    skipWords: [...MARKET_WORDS_SKIP, [/^(▲ Bull|▲ BULL · WHAT THE SIGNALS SUGGEST|Bull (put|call) spread)/, R.data],
      [/^Future and past disagree: the past ten years/, R.tenYear],
      [/^You risk$|^Max profit$|^Return$/, R.labels], [/^▲ Needs CORN/, R.sample], [/^The signals say/, R.data]],
  },
  MarketOverview: {
    mode: "app+all", go: (page) => toUng(page, "Overview"),
    pairs: [
      ...MARKET_HEADER,
      { n: "Body", b: "main", a: "[data-market-body]", p: ["padding", "gap"] },
      { n: "Indicator chips", b: "main > div[aria-label=Indicators]", a: "[data-market-body] [data-indicators]", p: ["gap"],
        whyMissing: "left: the chart's switches are PriceChart's own (eight indicators, each chip in its line's colour as the legend, and the 3M · 6M · 1Y range), shared with Build's More; the board draws four ink chips and a separate legend" },
      { n: "Chart panel", b: "section[aria-label='Price chart']", a: "[data-market-body] [data-chart-panel]", p: ["bg", "border", "radius", "padding"] },
      { n: "Chart readout", b: "section[aria-label='Price chart'] p.mono", a: "[data-market-body] [data-chart-readout]" },
      { n: "Read panel", b: "main > section:nth-of-type(2)", a: "[data-market-body] [data-market-read]", p: ["bg", "border", "radius", "padding"] },
      { n: "Read title", b: "main > section:nth-of-type(2) h2", a: "[data-market-body] [data-market-read] h2" },
      { n: "Read verdict", b: "main > section:nth-of-type(2) > p:nth-child(2)", a: "[data-market-body] [data-market-read] [data-read-verdict]" },
      { n: "Factor row", b: "main > section:nth-of-type(2) > div:nth-of-type(2)", a: "[data-market-read] [data-factor]", p: ["border"] },
      { n: "Factor row inside", b: "main > section:nth-of-type(2) button.fac", a: "[data-market-read] [data-factor]", p: ["padding", "gap"] },
      { n: "Factor name", b: "main > section:nth-of-type(2) button.fac > span:first-child > span:first-child", a: "[data-market-read] [data-factor] > span:first-child > span:first-child" },
      { n: "Factor weight", b: "main > section:nth-of-type(2) button.fac > span:first-child > span:first-child > span.mono", a: "[data-market-read] [data-factor] > span:first-child > span:first-child > span" },
      { n: "Factor value", b: "main > section:nth-of-type(2) button.fac > span:first-child > span.mono:last-child", a: "[data-market-read] [data-factor] > span:first-child > span:last-child" },
      { n: "Factor sentence", b: "main > section:nth-of-type(2) button.fac > span:last-child", a: "[data-market-read] [data-factor] > span:last-child" },
      { n: "Chart copilot panel", b: "main > section:nth-of-type(3)", a: "[data-market-body] [data-chart-copilot]", p: ["bg", "border", "radius", "padding"] },
      { n: "Chart copilot title", b: "main > section:nth-of-type(3) h2", a: "[data-market-body] [data-chart-copilot] h2" },
      { n: "Chart question", b: "main > section:nth-of-type(3) button.q", a: "[data-market-body] [data-chart-copilot] [data-q]" },
    ],
    skipWords: [...MARKET_WORDS_SKIP, [/^(SMA 20 · 50|Bollinger|RSI|MACD|RSI 14|price|20-day|50-day)$/, R.kept],
[/^▲ Bull · /, R.data], [/^(Oct–Nov|20-day average|Dry planting|6 headlines)/, R.sample],
      [/^This is the market, whatever you trade/, R.kept]],
  },
  Market: {
    mode: "app+all", go: async (page) => {
      await toUng(page, "Chain");
      // Two legs on the tray, so its look can be read: buy the first ask below the spot, sell the next bid above it.
      await page.evaluate(() => {
        const btn = (re) => Array.from(document.querySelectorAll("[data-market] button[aria-label]")).filter((b) => re.test(b.getAttribute("aria-label")));
        const buys = btn(/^Buy .* put/), sells = btn(/^Sell .* put/);
        if (buys[1]) buys[1].click();
        if (sells[2]) sells[2].click();
      });
      await page.waitForTimeout(900);
    },
    pairs: [
      ...MARKET_HEADER,
      { n: "Expiry chips", b: "div[aria-label=Expiry]", a: "[data-market] [aria-label=Expiries]", p: ["padding", "gap"] },
      { n: "Expiry chip on", b: "button.exp.on", a: "[data-market] [aria-label=Expiries] button[aria-pressed=true]", p: ["bg", "border", "radius", "padding", "minh"] },
      { n: "Expiry under the floor", b: "button.exp.short", a: "[data-market] [aria-label=Expiries] button[data-short]", p: ["border", "radius", "padding", "minh"] },
      { n: "Modes bar", b: "div[aria-label=Columns]", a: "[data-market] [aria-label='What the chain shows']" },
      { n: "Mode on", b: "div[aria-label=Columns] button.seg.on", a: "[data-market] [aria-label='What the chain shows'] button[aria-pressed=true]" },
      { n: "Hint", b: "div.sans > div:nth-child(5) > p", a: "[data-chain-hint]" },
      { n: "Strike cell", b: "div.sans > div:nth-child(5) > div:nth-child(6) > div:nth-child(3)", a: "[data-chain-strike]", p: ["bg", "border"] },
      { n: "Price cell", b: "button.mono.cell:not(.itm):not(.buy):not(.sell):not(.thin)", a: "[data-chain-cell]:not([data-itm])", p: ["size", "family", "bg", "radius", "minh"] },
      { n: "In the money cell", b: "button.mono.cell.itm:not(.thin)", a: "[data-chain-cell][data-itm]", p: ["bg", "radius"] },
      { n: "Bought cell", b: "button.mono.cell.buy", a: "[data-chain-cell][data-picked=buy]", p: ["size", "weight", "color", "bg", "radius"] },
      { n: "Sold cell", b: "button.mono.cell.sell", a: "[data-chain-cell][data-picked=sell]", p: ["size", "weight", "border", "radius"] },
      { n: "Spot line pill", b: "div.sans > div:nth-child(5) > div:nth-child(8) > span.mono", a: "[data-spot] span:nth-child(2)", p: ["size", "weight", "color", "bg", "radius", "padding"] },
      { n: "Tray", b: "section[aria-label='Strategy tray']", a: "[data-chain-tray] > div", p: ["bg", "border", "padding", "gap"] },
      { n: "Tray name", b: "section[aria-label='Strategy tray'] > div:first-child > span:first-child", a: "[data-chain-tray] [data-tray-name]" },
      { n: "Tray leg chip", b: "section[aria-label='Strategy tray'] span.legchip", a: "[data-chain-tray] [data-tray-leg]" },
      { n: "Tray figure label", b: "section[aria-label='Strategy tray'] dl dt", a: "[data-chain-tray] dl dt" },
      { n: "Tray figure value", b: "section[aria-label='Strategy tray'] dl dd", a: "[data-chain-tray] dl dd" },
      { n: "Tray Clear", b: "section[aria-label='Strategy tray'] div:last-child > button", a: "[data-chain-tray] button::text=Clear" },
    ],
    skipWords: [...MARKET_WORDS_SKIP, [/^(thin|Calls|Puts|Bid|Ask)$/, R.data], [/^Bull put spread$/, R.data], [/^Credit$/, R.data],
      [/^Tap a bid to sell/, R.kept], [/^Strike$/, R.data]],
  },

  // ======================================== BUILD (redesign PR 2) ========================================
  Build: {
    mode: "app+all", go: (page) => toBuild(page),
    pairs: [
      ...BUILD_HEADER,
      { n: "Main", b: "main", a: "[data-build] main", p: ["padding", "gap"] },
      { n: "Section", b: "main section[aria-label='The numbers']", a: "[data-build] section[aria-label='The numbers']", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Takeaway", b: "main section[aria-label='What this trade does'] > p", a: "[data-takeaway]" },
      { n: "How to read", b: "main section[aria-label='What this trade does'] > button", a: "[data-build] button::text=How to read" },
      { n: "Figure label", b: "section[aria-label='The numbers'] dl dt", a: "[data-build] section[aria-label='The numbers'] > div:nth-of-type(2) button" },
      { n: "Figure value", b: "section[aria-label='The numbers'] dl dd", a: "[data-build] section[aria-label='The numbers'] > div:nth-of-type(2) > div > div" },
      { n: "FUTURE box", b: "section[aria-label='The numbers'] > div > div:first-child", a: "[data-build] section[aria-label='The numbers'] > div:nth-of-type(3) > div:first-child", p: ["border", "radius", "padding", "gap"] },
      { n: "Box title", b: "section[aria-label='The numbers'] > div > div:first-child > div:first-child", a: "[data-build] section[aria-label='The numbers'] > div:nth-of-type(3) > div:first-child > div:first-child" },
      { n: "Why this trade", b: "section[aria-label='Why this trade']", a: "[data-why-trade]", p: ["bg", "border", "radius", "padding"] },
      { n: "Why title", b: "section[aria-label='Why this trade'] button > span > span:first-child", a: "[data-why-trade] button > span:first-child" },
      { n: "Copilot section", b: "main > section:nth-of-type(4)", a: "[data-build-copilot]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Copilot title", b: "main > section:nth-of-type(4) h2", a: "[data-build-copilot] h2" },
      { n: "Copilot main question", b: "button.cq.main", a: "[data-build-copilot] button[data-q=main]" },
      { n: "Copilot question", b: "button.cq:not(.main)", a: "[data-build-copilot] button[data-q=other]" },
      { n: "Copilot input", b: "main > section:nth-of-type(4) input", a: "[data-build-copilot] input", p: ["size", "bg", "border", "radius", "padding", "minh"] },
      { n: "Copilot footer", b: "main > section:nth-of-type(4) > p", a: "[data-build-copilot] [data-copilot-footer]" },
      { n: "Legs section", b: "main > section:nth-of-type(5)", a: "[data-build-legs]", p: ["padding"] },
      { n: "Legs title", b: "main > section:nth-of-type(5) h2", a: "[data-build-legs] h2" },
      { n: "Edit in chain", b: "main > section:nth-of-type(5) a", a: "[data-build-legs] button::text=Edit in chain" },
      { n: "Leg row", b: "main > section:nth-of-type(5) li", a: "[data-leg-row]", p: ["border", "minh", "gap"] },
      { n: "Leg name", b: "main > section:nth-of-type(5) li span.mono", a: "[data-leg-row] span[data-leg-name]" },
      { n: "Order title", b: "main > section:nth-of-type(6) h2", a: "[data-build-order] h2" },
    ],
    skipWords: [[/^(CORN|Bull put spread|Legs · 20 Nov|Keeps up to|defaults · not backtested on CORN)/, R.sample], [/^(SELL|BUY)$/, R.data],
      [/^At mid, halfway between the two quotes\.$/, "where the limit sits is read off the fixture's book; the board's limit is at its mid, the fixture's is not"],
      [/^BE /, R.sample], [/Needs CORN/, R.sample]],
  },
  BuildReview: {
    mode: "app+all", go: async (page) => { await toBuild(page); await tap(page, "[data-build-send] button", "Send", 900); },
    bWords: ":scope > div > div > section",
    pairs: [
      ...SHEET,
      { n: "Review sub", b: ":scope > div > div > section h2 + p", a: "[data-review] [data-review-sub], [role=dialog] [data-sheet-sub]" },
      { n: "Order box", b: ":scope > div > div > section > div:nth-child(3)", a: "[data-review] [data-review-order]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Leg OCC", b: ":scope > div > div > section > div:nth-child(3) span.mono", a: "[data-review] [data-review-order] [data-occ]" },
      { n: "Limit line", b: ":scope > div > div > section > div:nth-child(3) > div.mono", a: "[data-review] [data-review-order] [data-review-limit]" },
      { n: "Check row", b: "div.chk", a: "[data-review-checks] > div", p: ["padding", "gap"] },
      { n: "Check mark", b: "div.chk span.ok", a: "[data-review-checks] > div > span:first-child" },
    ],
    skipWords: [[/^(1 × 1[78] put|CORN)/, R.sample], [/^Outside the 21-day exit$/, R.entry], [/^Open interest above/, R.data]],
  },
  BuildLoading: {
    mode: "loading", go: async (page) => { await tap(page, "nav button", "Build", 1200); await tap(page, "button", "Retry", 900); },
    pairs: [
      ...BUILD_HEADER,
      { n: "Reading panel", b: "main > section:nth-of-type(1)", a: "[data-build-state=loading] section:nth-of-type(1)", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Reading line", b: "main > section:nth-of-type(1) > p", a: "[data-build-state=loading] section:nth-of-type(1) > p" },
      { n: "Chart frame", b: "main > section:nth-of-type(1) > div", a: "[data-build-state=loading] section:nth-of-type(1) > div", p: ["size", "color", "border", "radius"] },
      { n: "Dash", b: "main dd", a: "[data-build-state=loading] dd" },
      { n: "Dash note", b: "main > section:nth-of-type(2) > p", a: "[data-build-state=loading] section:nth-of-type(2) > p" },
    ],
    stateHeader: true,
    skipWords: [[/^(CORN|Bull put spread|Reading CORN)/, R.sample]],
  },
  BuildNoData: {
    mode: "noquotes", go: async (page) => { await tap(page, "nav button", "Build", 2500); },
    pairs: [
      ...BUILD_HEADER,
      { n: "No quotes panel", b: "main > section:nth-of-type(1)", a: "[data-build-state=no-quotes] section:nth-of-type(1)", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "No quotes title", b: "main > section:nth-of-type(1) > p:first-child", a: "[data-build-state=no-quotes] section:nth-of-type(1) > p:first-child" },
      { n: "Retry", b: "main > section:nth-of-type(1) button", a: "[data-build-state=no-quotes] button::text=Retry" },
      { n: "Legs title", b: "main > section:nth-of-type(2) > div:first-child", a: "[data-build-state=no-quotes] section:nth-of-type(2) > div:first-child",
        whyMissing: "left: the fixture's market never answered and no trade was loaded on Build, so there are no legs to list (the board has two)" },
      { n: "Last read", b: "main > p", a: "[data-build-state=no-quotes] [data-last-read]" },
    ],
    skipWords: [[/^(CORN|Bull put spread|No quotes for these two legs|Alpaca returned no bid|Legs · 20 Nov|SELL 1|BUY 1)/, R.sample], [/^Last read/, R.sample],
      [/^bid — \/ ask —$/, "printed on each leg; the fixture's no-quotes state has no legs loaded"]],
  },
  BuildEmpty: {
    mode: "empty", go: async (page) => { await tap(page, "nav button", "Build", 1500); },
    pairs: [
      { n: "Header", b: "header", a: "[data-build-state=empty] header", p: ["padding"] },
      { n: "Title", b: "header h1", a: "[data-build-state=empty] header h1, [data-build-state=empty] h2" },
      { n: "Main", b: "main", a: "[data-build-state=empty] main", p: ["padding", "gap"] },
      { n: "Empty line", b: "main > p:nth-child(2)", a: "[data-build-state=empty] main > p:first-of-type" },
      { n: "Go to Find", b: "main a:first-child", a: "[data-build-state=empty] button::text=Go to Find", p: ["size", "weight", "color", "bg", "border", "radius", "minh"] },
      { n: "Open a chain", b: "main a:nth-child(2)", a: "[data-build-state=empty] button::text=Open a chain", p: ["size", "weight", "color", "bg", "border", "radius", "minh"] },
    ],
    skipWords: [],
  },
  // ======================================== POSITIONS (redesign PR 3) ========================================
  Positions: {
    mode: "app+all+book", go: async (page) => { await page.waitForTimeout(1500); await tap(page, "nav button", "Positions", 2500); },
    pairs: [
      { n: "Header row", b: "header", a: "[data-positions-header]", p: ["padding", "gap"] },
      { n: "Title", b: "header h1", a: "[data-positions-header] h1" },
      { n: "Header icon", b: "header button", a: "[data-positions-header] button:nth-child(1)", p: ["color", "bg", "radius", "minh"] },
      { n: "Account strip", b: "section[aria-label=Account]", a: "[data-account-strip]", p: ["bg", "border", "radius", "padding"] },
      { n: "Strip grid", b: "section[aria-label=Account] > div", a: "[data-account-strip] > div", p: ["gap"] },
      { n: "Strip label", b: "section[aria-label=Account] > div > div:nth-child(1) > div:nth-child(1)", a: "[data-account-strip] > div > div:nth-child(1) > div:nth-child(1)" },
      { n: "Strip ⓘ", b: "section[aria-label=Account] button.info", a: "[data-account-strip] button", p: ["size", "color", "bg", "padding"] },
      { n: "Strip value", b: "section[aria-label=Account] > div > div:nth-child(1) > div:nth-child(2)", a: "[data-account-strip] > div > div:nth-child(1) > div:nth-child(2)" },
      { n: "At risk 'of'", b: "section[aria-label=Account] > div > div:nth-child(3) > div:nth-child(2) > span", a: "[data-account-strip] > div > div:nth-child(3) > div:nth-child(2) > span" },
      { n: "Segment bar", b: "[aria-label='Positions or orders']", a: "[data-positions] [aria-label='Positions or orders']", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Segment on", b: "[aria-label='Positions or orders'] a.seg.on", a: "[data-positions] [aria-label='Positions or orders'] button[aria-pressed=true]" },
      { n: "Segment off", b: "[aria-label='Positions or orders'] a.seg:not(.on)", a: "[data-positions] [aria-label='Positions or orders'] button[aria-pressed=false]" },
      { n: "List", b: "ul", a: "[data-position-list]", p: ["gap"] },
      { n: "Card", b: "ul > li:nth-child(1)", a: "[data-position-list] > li:nth-child(1)", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Badge CLOSE", b: "span.b-close", a: "[data-position-list] > li:nth-child(1) [data-badge]", p: ["size", "weight", "color", "bg", "radius", "padding"] },
      { n: "Badge WARNING", b: "span.b-warn", a: "[data-position-list] > li:nth-child(2) [data-badge]", p: ["size", "weight", "color", "bg", "border", "radius", "padding"] },
      { n: "Ref · ticker · size", b: "ul > li:nth-child(1) > div:nth-child(1) > span.mono", a: "[data-position-list] > li:nth-child(1) [data-position-meta]" },
      { n: "Card title", b: "ul > li:nth-child(1) > div:nth-child(2) > span:first-child", a: "[data-position-list] > li:nth-child(1) [data-position-open]" },
      { n: "Profit", b: "ul > li:nth-child(1) > div:nth-child(2) > span:nth-child(2) > span.mono", a: "[data-position-list] > li:nth-child(1) [data-position-pnl]" },
      { n: "Loss", b: "ul > li:nth-child(2) > div:nth-child(2) > span:nth-child(2) > span.mono", a: "[data-position-list] > li:nth-child(2) [data-position-pnl]",
        why: { color: R.loss } },
      { n: "Share of risk", b: "ul > li:nth-child(1) > div:nth-child(2) > span:nth-child(2) > span:last-child", a: "[data-position-list] > li:nth-child(1) [data-position-share]" },
      { n: "Sentence", b: "ul > li:nth-child(1) > p", a: "[data-position-list] > li:nth-child(1) [data-position-line]" },
      { n: "Exit bars", b: "ul > li:nth-child(1) > div:nth-child(4)", a: "[data-position-list] > li:nth-child(1) [data-exit-bars]", p: ["size", "color", "gap"] },
      { n: "Exit bar", b: "ul > li:nth-child(1) .bar", a: "[data-position-list] > li:nth-child(1) [data-exit] > div", p: ["bg", "radius", "minh"] },
      { n: "Exit bar · reached", b: "ul > li:nth-child(1) .bar.done span", a: "[data-position-list] > li:nth-child(1) [data-exit=takeProfit] > div > span", p: ["bg"] },
      { n: "Exit bar · running", b: "ul > li:nth-child(1) .bar:not(.done) span", a: "[data-position-list] > li:nth-child(1) [data-exit=time] > div > span", p: ["bg"] },
      { n: "Exit bar · stop", b: "ul > li:nth-child(2) .bar.warn span", a: "[data-position-list] > li:nth-child(2) [data-exit=stop] > div > span", p: ["bg"] },
      { n: "Card foot", b: "ul > li:nth-child(1) > div:nth-child(5)", a: "[data-position-list] > li:nth-child(1) [data-card-foot]", p: ["padding", "border"] },
      { n: "Working close row", b: "ul > li:nth-child(1) > div:nth-child(5)", a: "[data-working-close]", p: ["gap"] },
      { n: "Working close text", b: "ul > li:nth-child(1) > div:nth-child(5) > span", a: "[data-working-close] > span" },
      { n: "Manage order", b: "a.btn-ghost", a: "[data-working-close] button", p: ["size", "weight", "color", "bg", "border", "radius", "padding", "minh"] },
      { n: "Decide", b: "a.btn-amber", a: "[data-position-list] > li:nth-child(2) [data-card-foot] button", p: ["size", "weight", "color", "bg", "border", "radius", "padding", "minh"] },
      { n: "Waiting order line", b: "ul > li:nth-child(3)", a: "[data-waiting-line]", p: ["size", "color", "padding"] },
      ...BOTTOM_BAR,
    ],
    skipWords: [[/^(J-000|WEAT|UNG|CORN|Bear call spread|Bull call spread|The CORN spread)/, R.sample]],
  },
  PositionDetail: {
    mode: "app+all+book", go: async (page) => { await page.waitForTimeout(1500); await tap(page, "nav button", "Positions", 2500);
      await tap(page, "[data-position-list] > li:nth-child(2) [data-position-open]", null, 1500); },
    pairs: [
      { n: "Header", b: "header", a: "[data-position-screen] > header", p: ["padding", "gap"] },
      { n: "Back", b: "header a", a: "[data-position-screen] [data-back]", p: ["size", "color", "padding", "minh", "gap"] },
      { n: "Ref pill", b: "header > span", a: "[data-ref-pill]" },
      { n: "Main", b: "main", a: "[data-position-screen] main", p: ["padding", "gap"] },
      { n: "Title", b: "main h1", a: "[data-position-screen] h1" },
      { n: "Title sub", b: "main h1 + p", a: "[data-position-sub]" },
      { n: "What to do now", b: "section[aria-label='What to do now']", a: "[data-position-status]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Status badge", b: "span.b-warn", a: "[data-position-status] [data-badge]", p: ["size", "weight", "color", "bg", "border", "radius", "padding"] },
      { n: "Status profit", b: "section[aria-label='What to do now'] span.mono", a: "[data-status-pnl]", why: { color: R.loss } },
      { n: "Status sentence", b: "section[aria-label='What to do now'] > p", a: "[data-status-headline]" },
      { n: "Close at limit", b: "button.act", a: "[data-position-status] button::text=Close at limit", p: ["size", "weight", "color", "bg", "border", "radius", "padding", "minh"] },
      { n: "Keep it, write why", b: "button.ghost", a: "[data-position-status] button::text=Keep it", p: ["size", "weight", "color", "bg", "border", "radius", "padding", "minh"] },
      { n: "Where it pays", b: "section[aria-labelledby=where-h]", a: "[data-position-pays]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Section heading", b: "#where-h", a: "[data-position-pays] h2" },
      { n: "Pays sentence", b: "section[aria-labelledby=where-h] > p", a: "[data-position-pays] > p" },
      { n: "Exit plan", b: "section[aria-labelledby=exit-h]", a: "[data-position-exit]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Exit row", b: "section[aria-labelledby=exit-h] > div:nth-of-type(1)", a: "[data-exit-row=takeProfit]", p: ["gap"] },
      { n: "Exit row text", b: "section[aria-labelledby=exit-h] > div:nth-of-type(1) > div:first-child", a: "[data-exit-row=takeProfit] > div:first-child" },
      { n: "Exit row figure", b: "section[aria-labelledby=exit-h] > div:nth-of-type(1) > div:first-child > span.mono", a: "[data-exit-row=takeProfit] > div:first-child > span:last-child" },
      { n: "Exit bar", b: "section[aria-labelledby=exit-h] .bar", a: "[data-exit-row=takeProfit] > div:nth-child(2)", p: ["bg", "radius", "minh"] },
      { n: "Exit bar · stop", b: "section[aria-labelledby=exit-h] .bar.warn span", a: "[data-exit-row=stop] > div:nth-child(2) > span", p: ["bg"] },
      { n: "At entry vs now", b: "section[aria-labelledby=evn-h]", a: "[data-position-ev]", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Table", b: "section[aria-labelledby=evn-h] > div", a: "[data-position-ev] [role=table]", p: ["size", "gap"] },
      { n: "Column head", b: "section[aria-labelledby=evn-h] > div > span:nth-child(2)", a: "[data-position-ev] [role=table] > span:nth-child(2)" },
      { n: "Figure label", b: "section[aria-labelledby=evn-h] span.def", a: "[data-position-ev] [role=table] > span:nth-child(4)" },
      { n: "Figure now", b: "section[aria-labelledby=evn-h] > div > span:nth-child(6)", a: "[data-position-ev] [role=table] > span:nth-child(6)" },
      { n: "A factor that turned", b: "section[aria-labelledby=evn-h] span.chg", a: "[data-position-ev] [data-turned]" },
      { n: "Turned line", b: "section[aria-labelledby=evn-h] > p", a: "[data-position-ev] > p" },
      { n: "Record", b: "section[aria-labelledby=tl-h]", a: "[data-position-record]", p: ["bg", "border", "radius", "padding"] },
      { n: "Whole record", b: "section[aria-labelledby=tl-h] a", a: "[data-position-record] button", p: ["size", "color", "minh"] },
      { n: "Record row", b: "section[aria-labelledby=tl-h] li", a: "[data-position-record] li", p: ["size", "padding", "gap", "border"] },
      { n: "Record when", b: "section[aria-labelledby=tl-h] li span.mono", a: "[data-position-record] li > span:first-child" },
      { n: "Analyse", b: "main > div:last-child > button:first-child", a: "[data-position-screen] button::text=Analyse as a new trade", p: ["size", "weight", "color", "bg", "border", "radius", "padding", "minh"] },
      ...BOTTOM_BAR,
    ],
    skipWords: [[/^(J-000|UNG|Bull call spread|HOLD\. Nothing to do)/, R.sample],
      [/^"Now" is always Alpaca's last price/, "left: the table's NOW is what is left from here (`remainingEdge()`), not a price; the line says what it is"]],
  },
  Orders: {
    mode: "app+all+book", go: async (page) => { await page.waitForTimeout(1500); await tap(page, "nav button", "Positions", 2500);
      await tap(page, "[aria-label='Positions or orders'] button", "Orders", 1500); },
    pairs: [
      { n: "Header row", b: "header", a: "[data-positions-header]", p: ["padding", "gap"] },
      { n: "Title", b: "header h1", a: "[data-positions-header] h1" },
      { n: "Segment on", b: "[aria-label='Positions or orders'] a.seg.on", a: "[data-positions] [aria-label='Positions or orders'] button[aria-pressed=true]" },
      { n: "Head line", b: "div.sans > div:nth-child(4)", a: "[data-orders-head]", p: ["size", "color", "gap"] },
      { n: "Cancel all", b: "div.sans > div:nth-child(4) button", a: "[data-orders-head] button", p: ["size", "weight", "color", "bg", "border", "padding", "minh"] },
      { n: "List", b: "ul", a: "[data-order-list]", p: ["gap"] },
      { n: "Row", b: "ul > li:nth-child(1)", a: "[data-order-list] > li:nth-child(1)", p: ["bg", "border", "radius", "padding", "gap"] },
      { n: "Intent tag", b: "ul > li:nth-child(1) span.tag", a: "[data-order-list] > li:nth-child(1) [data-order-tag]", p: ["size", "weight", "color", "bg", "border", "radius", "padding"] },
      { n: "Name", b: "ul > li:nth-child(1) span.tag + span", a: "[data-order-list] > li:nth-child(1) [data-order-name]" },
      { n: "Ref", b: "ul > li:nth-child(1) > div:first-child > span.mono", a: "[data-order-list] > li:nth-child(1) [data-order-ref]" },
      { n: "Terms", b: "ul > li:nth-child(1) > p:nth-of-type(1)", a: "[data-order-list] > li:nth-child(1) [data-order-terms]" },
      { n: "Book", b: "ul > li:nth-child(1) > p:nth-of-type(2)", a: "[data-order-list] > li:nth-child(1) [data-order-book]" },
      { n: "Actions", b: "ul > li:nth-child(1) > div:nth-of-type(2)", a: "[data-order-list] > li:nth-child(1) [data-order-actions]", p: ["gap", "padding"] },
      { n: "Modify", b: "ul > li:nth-child(1) button.rowbtn:nth-child(1)", a: "[data-order-list] > li:nth-child(1) [data-order-actions] button:nth-child(1)",
        p: ["size", "weight", "color", "bg", "border", "radius", "minh"] },
      { n: "Cancel", b: "ul > li:nth-child(1) button.rowbtn:nth-child(2)", a: "[data-order-list] > li:nth-child(1) [data-order-actions] button:nth-child(2)",
        p: ["size", "weight", "color", "bg", "border", "radius", "minh"],
        why: { color: R.cancel, border: R.cancel } },
      ...BOTTOM_BAR,
    ],
    skipWords: [[/^(J-000|CORN|WEAT|OPEN|CLOSE)\b/, R.sample]],
  },
};

/** Named groups for the command line. */
export const GROUPS = {
  find: ["FindB", "FindLoading", "FindStale", "FindEmpty", "FindSaved", "FindFilters", "Define"],
  market: ["MarketStrategies", "MarketOverview", "Market"],
  build: ["Build", "BuildReview", "BuildLoading", "BuildNoData", "BuildEmpty"],
  pr3: ["Positions", "PositionDetail", "Orders"],
  shipped: ["FindB", "FindLoading", "FindStale", "FindEmpty", "FindSaved", "FindFilters", "Define",
    "MarketStrategies", "MarketOverview", "Market", "Build", "BuildReview", "BuildLoading", "BuildNoData", "BuildEmpty",
    "Positions", "PositionDetail", "Orders"],
  all: [],
};
GROUPS.all = Object.keys(SCREENS);
