// ============================================================================
// src/find.jsx — STEP 1, FIND, VERSION B: ONE ROW PER MARKET, EVERY CONTROL IN ONE ROW OF CHIPS (redesign PR 1, TASK 2;
// the owner's mockups and answers, 4 Oct 2026). Before: PR #40's one request block over one list of cards (PR #45 moved
// it out of App.jsx; PR #49 made it one sorted list with the misses in place).
//
// TOP TO BOTTOM: the category tabs "All · Grains · Energy · Metals" (counted from markets.js, they only filter what is
// shown); ONE row of chips — View · Style · Max loss · ⇅ Sort · More (PR 66, owner 12 Oct 2026: "too many filters, and
// not incisive"; it was eight chips and two toggles hidden in sheets) — each showing its value and filled when off its
// default; one summary line ("4 of 10 fit · 6 dimmed", Hide them / Show them, Reset) and, when rows are dimmed, the
// filter that binds with one fix (`bindingFilter()`, rows.js); the column head "Market … Days · risk ⓘ"; then ONE ROW PER
// MARKET. ("Find", the gear and the Results | Saved segment sit above, in App.jsx, because Saved shares them.)
//
// >>> THE ROWS ARE A VIEW OF THE ONE SORTED LIST, NOT A SECOND LIST. <<< `marketRows()` (src/rows.js) groups
// `findShown` — the list findGen built and the owner's order sorted — by market: a row's card is the market's first
// card that fits, in the chosen order, else its first card as a miss (quieter, the reason in place of its subtitle).
// No new ranking, no new simulation. A row's figures are its card's tiles (`rowFigures()`, held equal by figures.test.jsx):
// Chance · Return on risk · Avg per $100 at risk on every row, the sorted-by one ringed, then the days and the risk (PR 63).
// Tapping a row opens the market's page on Strategies (market.jsx), where its cards are.
//
// >>> EVERY CHIP OPENS A SHEET. <<< View (Signals decide · Up · Down · Range, and the target in expected moves, which
// picks the family findGen builds), Style (Cautious · Balanced · Bold: the chance and return floors, the two sliders one
// fold down), Budget (the existing control), ⇅ Sort (the four orders) and More (Debit · Credit · Both, Horizon, the
// Liquidity panel as a fold, the three list toggles). The sliders still move `request`, which this file reads: it
// filters and sizes, and never simulates (`scripts/measure-find.mjs`; the memo-deps check in find.test.jsx). Every sheet
// ends with a live "Show N of M".
//
// WHAT IS PASSED IN AS A FUNCTION OR A NODE is what lives in App.jsx's closures (the liquidity filter, Save, opening a
// market): passing them is the price of not importing App.jsx back, which would be a cycle.
// ============================================================================
import React, { useCallback, useMemo } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Panel, Label, Stat, Note, Fold, CheckField, Sheet, IconButton, FilterChip, UnderTabs, TextBtn, SegmentBar, RangeField, TAP } from "./ui.jsx";
import { FIND_ORDERS, DEFAULT_FIND_ORDER, findOrderOf } from "./signals.js";
import { RequestControls, NumbersFit } from "./card.jsx";
import { HowWorkedOut } from "./why.jsx";
import { MARKET_CATEGORIES, BASKET } from "./markets.js";
import { CompareFigure, BandThumbnail } from "./visuals.jsx";
import { scaleStrategy, useCopilot, skillsFor } from "./pro.jsx";
import { CopilotSection } from "./build.jsx";
import { legsLine, MAX_COMPARE } from "./path.js";
import { marketRows, rowCounts, rowFigures, rowStateOf, compareCards, bindingFilter } from "./rows.js";
import { money, chanceText, NO_CEILING, noCeilingNote, noCeilingRankNote, seasonalStampNote,
  filterFold, qualityFloorLine, qualityFloorSentence, liquiditySettingNote, looseningWarning, isLoosened,
  unpriceableNote, impossibleLossNote, modelDisagreementNote, wideSpreadNote, wideComboNote, crossingNote,
  liquiditySkippedNote, spreadSkippedNote, comboSpreadSkippedNote, horizonFloorNote, perTradeCapLabel,
  nothingTodayLine, staleBoardLine, sizedFree, sizeLine, controlReadings, chanceBasisLabel, futureFigures, futureTile,
  POSITIVE_FUTURE_TOGGLE, rowsResultsLine, missReasonLine, nothingFits, nothingFitsLine, allMissLine, overLimitNote,
  showMissesCta, RESET_ALL_FILTERS, CATEGORY_ALL, FIND_CHIPS, FIND_SHEET_TITLES, chipText, chipOffDefault, anyChipOff,
  showRowsCta, HIDE_ROWS, SHOW_ROWS, RESET_FILTERS, COLUMN_MARKET, columnHeadText, rowRiskText, rowDaysText, NO_POSITIVE_AVG_LINE, futureIsPositive, meetsRequest, DIRECTION_TAGS,
  rowSubtitleText, ROW_READING, findReadingLine, rowFailedText, ROW_NO_BOARD, staleBannerLine, staleStatusLine, staleFailLine, RETRY,
  SHOW_FLAGGED_TOGGLE, howConnectLabel, HOW_CONNECT_STEPS, CARD_LABELS, ARIA,
  FIND_HEADING, refreshAria, SETTINGS_WORD, FIND_SEGMENTS_ARIA, RESET_SHEET,
  FIND_COMPARE_BTN, FIND_COPILOT_HEAD, findCopilotLine, LIQ_OTHER_HEAD, LIQ_DETAILS, LIQ_REASONS_FOLD,
  RULES, chipPartsOf, FIND_VIEWS, viewOfDir, dirOfView, viewBuildsText, viewExampleText, VIEW_TARGET_LABEL, movesText,
  FIND_STYLES, styleOf, styleNumbersText, STYLE_OWN_FOLD, NET_SIDES, NET_SIDE_HEAD, NET_SIDE_NOTE, LIQUIDITY_HEAD,
  HIDE_MISSES_TOGGLE, DEFAULT_NET_SIDE, requestFloorsText,
  COMPARE_SHEET_TITLE, compareCountLine, compareTickedLine, COMPARE_ONE_MORE, COMPARE_CLEAR, compareUntickAria, COMPARE_GONE, BUILD_CTA,
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
/** One empty list, so a market with no bars yet hands every row the SAME array and a memoised picture stays put. */
const NO_BARS = [];
/** The ring on the figure a row is sorted by (PR 63): the card's own ring (card.jsx), drawn tight around a short figure. */
const ROW_RING = { outline: `2px solid ${T.blue}`, outlineOffset: 2, borderRadius: 6, padding: "0 4px" };
/** A direction's colour: red is for errors only, so a bear reading is violet. */
const DIR_COLOR = { bull: T.green, bear: T.violet, neutral: T.mut };

/* FIND'S OWN HEADER (round 2, mockup "Find B"): "Find", ↻ and the gear; the status line (or the stale banner); Results |
   Saved. Nothing else sits above Find's list — the desk header is not drawn on Find, Saved or a market's page. */
export function FindHeader({ seg = "results", onSeg, savedN = 0, nMarkets = 0, busy = false, onRefresh, onSettings, settingsOn = false,
  status = null, stale = null }) {
  return (
    <header data-find-header>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 8px 0 16px" }}>
        <h1 data-view-heading tabIndex={-1} style={{ ...sans, flex: 1, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
          margin: 0, outline: "none" }}>{FIND_HEADING}</h1>
        <span style={{ display: "flex", gap: 2 }}>
          <IconButton label={refreshAria(nMarkets)} onClick={onRefresh} disabled={busy} aria-busy={busy || undefined}>
            <RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <IconButton label={SETTINGS_WORD} pressed={settingsOn} onClick={onSettings}>
            <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </span>
      </div>
      {stale && stale.stale ? (
        /* STALE (the mockup "Find · stale"): the status line turns amber with a dot, and a banner under it says why, with
           Retry (the same Refresh). */
        <>
          <div data-find-status style={{ ...sans, fontSize: FS.xs, color: T.amber, padding: "0 16px 8px", lineHeight: LH.body,
            display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: T.amber, flexShrink: 0 }} />
            <span>{staleStatusLine({ closeDay: stale.closeDay })}</span>
          </div>
          <div role="status" data-stale style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.ink, margin: "0 16px 8px", padding: "10px 12px",
            background: T.panel, border: `1px solid ${T.amber}`, borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {staleFailLine(stale.failedAt) && <b>{staleFailLine(stale.failedAt)} </b>}
              {staleBannerLine({ closeDay: stale.closeDay, closeWeekday: stale.closeWeekday })}
            </span>
            <button onClick={stale.onRetry} style={{ ...sans, flexShrink: 0, minHeight: TAP, padding: "0 12px", borderRadius: 10, cursor: "pointer",
              fontSize: FS.sm, fontWeight: FW.bold, color: T.ink, background: "transparent", border: `1px solid ${T.field}` }}>{RETRY}</button>
          </div>
        </>
      ) : (
        <div data-find-status style={{ ...sans, fontSize: FS.xs, color: T.mut, padding: "0 16px 6px", lineHeight: LH.body }}>{status}</div>
      )}
      <SegmentBar label={FIND_SEGMENTS_ARIA} value={seg} onChange={onSeg} style={{ margin: "0 16px 6px" }}
        items={[{ id: "results", label: "Results", count: nMarkets || null }, { id: "saved", label: "Saved", count: savedN }]} />
    </header>
  );
}

export function FindStep({
  request, onRequest, sentiments, find, setFind, limits, onLimit, freeSizing,
  findGen, findShown, signalLines = [], findOrder = DEFAULT_FIND_ORDER, onFindOrder = null, flaggedHidden = 0, positiveHidden = 0,
  barsCache = {}, readiness = {}, liqLevel, liqState = null, foldedNode = null,
  sheet = null, onSheet = () => {}, onReset = () => {},
  isSaved = () => false, onSave = () => {}, onOpenMarket = () => {},
  freshness = null,
  compare = [], compareFitting = 0,
  copilot = null, liquidity = null,
  // The top row's market for the View sheet's example (PR 66): { tk, spot, move, expKey } — App.jsx's `marketMoveOf()`.
  viewExample = null,
}) {
  /* ---- WHAT IS IN, AND WHAT IS STILL BEING READ (redesign PR 1). A market being read has no fused result and no rank
     effect, as before; its row waits after the rows that are in, and says what it is waiting for. ---- */
  const markets = find.cat ? (MARKET_CATEGORIES.find((c) => c.id === find.cat) || { tickers: [] }).tickers : find.markets;
  const stateOf = useCallback((tk) => rowStateOf(tk, findGen, readiness[tk] || null), [findGen, readiness]);
  const waiting = useMemo(() => markets.map((tk) => ({ tk, st: stateOf(tk) })).filter((w) => w.st), [markets, stateOf]);
  const waitingSet = useMemo(() => new Set(waiting.map((w) => w.tk)), [waiting]);
  const inItems = useMemo(() => findShown.filter((x) => !waitingSet.has(x.tk)), [findShown, waitingSet]);

  /* ---- SIZE, ONCE PER CARD PER REQUEST. Every reading below reads this map, so a slider move is one
     `scaleStrategy()` per candidate and nothing else. ---- */
  const sizes = useMemo(() => {
    const m = new Map();
    for (const x of inItems) m.set(x.key, sizedFree(scaleStrategy(x.lf.aFill, request.mode, request.amt, request.riskCap), freeSizing));
    return m;
  }, [inItems, request, freeSizing]);
  const cands = useMemo(() => inItems.map((x) => x.cand), [inItems]);
  const sizeOf = useCallback((c) => sizes.get(c.key) || null, [sizes]);
  const readings = useMemo(() => controlReadings(cands, request, sizeOf), [cands, request, sizeOf]);

  const rows = useMemo(() => marketRows(inItems, request, sizeOf), [inItems, request, sizeOf]);
  // n rows fit, m miss ("4 of 10 fit · 6 dimmed"): `rowCounts()` gives how many fit and how many rows there are.
  const { n, m: rowsN } = rowCounts(rows);
  const m = rowsN - n;
  const shown = find.hideMisses ? rows.filter((r) => r.fits) : rows;
  const nf = useMemo(() => (rows.length && n === 0 ? nothingFits(cands, request, sizeOf) : null), [rows.length, n, cands, request, sizeOf]);
  /* 63.3 (PR 63, owner 7 Oct 2026): cards fit, and not one of them has a positive future average — said once, above the
     rows, so a list sorted by "Future avg" is not read as a list of good bets. `futureIsPositive()` is the "Avg > 0" chip's. */
  /* 66.2 (PR 66): when rows are dimmed, the filter that leaves out the most and one fix — the same misses that dim them. */
  const bind = useMemo(() => bindingFilter(inItems, request, sizeOf), [inItems, request, sizeOf]);
  const noPositive = useMemo(() => {
    const fitting = inItems.filter((x) => meetsRequest(x.cand, request, sizeOf(x.cand)).meets);
    return fitting.length > 0 && !fitting.some((x) => futureIsPositive(x.ev100));
  }, [inItems, request, sizeOf]);

  const st = findChipState({ find, findOrder, request, liqState });
  const sheetId = sheet && String(sheet).startsWith("find:") ? String(sheet).slice(5) : null;
  const closeSheet = () => onSheet(null);
  /** A sheet's current value, beside its title (round 2): the chip's own value. */
  const sheetValue = (id) => { const p = chipPartsOf(id, st); return id === "more" ? (p.value || null) : p.value || p.name; };
  /* THE VIEW (PR 66): the family findGen builds is `find.dir`, set from the view and the target together, so the target
     moved inside one family re-builds nothing (findGen reads `find.dir` only). */
  const cur = viewOfDir(find.dir, find.target);
  const setView = (v) => setFind((f) => {
    const was = viewOfDir(f.dir, f.target);
    const t = v === "up" || v === "down" ? (was.view === "up" || was.view === "down" ? was.target : RULES.viewTargetDefault) : null;
    return { ...f, dir: dirOfView(v, t), target: t };
  });
  const setTarget = (t) => setFind((f) => ({ ...f, target: t, dir: dirOfView(viewOfDir(f.dir, f.target).view, t) }));
  const style = styleOf(request);
  // Every sheet ends with a live "Show N of M": full width, amber, 48px (the mockups).
  // …and Reset beside it, every chip back to its default (the mockup's sheet footer: a quiet Reset, the amber Show).
  const footer = (
    <div data-sheet-footer style={{ display: "flex", gap: 8 }}>
      <ActionBtn onClick={onReset} style={{ minHeight: 48 }}>{RESET_SHEET}</ActionBtn>
      <ActionBtn primary onClick={closeSheet} style={{ flex: 1, minHeight: 48, fontSize: FS.md }}>{showRowsCta(n, rows.length)}</ActionBtn>
    </div>
  );
  const sharedControls = { request, onChange: onRequest, readings, sentiments, direction: find.dir,
    onDirection: (d) => setFind((f) => ({ ...f, dir: d })), horizon: find.horizon,
    onHorizon: (h) => setFind((f) => ({ ...f, horizon: h })), limits, onLimit, bare: true };

  const t = findGen.tally;
  const fold = filterFold(t, { level: liqLevel, what: null });
  const unb = findGen.items.filter((x) => x.lf.aFill.profitUnbounded).length;
  const what = find.markets.join(", ");
  const top = shown[0] || null;
  const doneN = find.markets.length - find.markets.filter((tk) => stateOf(tk) && ["chain", "season", "waiting"].includes(stateOf(tk).state)).length;
  const reading = doneN < find.markets.length;

  const pad = { padding: "0 16px" };
  const catItems = [{ id: null, label: CATEGORY_ALL, count: BASKET.length },
    ...MARKET_CATEGORIES.map((c) => ({ id: c.id, label: c.id, count: c.tickers.length }))];
  return (
    <div data-find style={{ maxWidth: 1280 }}>
      {/* THE CATEGORY TABS, UNDERLINED (round 2) — the registry's own counts (markets.js). They only filter what is shown. */}
      <UnderTabs label={ARIA.categories} value={find.cat || null} items={catItems}
        onChange={(id) => setFind((f) => ({ ...f, cat: id }))} />

      {/* ONE ROW OF CHIPS, scrolling sideways. Each says its value; one off its default is filled with ink. */}
      <div role="toolbar" aria-label={ARIA.filters} data-chip-row
        style={{ display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap", padding: "10px 16px 4px", WebkitOverflowScrolling: "touch" }}>
        {FIND_CHIPS.map((c) => {
          const parts = chipPartsOf(c.id, st);
          return (
            <FilterChip key={c.id} off={chipOffDefault(c.id, st)} strong={c.id === "sort"} name={parts.name}
              value={parts.value} valueMono={/^[$\d]/.test(String(parts.value || ""))} opens
              label={`${chipText(c.id, st)}: change`} onClick={() => onSheet(`find:${c.id}`)} />
          );
        })}
      </div>

      {/* THE SUMMARY LINE: "4 of 10 fit · 6 dimmed" left; Hide them / Show them and Reset right. */}
      <div data-find-summary style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "0 12px 2px 16px", minHeight: 36 }}>
        <span aria-live="polite" style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{rowsResultsLine(n, m, !!find.hideMisses)}</span>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {m > 0 && <TextBtn onClick={() => setFind((f) => ({ ...f, hideMisses: !f.hideMisses }))}>{find.hideMisses ? SHOW_ROWS : HIDE_ROWS}</TextBtn>}
          {anyChipOff(st) && <TextBtn onClick={onReset}>{RESET_FILTERS}</TextBtn>}
          {/* ONE COMPARE (PR 61): the sheet opens with the ticked cards, or the cards that fit when none is ticked. */}
          {copilot && (compareFitting > 0 || (compare || []).length > 0) && <TextBtn data-find-compare onClick={() => onSheet("compare")}>{FIND_COMPARE_BTN}</TextBtn>}
        </span>
      </div>
      {/* THE FILTER THAT BINDS (PR 66, task 66.2): "Style Cautious leaves out 5 markets · Loosen ›". With nothing fitting at all,
          "Nothing fits" below says it instead. Its fix never passes the per-trade limit. */}
      {bind && n > 0 && (
        <div data-find-binding style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "0 12px 2px 16px", minHeight: 36 }}>
          <span role="status" style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{bind.text}</span>
          {bind.fix && <TextBtn data-find-binding-fix onClick={() => onRequest(bind.fix.patch)}>{bind.fix.label}</TextBtn>}
        </div>
      )}
      {/* While markets are still being read and some rows are in (with none in, "Nothing today" below says it). */}
      {reading && findGen.items.length > 0 && <ReadingLine text={findReadingLine(find.markets.length, doneN)} frac={find.markets.length ? doneN / find.markets.length : 0} />}

      {/* SIGNALS THAT LANDED AND ADDED A FAMILY, one line each (PR #48, TASK 3). */}
      {signalLines.length > 0 && <Note color={T.blue} role="status" style={{ ...pad, marginTop: 4 }}>{signalLines.join(" · ")}</Note>}

      {/* A STALE BOARD IS SAID ONCE, ABOVE THE ROWS (PR #41, TASK 2). (A stale FEED is the header's banner, round 2.) */}
      {findGen.stale.length > 0 && <Note color={T.amber} style={{ ...pad, marginTop: 6 }}>⚠ {staleBoardLine(findGen.stale)}</Note>}

      {noPositive && <Note color={T.amber} role="status" data-no-positive style={{ ...pad, marginTop: 6 }}>{NO_POSITIVE_AVG_LINE}</Note>}

      {/* "NOTHING TODAY" ONLY WHEN ZERO CANDIDATES PASS THE FLOORS, WITH THE COUNTS. */}
      {findGen.items.length === 0 && (
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, margin: "10px 16px", lineHeight: LH.body, padding: "10px 12px", border: `1px dashed ${T.line}`, borderRadius: 10 }}>
          {nothingTodayLine(findGen.tally, { noBoard: findGen.noBoard, loading: findGen.loading, failed: findGen.failed, level: liqLevel })}
        </div>
      )}

      {/* NOTHING FITS: the filter that binds, the cheapest card here, ONE fix that never passes a limit. */}
      {/* (The mockup "Find · nothing fits": no panel, a rule above, 28px of air, the line in 18 bold, the cheapest card, two
          actions.) */}
      {nf && (
        <div role="status" data-nothing-fits style={{ ...sans, display: "flex", flexDirection: "column", gap: 12, color: T.ink, padding: "28px 16px",
          borderTop: `1px solid ${T.line}` }}>
          <p style={{ margin: 0, fontSize: FS.lg, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink }}>{nothingFitsLine(nf.control)}</p>
          <p style={{ margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>{allMissLine(rows.length, nf.cheapest)}</p>
          {nf.overLimit != null && <p style={{ margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.amber }}>{overLimitNote(nf.overLimit)}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionBtn primary onClick={() => (nf.fix ? onRequest(nf.fix.patch) : onReset())}>{nf.fix ? nf.fix.label : RESET_ALL_FILTERS}</ActionBtn>
            {find.hideMisses && <ActionBtn onClick={() => setFind((f) => ({ ...f, hideMisses: false }))}>{showMissesCta(m)}</ActionBtn>}
          </div>
        </div>
      )}

      {/* THE COLUMN HEAD, and the ⓘ "How <TK>'s numbers connect" for the top row's market (a sheet, round 2). */}
      {(shown.length > 0 || waiting.length > 0) && (
        <div data-find-colhead style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 36, padding: "0 8px 0 16px",
          borderTop: `1px solid ${T.line}`, ...sans, fontSize: FS.xs, color: T.mut }}>
          <span>{COLUMN_MARKET}</span>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {columnHeadText()}
            {top && <IconButton size={36} color={T.blue} label={howConnectLabel(top.tk)} aria-expanded={sheetId === "connect"}
              onClick={() => onSheet("find:connect")} style={{ fontSize: FS.md }}>ⓘ</IconButton>}
          </span>
        </div>
      )}

      <div role="list" aria-label={ARIA.markets} data-find-list>
        {shown.map((r) => (
          <MarketRow key={r.tk} row={r} sd={(findGen.boards[r.tk] || {}).signal || null}
            fig={rowFigures(r.x, sizes.get(r.x.key) || null, findOrder)} bars={barsCache[r.tk] || NO_BARS}
            saved={isSaved(r.x.cand)} onSave={() => onSave(r.x)} onOpen={() => onOpenMarket(r.tk)} />
        ))}
        {waiting.map((w) => <WaitingRow key={w.tk} tk={w.tk} st={w.st} />)}
      </div>

      {/* "HOW <TK>'S NUMBERS CONNECT": five numbered steps, each number read from its own function — the score and the
          confidence (HowWorkedOut), the direction (`signalDirection()`'s own arithmetic), the strategy (its family and
          the size the budget buys), the chance and the future avg (the card's own figures) — then "How the numbers fit".
          A sheet since round 2 (the mockups); one tap away, so the word counter does not score it at rest. */}
      <Sheet open={sheetId === "connect" && !!top} title={top ? howConnectLabel(top.tk) : ""} onClose={closeSheet}
        sub={top ? rowSubtitleText(top.x.name, top.x.expKey) : null} subMono>
        {top && (
          <div style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>
            {/* FIVE NUMBERED STEPS (the mockup "How the numbers connect"): the number in a ring, the step's name, its figure
                in mono, and the sentence under them. */}
            <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {howConnectSteps(top.x, (findGen.boards[top.tk] || {}).signal || null, sizes.get(top.x.key) || null).map((t, i) => (
                <li key={HOW_CONNECT_STEPS[i]} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.line}` }}>
                  <span style={{ ...mono, flex: "0 0 26px", width: 26, height: 26, boxSizing: "border-box", borderRadius: "50%", border: `1px solid ${T.field}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: FS.xs, fontWeight: FW.bold, color: T.ink }}>{i + 1}</span>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span data-step-name style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{HOW_CONNECT_STEPS[i]}</span>
                      {t.value && <span data-step-value style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{t.value}</span>}
                    </div>
                    <p data-step-text style={{ margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>{t.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            {top.x.fused && <HowWorkedOut fused={top.x.fused} />}
            <span style={{ display: "block", marginTop: 6 }}><NumbersFit order={findOrder} /></span>
          </div>
        )}
      </Sheet>

      {/* ---- THE SHEETS, one at a time, from `deskSheet` (Back closes them). PR 66: View · Style · Budget · ⇅ Sort · More. ---- */}
      <Sheet open={sheetId === "view"} title={FIND_SHEET_TITLES.view} value={sheetValue("view")} onClose={closeSheet} footer={footer}>
        <div role="radiogroup" aria-label={FIND_SHEET_TITLES.view} data-view-choices style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FIND_VIEWS.map((v) => (
            <FilterChip key={v.id} off={cur.view === v.id} name={v.label} label={v.label} onClick={() => setView(v.id)} />
          ))}
        </div>
        {(cur.view === "up" || cur.view === "down") && (
          <div style={{ marginTop: 10 }}>
            <RangeField label={VIEW_TARGET_LABEL} value={cur.target} onChange={(v) => setTarget(Math.round(v / RULES.viewTargetStep) * RULES.viewTargetStep)}
              min={RULES.viewTargetMin} max={RULES.viewTargetMax} step={RULES.viewTargetStep}
              format={(v) => movesText(v)} parse={(t) => Number(String(t).replace(/[×x\s]/g, ""))} toInput={(v) => String(Number(Number(v).toFixed(2)))}
              color={T.amber} trackHeight={32} />
          </div>
        )}
        <Note color={T.body} style={{ marginTop: 10 }}>{viewBuildsText(cur.view, cur.target)}</Note>
        {(cur.view === "up" || cur.view === "down") && viewExample && viewExampleText(viewExample.tk, cur.view, cur.target, viewExample.spot, viewExample.move, viewExample.expKey) && (
          <Note color={T.mut} style={{ marginTop: 6 }} data-view-example>
            {viewExampleText(viewExample.tk, cur.view, cur.target, viewExample.spot, viewExample.move, viewExample.expKey)}
          </Note>
        )}
      </Sheet>
      <Sheet open={sheetId === "style"} title={FIND_SHEET_TITLES.style} value={sheetValue("style")} onClose={closeSheet} footer={footer}>
        {/* THE STYLE (PR 66): each sets the two floors the sliders below set, and says which numbers it sets. */}
        <div role="radiogroup" aria-label={FIND_SHEET_TITLES.style}>
          {FIND_STYLES.map((o, i) => {
            const on = style === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={on} data-style={o.id}
                onClick={() => onRequest({ minChance: o.minChance, minReturn: o.minReturn })}
                style={{ ...sans, display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", minHeight: 52, padding: "6px 0",
                  cursor: "pointer", background: "transparent", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", color: T.ink }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, boxSizing: "border-box", borderRadius: "50%", flexShrink: 0,
                  border: on ? `5px solid ${T.amber}` : `2px solid ${T.field}` }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight }}>{o.label}</span>
                  <span style={{ display: "block", fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>{`${styleNumbersText(o)} · ${o.note}`}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Fold label="open" tone={T.body} style={{ marginTop: 8 }} summary={STYLE_OWN_FOLD}>
          <RequestControls only={["chance", "return"]} {...sharedControls} />
        </Fold>
      </Sheet>
      <Sheet open={sheetId === "budget"} title={FIND_SHEET_TITLES.budget} value={sheetValue("budget")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["size"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "sort"} title={FIND_SHEET_TITLES.sort} value={sheetValue("sort")} onClose={closeSheet} footer={footer}>
        <div role="radiogroup" aria-label={FIND_SHEET_TITLES.sort}>
          {FIND_ORDERS.map((o, i) => {
            const on = findOrder === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={on}
                onClick={() => { if (onFindOrder) onFindOrder(o.id); closeSheet(); }}
                style={{ ...sans, display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", minHeight: 52, padding: "6px 0",
                  cursor: "pointer", background: "transparent", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", color: T.ink }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, boxSizing: "border-box", borderRadius: "50%", flexShrink: 0,
                  border: on ? `5px solid ${T.amber}` : `2px solid ${T.field}` }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight }}>{o.label}</span>
                  <span style={{ display: "block", fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>{o.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
      <Sheet open={sheetId === "more"} title={FIND_SHEET_TITLES.more} value={sheetValue("more")} onClose={closeSheet} footer={footer}>
        {/* DEBIT · CREDIT · BOTH (PR 66): a request, so a card on the other side is dimmed with its reason. */}
        <h3 style={{ ...sans, margin: "0 0 6px", fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut }}>{NET_SIDE_HEAD.toUpperCase()}</h3>
        <div role="radiogroup" aria-label={NET_SIDE_HEAD} data-net-side style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NET_SIDES.map((o) => (
            <FilterChip key={o.id} off={(request.side || DEFAULT_NET_SIDE) === o.id} name={o.label} label={o.label} onClick={() => onRequest({ side: o.id })} />
          ))}
        </div>
        <Note color={T.mut} style={{ marginTop: 4 }}>{NET_SIDE_NOTE}</Note>
        <RequestControls only={["horizon"]} {...sharedControls} style={{ marginTop: 8 }} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
          <CheckField checked={!!find.positiveOnly} onChange={(e) => setFind((f) => ({ ...f, positiveOnly: e.target.checked }))}>
            {POSITIVE_FUTURE_TOGGLE}{positiveHidden ? ` (${positiveHidden} hidden)` : ""}
          </CheckField>
          <CheckField checked={find.flagged} onChange={(e) => setFind((f) => ({ ...f, flagged: e.target.checked }))}>
            {SHOW_FLAGGED_TOGGLE}{flaggedHidden ? ` (${flaggedHidden} hidden)` : ""}
          </CheckField>
          <CheckField checked={!!find.hideMisses} onChange={(e) => setFind((f) => ({ ...f, hideMisses: e.target.checked }))}>
            {HIDE_MISSES_TOGGLE}
          </CheckField>
        </div>
        {/* THE LIQUIDITY PANEL (PR 4d), unchanged, one fold down since PR 66. */}
        <Fold label="open" tone={T.body} style={{ marginTop: 8 }} summary={`${LIQUIDITY_HEAD} · ${liqState && liqState.label ? liqState.label : ""}`.replace(/ · $/, "")}>
          <div data-liq-fold style={{ marginTop: 8 }}>
            {liquidity && (
              <div data-liq-panel style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p data-liq-takeaway style={{ ...sans, margin: 0, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.body, color: T.ink }}>{liquidity.takeaway}</p>
                <div role="group" aria-label="Liquidity floor" data-liq-levels style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {liquidity.levels.map((l) => (
                    <FilterChip key={l.id} off={l.on} name={`${l.label}${l.recommended ? " ✓" : ""}`} value={l.value} valueMono
                      label={`${l.label}${l.value ? `, ${l.value}` : ""}`} onClick={() => liquidity.onLevel(l.id)} />
                  ))}
                </div>
                <Note color={T.mut}>{liquidity.blurb}</Note>
                {liquidity.warn && <Note color={T.amber} role="note">⚠ {liquidity.warn}</Note>}
                {fold.reasons && fold.reasons.length > 0 && (
                  <section aria-label={LIQ_OTHER_HEAD} data-liq-other>
                    <h3 style={{ ...sans, margin: "4px 0 2px", fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut }}>{LIQ_OTHER_HEAD}</h3>
                    {fold.reasons.map((r) => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${T.line}`, padding: "8px 0", ...sans, fontSize: FS.sm, color: T.body }}>
                        <span>{r.clause.charAt(0).toUpperCase() + r.clause.slice(1)}</span>
                        <span style={{ ...mono, fontVariantNumeric: "tabular-nums", color: T.ink }}>{r.count}</span>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
            <Fold label="open" tone={T.body} style={{ marginTop: 10 }} summary={LIQ_DETAILS}>{foldedNode}</Fold>
            {/* EVERYTHING THAT EXPLAINS THE LIST, BEHIND ONE "why" (moved here from under the list, owner, 4 Oct 2026). */}
            <Fold label="why" tone={T.dim} style={{ marginTop: 4 }} summary={LIQ_REASONS_FOLD}>
              {t.unpriceable > 0 && <Note color={T.amber} style={{ marginTop: 6 }}>{unpriceableNote(t.unpriceable, what)}</Note>}
              {t.impossible > 0 && <Note color={T.red} style={{ marginTop: 6 }}>{impossibleLossNote(t.impossible, what)}</Note>}
              {t.model > 0 && <Note color={T.red} style={{ marginTop: 6 }}>{modelDisagreementNote(t.model, what)}</Note>}
              {t.spread > 0 && <Note color={T.amber} style={{ marginTop: 6 }}>{wideSpreadNote(t.spread, what)}</Note>}
              {t.comboSpread > 0 && <Note color={T.amber} style={{ marginTop: 6 }}>{wideComboNote(t.comboSpread, what)}</Note>}
              {t.crossing > 0 && <Note color={T.amber} style={{ marginTop: 6 }}>{crossingNote(t.crossing, what)}</Note>}
              {findGen.oiSkipped.length > 0 && <Note color={T.dim} style={{ marginTop: 6 }}>{liquiditySkippedNote(`the feed for ${findGen.oiSkipped.join(", ")}`)}</Note>}
              {findGen.spreadSkipped.length > 0 && <Note color={T.dim} style={{ marginTop: 6 }}>{spreadSkippedNote(`the feed for ${findGen.spreadSkipped.join(", ")}`)}</Note>}
              {findGen.comboSpreadSkipped.length > 0 && <Note color={T.dim} style={{ marginTop: 6 }}>{comboSpreadSkippedNote(`the feed for ${findGen.comboSpreadSkipped.join(", ")}`)}</Note>}
              {findGen.noBoard.length > 0 && <Note style={{ marginTop: 6 }}>{`No expiry on ${findGen.noBoard.join(", ")} is far enough out to open on, so nothing was built there. ${horizonFloorNote()}.`}</Note>}
              {unb > 0 && <Note color={T.dim} style={{ marginTop: 6 }}>{noCeilingRankNote(unb)}</Note>}
              <Note color={isLoosened(liqLevel) ? T.amber : T.dim} style={{ marginTop: 6 }}>
                {liquiditySettingNote(liqLevel, { ...t, kept: findGen.items.length })}
              </Note>
              <Note color={T.dim} style={{ marginTop: 8 }}>{qualityFloorSentence(liqLevel)}</Note>
              <Note color={T.dim} style={{ marginTop: 6 }}>
                {`${limits.answered ? "Your" : "The suggested"} per-trade limit: ${money(limits.perTradeLimit)} (${perTradeCapLabel()}).`} Budget is the most you will pay, taken from live prices. For trades where you receive money up front, the limit becomes the capital tied up instead. Chance is the probability of ending in profit at expiry.
              </Note>
            </Fold>
          </div>
        </Fold>
      </Sheet>

      {/* THE COMPARE SHEET (PR 4's copilot sheet; one compare since PR 61) is App.jsx's: the market page opens it too. */}

      {/* NO "GO TO BUILD" BUTTON HERE (redesign PR 1): the owner's Find is the tabs, the chips, the line and the rows; the
          trade loaded on Build is one tap away on the bottom bar's Build, and a card's "Build ›" is on its market's page. */}
    </div>
  );
}

/** THE SCREEN'S STATE AS THE CHIPS READ IT (PR 66): one shape for the chip row, the sheets and the copilot's filters. */
export const findChipState = ({ find, findOrder, request, liqState = null }) => ({ order: findOrder, request, horizon: find.horizon,
  dir: find.dir, target: find.target, positiveOnly: find.positiveOnly, flagged: find.flagged, hideMisses: find.hideMisses,
  liqId: liqState && liqState.id, liqLabel: liqState && liqState.label, liqDefault: liqState && liqState.defaultId });

/* ONE ROW (round 2, the mockup's flat list): ☆ · the ticker and its direction tag · the subtitle (or the miss reason) ·
   the 72×40 picture · the figure the list is sorted by and "risk $N". The row (not the ☆) opens the market's page on
   Strategies. A miss is dim, its tag's border the line colour, its picture at 0.35. */
const ROW_CSS = `[data-row-button]:hover,[data-row-button]:active{background:${T.panel}}`;
export function MarketRow({ row, sd = null, fig, bars = NO_BARS, saved = false, onSave, onOpen, current = false }) {
  const x = row.x;
  const muted = !row.fits;
  const ink = muted ? T.dim : T.ink;
  const dir = sd ? sd.dir : null;
  return (
    <div role="listitem" data-row={row.tk} data-miss={muted ? "true" : undefined} aria-current={current ? "true" : undefined}
      style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${T.line}`, paddingLeft: 4, minWidth: 0, maxWidth: "100%",
        boxSizing: "border-box", background: current ? T.panel : "transparent" }}>
      <style>{ROW_CSS}</style>
      <IconButton onClick={onSave} pressed={saved} label={ARIA.saveTrade(saved, x.tk, x.name)} color={saved ? T.amber : T.dim}
        style={{ alignSelf: "center", fontSize: FS.lg }}>{saved ? "★" : "☆"}</IconButton>
      <button onClick={onOpen} aria-label={ARIA.openMarket(x.tk)} data-row-button
        style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, background: "transparent", border: "none",
          cursor: "pointer", padding: "10px 16px 10px 2px", textAlign: "left", minHeight: 66, borderRadius: 0 }}>
        <span style={{ flex: "1 1 0", minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <span data-row-ticker style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: ink, lineHeight: LH.tight }}>{x.tk}</span>
            {dir && <span data-row-dir style={{ ...sans, fontSize: FS.xs, lineHeight: "18px", padding: "0 6px", borderRadius: 6, whiteSpace: "nowrap",
              border: `1px solid ${muted ? T.line : T.field}`, color: muted ? T.dim : DIR_COLOR[dir] }}>{DIRECTION_TAGS[dir]}</span>}
          </span>
          <span data-row-sub style={{ ...sans, display: "block", fontSize: FS.xs, lineHeight: LH.body, color: T.mut, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {muted ? row.misses.map(missReasonLine).filter(Boolean).join(" · ") : rowSubtitleText(x.name, x.expKey)}
          </span>
        </span>
        <span aria-hidden="true" style={{ flex: "0 0 72px", width: 72, height: 40, opacity: muted ? 0.35 : 1, borderRadius: 4, overflow: "hidden" }}>
          {x.lf.bands && <BandThumbnail bands={x.lf.bands} bars={bars} width={72} height={40} lineWidth={1.5} />}
        </span>
        {/* THE DAYS AND THE RISK (PR 63): the right-hand column; the column head says "Days · risk". */}
        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: 60 }}>
          <span data-row-figure="days" style={{ ...mono, display: "block", fontSize: FS.md, fontWeight: FW.bold, color: ink,
            fontVariantNumeric: "tabular-nums", lineHeight: LH.tight }}>{rowDaysText(fig.days)}</span>
          <span style={{ ...mono, display: "block", fontSize: FS.xs, color: T.mut, fontVariantNumeric: "tabular-nums" }}>{rowRiskText(fig.risk)}</span>
        </span>
        {/* THREE FIGURES, ALWAYS (PR 63, owner 7 Oct 2026): Chance · Return on risk · Avg per $100 at risk, the card's own
            (`rowFigures()`), on a line of their own under the market; the one the list is sorted by is ringed. */}
        <span data-row-figures style={{ flex: "1 0 100%", display: "flex", flexWrap: "wrap", columnGap: 12, rowGap: 4, ...sans, fontSize: FS.xs,
          lineHeight: LH.tight, color: T.mut }}>
          {fig.items.map((it) => (
            <span key={it.tile} data-row-fig={it.tile} data-sorted={it.sorted ? "true" : undefined}
              style={{ whiteSpace: "nowrap", ...(it.sorted ? ROW_RING : null) }}>
              <b style={{ ...mono, fontVariantNumeric: "tabular-nums", color: ink }}>{it.value}</b>{it.word ? ` ${it.word}` : ""}
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}

/** A market not in yet: what it waits for, "—" for its figures, after the rows that are in. */
function WaitingRow({ tk, st }) {
  const words = st.state === "failed" ? rowFailedText(st.why) : st.state === "noBoard" ? ROW_NO_BOARD : ROW_READING[st.state];
  return (
    <div role="listitem" data-row={tk} data-waiting={st.state}
      style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 66, padding: "8px 16px 8px 52px", borderTop: `1px solid ${T.line}` }}>
      <span style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.dim }}>{tk}</span>
      <span style={{ ...sans, flex: 1, fontSize: FS.xs, color: st.state === "failed" ? T.amber : T.mut }}>{words}</span>
      <span style={{ ...mono, fontSize: FS.md, color: T.dim }}>—</span>
    </div>
  );
}

/* ====================================================================
   ONE COMPARE (PR 61, owner 7 Oct 2026: "I don't understand this button, and it does nothing"). The tick on a market's
   Strategies card selects (at most MAX_COMPARE); this sheet — Find's "Compare ›", the market page's "See them ›", Build's
   "N still ticked" — shows the ticked cards (the one picture, CompareFigure, and their rows) above "Compare the cards";
   with nothing ticked it shows the cards that fit. Its rows are `compareCards()`'s cards — the card's own figures for the
   size the budget buys, in CARD_LABELS' words, labelled C1…Cn — and the same rows, with the same labels, are what the
   copilot is handed. The old blue tray (drawn at the foot of the market page, far below the cards) is gone; its remove,
   clear and "Take to Build" are here.
==================================================================== */
export function filtersOfFind({ find, findOrder, request, liqState = null }) {
  const st = findChipState({ find, findOrder, request, liqState });
  return { order: findOrderOf(findOrder).label, category: find.cat || CATEGORY_ALL, chips: FIND_CHIPS.map((c) => chipText(c.id, st)),
    // What the Style and Debit · Credit chips mean in numbers (PR 66): the copilot reads the floors, not a style's name.
    floors: requestFloorsText(request), side: request.side || DEFAULT_NET_SIDE };
}
/** One row of the Compare sheet: its label, the card's market, structure and expiry, its figures as the card prints them. */
export function CompareRow({ card, cand = null, onUntick, onTakeToBuild }) {
  return (
    <li data-compare-row={card ? card.label : "gone"} style={{ borderTop: `1px solid ${T.line}`, padding: "10px 0", display: "grid", gap: 4 }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {card && <span data-compare-label style={{ ...mono, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{card.label}</span>}
        <span style={{ ...sans, flex: 1, minWidth: 0, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>
          {card ? `${card.ticker} · ${rowSubtitleText(card.name, card.expiry)}` : `${cand.ticker} · ${cand.name}`}
        </span>
        {cand && onUntick && (
          <IconButton size={36} label={compareUntickAria(cand.ticker, cand.name)} onClick={() => onUntick(cand)} style={{ fontSize: FS.sm }}>✕</IconButton>
        )}
      </span>
      {card ? (
        <>
          <span style={{ ...mono, fontVariantNumeric: "tabular-nums", fontSize: FS.xs, color: T.body }}>
            {`${CARD_LABELS.risk} ${card.youRisk == null ? "—" : money(card.youRisk)} · ${CARD_LABELS.profit} ${card.maxProfit == null ? "—"
              : typeof card.maxProfit === "number" ? money(card.maxProfit) : card.maxProfit} · ${CARD_LABELS.chance} ${card.chance} · ${CARD_LABELS.rr} ${card.returnOnRisk ?? "—"}`}
          </span>
          <span style={{ ...mono, fontVariantNumeric: "tabular-nums", fontSize: FS.xs, color: T.body }}>{`Future avg ${card.futureAvg} · Past yrs ${card.pastYrs}`}</span>
          {card.misses && card.misses.length > 0 && <span style={{ ...sans, fontSize: FS.xs, color: T.amber }}>{card.misses.join(" · ")}</span>}
        </>
      ) : <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{COMPARE_GONE}</span>}
      {cand && card && onTakeToBuild && (
        <span><TextBtn onClick={() => onTakeToBuild(cand)} style={{ padding: 0 }}>{BUILD_CTA}</TextBtn></span>
      )}
    </li>
  );
}
export function CompareSheet({ open, onClose, cmp, rows = [], ticked = [], note = null, copilot = null, filters = null, onUntick, onClear, onTakeToBuild }) {
  const tickedMode = ticked.length > 0;
  const ask = useCopilot({ ...(copilot || { convo: null, setConvo: () => {} }),
    ctx: { ...((copilot && copilot.ctx) || {}), findCards: cmp.cards, findMisses: cmp.misses, findFilters: filters } });
  const askAll = { ...ask, clear: () => copilot && copilot.setConvo({ msgs: [], busy: false, err: null }) };
  return (
    <Sheet open={open} title={COMPARE_SHEET_TITLE} onClose={onClose}>
      <div data-find-copilot data-compare-sheet style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tickedMode && (ticked.length >= 2 ? <CompareFigure items={ticked} height={260} /> : <Note>{COMPARE_ONE_MORE}</Note>)}
        <Note color={T.mut} data-compare-count>
          {tickedMode ? compareTickedLine(ticked.length) : `${compareCountLine(cmp.fitting, cmp.markets)} ${findCopilotLine(cmp.cards.length, cmp.fitting)}`}
        </Note>
        {note && <Note color={T.amber} role="status">{note}</Note>}
        <ul data-compare-rows style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((r, i) => <CompareRow key={r.card ? r.card.label : `gone-${i}`} card={r.card} cand={r.cand} onUntick={onUntick} onTakeToBuild={onTakeToBuild} />)}
        </ul>
        {tickedMode && <span><TextBtn onClick={onClear} style={{ padding: 0 }}>{COMPARE_CLEAR}</TextBtn></span>}
        {copilot && (
          <CopilotSection ask={askAll} skills={skillsFor("find")} label={FIND_COPILOT_HEAD} heading={FIND_COPILOT_HEAD}
            ownLabel="Your own question about these cards" />
        )}
      </div>
    </Sheet>
  );
}

/** The five steps for one row, each { value, text } read from its own function (the ⓘ beside the column head). */
function howConnectSteps(x, sd, size) {
  const f = x.fused;
  const ft = futureTile(futureFigures(x.lf.mc, x.lf.aFill, size && size.ok ? size.n : null, x.expKey));
  return [
    { value: f ? `${f.score >= 0 ? "+" : "−"}${Math.abs(f.score)}` : null, text: f ? "How it is worked out is below." : "Still being read." },
    { value: f ? String(f.confidence) : null, text: f ? "Of 100. How it is worked out is below." : "Still being read." },
    { value: null, text: sd ? sd.why : "Still being read." },
    { value: null, text: `${x.name} (${x.sent}) · ${size && size.ok ? sizeLine(size) : "not sized"}` },
    { value: chanceText(x.lf.pop), text: `${CARD_LABELS.chance.toLowerCase()} (${x.lf.mc ? chanceBasisLabel(x.lf.mc) : "not worked out"}) · future avg ${ft.value}${ft.lines.length ? `, ${ft.lines.join(", ")}` : ""}` },
  ];
}

/** "Reading 10 markets · 3 done …" and a 3px bar of how many are in (the mockup "Find · loading"). */
function ReadingLine({ text, frac }) {
  return (
    <div role="status" data-find-reading style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 16px 8px" }}>
      <span style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>{text}</span>
      <span aria-hidden="true" style={{ display: "block", height: 3, borderRadius: 2, background: T.line, overflow: "hidden" }}>
        <span style={{ display: "block", height: 3, width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`, background: T.amber }} />
      </span>
    </div>
  );
}

/** The mockups' two action buttons (Find's states, Saved): amber primary or a quiet outline, 13 bold, 44 tall. */
export function ActionBtn({ primary = false, onClick, children, style, ...rest }) {
  return (
    <button onClick={onClick} {...rest} style={{ ...sans, minHeight: TAP, padding: "0 16px", borderRadius: 10, cursor: "pointer", fontSize: FS.sm,
      fontWeight: FW.bold, lineHeight: LH.tight, color: primary ? T.onAccent : T.ink, background: primary ? T.amber : "transparent",
      border: primary ? "none" : `1px solid ${T.field}`, ...style }}>{children}</button>
  );
}
