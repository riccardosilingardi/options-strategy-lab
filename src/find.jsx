// ============================================================================
// src/find.jsx — STEP 1, FIND, VERSION B: ONE ROW PER MARKET, EVERY CONTROL IN ONE ROW OF CHIPS (redesign PR 1, TASK 2;
// the owner's mockups and answers, 4 Oct 2026). Before: PR #40's one request block over one list of cards (PR #45 moved
// it out of App.jsx; PR #49 made it one sorted list with the misses in place).
//
// TOP TO BOTTOM: the category tabs "All · Grains · Energy · Metals" (counted from markets.js, they only filter what is
// shown); ONE row of chips — ⇅ Order · Budget · Chance · Return · Horizon · Direction · Avg > 0 · Liquidity — each
// showing its value and filled when off its default; one summary line ("4 of 10 fit · 6 dimmed", Hide them / Show
// them, Reset); the column head "Market … <the sorted-by figure> · risk ⓘ"; then ONE ROW PER MARKET. ("Find", the
// gear and the Results | Saved segment sit above, in App.jsx, because Saved shares them.)
//
// >>> THE ROWS ARE A VIEW OF THE ONE SORTED LIST, NOT A SECOND LIST. <<< `marketRows()` (src/rows.js) groups
// `findShown` — the list findGen built and the owner's order sorted — by market: a row's card is the market's first
// card that fits, in the chosen order, else its first card as a miss (quieter, the reason in place of its subtitle).
// No new ranking, no new simulation. A row's figure is its card's tile (`rowFigure()`, held equal by figures.test.jsx).
// Tapping a row opens the market's page on Strategies (market.jsx), where its cards are.
//
// >>> EVERY CHIP BUT "Avg > 0" OPENS A SHEET HOLDING THE EXISTING CONTROL, BEHAVIOUR UNCHANGED. <<< The sliders still
// move `request`, which this file reads: it filters and sizes, and never simulates (`scripts/measure-find.mjs`; the
// memo-deps check in find.test.jsx). Every sheet ends with a live "Show N of M". "Show flagged" lives in the Order
// sheet and the "why" fold in the Liquidity sheet (owner, 4 Oct 2026).
//
// WHAT IS PASSED IN AS A FUNCTION OR A NODE is what lives in App.jsx's closures (the liquidity filter, Save, opening a
// market): passing them is the price of not importing App.jsx back, which would be a cycle.
// ============================================================================
import React, { useCallback, useMemo } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Panel, Label, Stat, Note, Fold, CheckField, Sheet, IconButton, FilterChip, UnderTabs, TextBtn, SegmentBar, TAP } from "./ui.jsx";
import { FIND_ORDERS, DEFAULT_FIND_ORDER, findOrderOf } from "./signals.js";
import { RequestControls, CompareTray, NumbersFit } from "./card.jsx";
import { HowWorkedOut } from "./why.jsx";
import { MARKET_CATEGORIES, BASKET } from "./markets.js";
import { CompareFigure, BandThumbnail } from "./visuals.jsx";
import { scaleStrategy } from "./pro.jsx";
import { legsLine, MAX_COMPARE } from "./path.js";
import { marketRows, rowCounts, rowFigure, rowStateOf } from "./rows.js";
import { money, chanceText, NO_CEILING, noCeilingNote, noCeilingRankNote, seasonalStampNote,
  filterFold, qualityFloorLine, qualityFloorSentence, liquiditySettingNote, looseningWarning, isLoosened,
  unpriceableNote, impossibleLossNote, modelDisagreementNote, wideSpreadNote, wideComboNote, crossingNote,
  liquiditySkippedNote, spreadSkippedNote, comboSpreadSkippedNote, horizonFloorNote, perTradeCapLabel,
  nothingTodayLine, staleBoardLine, sizedFree, sizeLine, controlReadings, chanceBasisLabel, futureFigures, futureTile,
  POSITIVE_FUTURE_TOGGLE, rowsResultsLine, missReasonLine, nothingFits, nothingFitsLine, allMissLine, overLimitNote,
  showMissesCta, RESET_ALL_FILTERS, CATEGORY_ALL, FIND_CHIPS, FIND_SHEET_TITLES, chipText, chipOffDefault, anyChipOff,
  showRowsCta, HIDE_ROWS, SHOW_ROWS, RESET_FILTERS, COLUMN_MARKET, columnHeadText, rowRiskText, DIRECTION_TAGS,
  rowSubtitleText, ROW_READING, findReadingLine, rowFailedText, ROW_NO_BOARD, staleBannerLine, RETRY,
  SHOW_FLAGGED_TOGGLE, howConnectLabel, HOW_CONNECT_STEPS, CARD_LABELS, ARIA,
  FIND_HEADING, refreshAria, SETTINGS_WORD, FIND_SEGMENTS_ARIA,
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
/** One empty list, so a market with no bars yet hands every row the SAME array and a memoised picture stays put. */
const NO_BARS = [];
/** A direction's colour: red is for errors only, so a bear reading is violet. */
const DIR_COLOR = { bull: T.green, bear: T.violet, neutral: T.mut };

/* FIND'S OWN HEADER (round 2, mockup "Find B"): "Find", ↻ and the gear; the status line (or the stale banner); Results |
   Saved. Nothing else sits above Find's list — the desk header is not drawn on Find, Saved or a market's page. */
export function FindHeader({ seg = "results", onSeg, savedN = 0, nMarkets = 0, busy = false, onRefresh, onSettings, settingsOn = false,
  status = null, stale = null }) {
  return (
    <header data-find-header>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 8px 0 16px" }}>
        <h1 data-view-heading tabIndex={-1} style={{ ...sans, flex: 1, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
          margin: 0, outline: "none" }}>{FIND_HEADING}</h1>
        <IconButton label={refreshAria(nMarkets)} onClick={onRefresh} disabled={busy} aria-busy={busy || undefined}>
          <RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label={SETTINGS_WORD} pressed={settingsOn} onClick={onSettings}>
          <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
      {stale && stale.stale ? (
        /* STALE: the status line becomes round 1's banner, with Retry (the same Refresh). */
        <div role="status" data-stale style={{ ...sans, fontSize: FS.xs, lineHeight: LH.body, color: T.ink, margin: "2px 16px 6px", padding: "6px 6px 6px 12px",
          border: `1px solid ${T.amber}`, borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 0 }}>{staleBannerLine({ closeDay: stale.closeDay, failedAt: stale.failedAt })}</span>
          <TextBtn color={T.amber} height={TAP} onClick={stale.onRetry} style={{ fontWeight: FW.bold }}>{RETRY}</TextBtn>
        </div>
      ) : (
        <div data-find-status style={{ ...sans, fontSize: FS.xs, color: T.mut, padding: "0 16px 6px", lineHeight: LH.body }}>{status}</div>
      )}
      <SegmentBar label={FIND_SEGMENTS_ARIA} value={seg} onChange={onSeg} style={{ margin: "0 16px 6px" }}
        items={[{ id: "results", label: "Results" }, { id: "saved", label: "Saved", count: savedN }]} />
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
  compare, showCompare, compareNote, onTickCompare, onClearCompare, onToggleCompare, onTakeToBuild,
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

  const st = { order: findOrder, request, horizon: find.horizon, dir: find.dir,
    dirLabel: (sentiments.find((s) => s.id === find.dir) || {}).label, positiveOnly: find.positiveOnly, flagged: find.flagged,
    liqId: liqState && liqState.id, liqLabel: liqState && liqState.label, liqDefault: liqState && liqState.defaultId };
  const sheetId = sheet && String(sheet).startsWith("find:") ? String(sheet).slice(5) : null;
  const closeSheet = () => onSheet(null);
  /** A sheet's current value, beside its title (round 2): the chip's own value. */
  const sheetValue = (id) => { const p = chipParts(id, chipText(id, st)); return p.value || p.name; };
  // Every sheet ends with a live "Show N of M": full width, amber, 48px (the mockups).
  const footer = <Btn color={T.amber} onClick={closeSheet} style={{ width: "100%", minHeight: 48, borderRadius: 10, fontSize: FS.md }}>{showRowsCta(n, rows.length)}</Btn>;
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
        {FIND_CHIPS.map((c) => ({ c, txt: chipText(c.id, st) })).map(({ c, txt }) => {
          const parts = chipParts(c.id, txt);
          return (
            <FilterChip key={c.id} off={chipOffDefault(c.id, st)} strong={c.id === "order"} name={parts.name} value={parts.value} valueMono={parts.mono}
              label={c.sheet ? `${txt}: change` : POSITIVE_FUTURE_TOGGLE}
              onClick={() => (c.sheet ? onSheet(`find:${c.id}`) : setFind((f) => ({ ...f, positiveOnly: !f.positiveOnly })))}>
              {c.id === "positive" && positiveHidden ? <span style={mono}>{` · ${positiveHidden}`}</span> : null}
            </FilterChip>
          );
        })}
      </div>

      {/* THE SUMMARY LINE: "4 of 10 fit · 6 dimmed" left; Hide them / Show them and Reset right. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", padding: "0 12px 2px 16px", minHeight: 36 }}>
        <span aria-live="polite" style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{rowsResultsLine(n, m, !!find.hideMisses)}</span>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {m > 0 && <TextBtn onClick={() => setFind((f) => ({ ...f, hideMisses: !f.hideMisses }))}>{find.hideMisses ? SHOW_ROWS : HIDE_ROWS}</TextBtn>}
          {anyChipOff(st) && <TextBtn onClick={onReset}>{RESET_FILTERS}</TextBtn>}
        </span>
      </div>
      {/* While markets are still being read and some rows are in (with none in, "Nothing today" below says it). */}
      {reading && findGen.items.length > 0 && <Note color={T.dim} role="status" style={pad}>{findReadingLine(find.markets.length, doneN)}</Note>}

      {/* SIGNALS THAT LANDED AND ADDED A FAMILY, one line each (PR #48, TASK 3). */}
      {signalLines.length > 0 && <Note color={T.blue} role="status" style={{ ...pad, marginTop: 4 }}>{signalLines.join(" · ")}</Note>}

      {/* A STALE BOARD IS SAID ONCE, ABOVE THE ROWS (PR #41, TASK 2). (A stale FEED is the header's banner, round 2.) */}
      {findGen.stale.length > 0 && <Note color={T.amber} style={{ ...pad, marginTop: 6 }}>⚠ {staleBoardLine(findGen.stale)}</Note>}

      {/* "NOTHING TODAY" ONLY WHEN ZERO CANDIDATES PASS THE FLOORS, WITH THE COUNTS. */}
      {findGen.items.length === 0 && (
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, margin: "10px 16px", lineHeight: LH.body, padding: "10px 12px", border: `1px dashed ${T.line}`, borderRadius: 10 }}>
          {nothingTodayLine(findGen.tally, { noBoard: findGen.noBoard, loading: findGen.loading, failed: findGen.failed, level: liqLevel })}
        </div>
      )}

      {/* NOTHING FITS: the filter that binds, the cheapest card here, ONE fix that never passes a limit. */}
      {nf && (
        <div role="status" style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.ink, margin: "8px 16px", padding: "10px 12px",
          border: `1px solid ${T.line}`, background: T.panel, borderRadius: 10 }}>
          <div style={{ fontWeight: FW.bold }}>{nothingFitsLine(nf.control)}</div>
          <div style={{ color: T.mut }}>{allMissLine(rows.length, nf.cheapest)}</div>
          {nf.overLimit != null && <div style={{ color: T.amber }}>{overLimitNote(nf.overLimit)}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {nf.fix ? <Btn small color={T.amber} onClick={() => onRequest(nf.fix.patch)}>{nf.fix.label}</Btn>
              : <Btn small color={T.amber} onClick={onReset}>{RESET_ALL_FILTERS}</Btn>}
            {find.hideMisses && <Btn small ghost color={T.blue} onClick={() => setFind((f) => ({ ...f, hideMisses: false }))}>{showMissesCta(m)}</Btn>}
          </div>
        </div>
      )}

      {/* THE COLUMN HEAD, and the ⓘ "How <TK>'s numbers connect" for the top row's market (a sheet, round 2). */}
      {(shown.length > 0 || waiting.length > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 36, padding: "0 8px 0 16px",
          borderTop: `1px solid ${T.line}`, ...sans, fontSize: FS.xs, color: T.mut }}>
          <span>{COLUMN_MARKET}</span>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {columnHeadText(findOrder)}
            {top && <IconButton size={36} color={T.blue} label={howConnectLabel(top.tk)} aria-expanded={sheetId === "connect"}
              onClick={() => onSheet("find:connect")} style={{ fontSize: FS.md }}>ⓘ</IconButton>}
          </span>
        </div>
      )}

      <div role="list" aria-label={ARIA.markets} data-find-list>
        {shown.map((r) => (
          <MarketRow key={r.tk} row={r} sd={(findGen.boards[r.tk] || {}).signal || null}
            fig={rowFigure(r.x, sizes.get(r.x.key) || null, findOrder)} bars={barsCache[r.tk] || NO_BARS}
            saved={isSaved(r.x.cand)} onSave={() => onSave(r.x)} onOpen={() => onOpenMarket(r.tk)} />
        ))}
        {waiting.map((w) => <WaitingRow key={w.tk} tk={w.tk} st={w.st} />)}
      </div>

      {/* "HOW <TK>'S NUMBERS CONNECT": five numbered steps, each number read from its own function — the score and the
          confidence (HowWorkedOut), the direction (`signalDirection()`'s own arithmetic), the strategy (its family and
          the size the budget buys), the chance and the future avg (the card's own figures) — then "How the numbers fit".
          A sheet since round 2 (the mockups); one tap away, so the word counter does not score it at rest. */}
      <Sheet open={sheetId === "connect" && !!top} title={top ? howConnectLabel(top.tk) : ""} onClose={closeSheet}>
        {top && (
          <div style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {howConnectSteps(top.x, (findGen.boards[top.tk] || {}).signal || null, sizes.get(top.x.key) || null).map((t, i) => (
                <li key={HOW_CONNECT_STEPS[i]} style={{ marginTop: 4 }}><b>{HOW_CONNECT_STEPS[i]}.</b> {t}</li>
              ))}
            </ol>
            {top.x.fused && <HowWorkedOut fused={top.x.fused} />}
            <span style={{ display: "block", marginTop: 6 }}><NumbersFit order={findOrder} /></span>
          </div>
        )}
      </Sheet>

      {/* ---- THE SHEETS, one at a time, from `deskSheet` (Back closes them). ---- */}
      <Sheet open={sheetId === "order"} title={FIND_SHEET_TITLES.order} value={sheetValue("order")} onClose={closeSheet} footer={footer}>
        <div role="radiogroup" aria-label={FIND_SHEET_TITLES.order}>
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
        <CheckField checked={find.flagged} onChange={(e) => setFind((f) => ({ ...f, flagged: e.target.checked }))} style={{ marginTop: 8 }}>
          {SHOW_FLAGGED_TOGGLE}{flaggedHidden ? ` (${flaggedHidden} hidden)` : ""}
        </CheckField>
      </Sheet>
      <Sheet open={sheetId === "budget"} title={FIND_SHEET_TITLES.budget} value={sheetValue("budget")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["size"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "chance"} title={FIND_SHEET_TITLES.chance} value={sheetValue("chance")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["chance"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "return"} title={FIND_SHEET_TITLES.return} value={sheetValue("return")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["return"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "horizon"} title={FIND_SHEET_TITLES.horizon} value={sheetValue("horizon")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["horizon"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "direction"} title={FIND_SHEET_TITLES.direction} value={sheetValue("direction")} onClose={closeSheet} footer={footer}>
        <RequestControls only={["direction"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "liquidity"} title={FIND_SHEET_TITLES.liquidity} value={sheetValue("liquidity")} onClose={closeSheet} footer={footer}>
        {foldedNode}
        {/* EVERYTHING THAT EXPLAINS THE LIST, BEHIND ONE "why" (moved here from under the list, owner, 4 Oct 2026). */}
        <Fold label="why" tone={isLoosened(liqLevel) ? T.red : T.dim} style={{ marginTop: 10 }}
          summary={fold.summary || `${qualityFloorLine(liqLevel)} Nothing was removed.`}>
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
          {/* CONFLICT IS LAST ONLY UNDER "FUTURE AVG + SIGNAL" (PR #48). */}
          <Note color={T.dim} style={{ marginTop: 6 }}>Under {findOrderOf("evSignal").label}, CONFLICT markets sort last.</Note>
          <Note color={isLoosened(liqLevel) ? T.red : T.dim} style={{ marginTop: 6 }}>
            {liquiditySettingNote(liqLevel, { ...t, kept: findGen.items.length })}
          </Note>
          {isLoosened(liqLevel) && <Note color={T.red} style={{ marginTop: 6 }}>{looseningWarning(liqLevel)}</Note>}
          <Note color={T.dim} style={{ marginTop: 8 }}>{qualityFloorSentence(liqLevel)}</Note>
          <Note color={T.dim} style={{ marginTop: 6 }}>
            {`${limits.answered ? "Your" : "The suggested"} per-trade limit: ${money(limits.perTradeLimit)} (${perTradeCapLabel()}).`} Budget is the most you will pay, taken from live prices. For trades where you receive money up front, the limit becomes the capital tied up instead. Chance is the probability of ending in profit at expiry.
          </Note>
        </Fold>
      </Sheet>

      {/* COMPARING — up to three, one picture (PRD §6). The ticks are on the market page's cards. */}
      <ComparePanel compare={compare} showCompare={showCompare} compareNote={compareNote} onTickCompare={onTickCompare}
        onClearCompare={onClearCompare} onToggleCompare={onToggleCompare} onTakeToBuild={onTakeToBuild} />

      {/* NO "GO TO BUILD" BUTTON HERE (redesign PR 1): the owner's Find is the tabs, the chips, the line and the rows; the
          trade loaded on Build is one tap away on the bottom bar's Build, and a card's "Build ›" is on its market's page. */}
    </div>
  );
}

/** A chip's words, split for the filter chip (round 2): a name in mut and a value in ink ("Budget $500" → Budget · $500;
 *  "Chance any" → Chance · any). "⇅ Future avg", "Signals decide" and "Avg > 0" stay whole. Never new words: the text is
 *  `chipText()`'s. `mono` says whether the value is a figure (then it is set in mono). */
export function chipParts(id, txt) {
  const t = String(txt || "");
  const sp = t.indexOf(" ");
  if (["order", "direction", "positive"].includes(id) || sp < 0) return { name: t, value: null, mono: false };
  const value = t.slice(sp + 1);
  return { name: t.slice(0, sp), value, mono: /\d/.test(value) };
}

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
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none",
          cursor: "pointer", padding: "8px 16px 8px 4px", textAlign: "left", minHeight: 66, borderRadius: 0 }}>
        <span style={{ flex: "1 1 0", minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <span style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: ink, lineHeight: LH.tight }}>{x.tk}</span>
            {dir && <span style={{ ...sans, fontSize: FS.xs, lineHeight: "18px", padding: "0 6px", borderRadius: 6, whiteSpace: "nowrap",
              border: `1px solid ${muted ? T.line : T.field}`, color: muted ? T.dim : DIR_COLOR[dir] }}>{DIRECTION_TAGS[dir]}</span>}
          </span>
          <span style={{ ...sans, display: "block", fontSize: FS.xs, lineHeight: LH.body, color: T.mut, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {muted ? row.misses.map(missReasonLine).filter(Boolean).join(" · ") : rowSubtitleText(x.name, x.expKey)}
          </span>
        </span>
        <span aria-hidden="true" style={{ flex: "0 0 72px", width: 72, height: 40, opacity: muted ? 0.35 : 1, borderRadius: 4, overflow: "hidden" }}>
          {x.lf.bands && <BandThumbnail bands={x.lf.bands} bars={bars} width={72} height={40} lineWidth={1.5} />}
        </span>
        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: 60 }}>
          <span data-row-figure={fig.tile} style={{ ...mono, display: "block", fontSize: FS.md, fontWeight: FW.bold, color: ink,
            fontVariantNumeric: "tabular-nums", lineHeight: LH.tight }}>{fig.value}</span>
          <span style={{ ...mono, display: "block", fontSize: FS.xs, color: T.mut, fontVariantNumeric: "tabular-nums" }}>{rowRiskText(fig.risk)}</span>
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

/** The compare tray and the side-by-side picture: on Find and on the market page (redesign PR 1). */
export function ComparePanel({ compare, showCompare, compareNote, onTickCompare, onClearCompare, onToggleCompare, onTakeToBuild }) {
  return (
    <>
      <CompareTray items={compare} max={MAX_COMPARE} note={compareNote}
        onRemove={onTickCompare} onClear={onClearCompare} onCompare={onToggleCompare} showing={showCompare} />
      {showCompare && compare.length >= 2 && (
        <Panel style={{ marginTop: 10 }}>
          <Label>{compare.length} SIDE BY SIDE · SAME AXIS, SAME PICTURE</Label>
          <div style={{ marginTop: 10 }}>
            <CompareFigure items={compare} height={300} />
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {compare.map((c, i) => (
              <div key={c.key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: [T.blue, T.amber, T.violet][i], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ ...sans, fontWeight: FW.bold, color: T.ink, fontSize: FS.sm }}>{c.ticker} · {c.name}</div>
                  <div style={{ ...mono, fontSize: FS.xs, color: T.dim }}>{legsLine(c.legs)} · per contract</div>
                </div>
                <Stat k="RISK" v={money(Math.abs(c.risk))} c={T.red} />
                <Stat k="MAX PROFIT" v={c.maxProfit == null ? NO_CEILING : money(c.maxProfit)} c={T.green}
                  tip={c.maxProfit == null ? noCeilingNote(c.name) : undefined} />
                <Stat k="CHANCE" v={chanceText(c.pop)} c={(c.pop || 0) >= 0.5 ? T.green : T.violet} tip={seasonalStampNote(c, c.ticker || "this market")} />
                <Btn small onClick={() => onTakeToBuild(c)}>Take to Build →</Btn>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

/** The five steps' numbers for one row, each read from its own function (the ⓘ beside the column head). */
function howConnectSteps(x, sd, size) {
  const f = x.fused;
  const ft = futureTile(futureFigures(x.lf.mc, x.lf.aFill, size && size.ok ? size.n : null, x.expKey));
  return [
    f ? `${f.score >= 0 ? "+" : "−"}${Math.abs(f.score)} (how, below)` : "still being read",
    f ? `${f.confidence} of 100 (how, below)` : "still being read",
    sd ? sd.why : "still being read",
    `${x.name} (${x.sent}) · ${size && size.ok ? sizeLine(size) : "not sized"}`,
    `${CARD_LABELS.chance.toLowerCase()} ${chanceText(x.lf.pop)} (${x.lf.mc ? chanceBasisLabel(x.lf.mc) : "not worked out"}) · future avg ${ft.value}${ft.lines.length ? `, ${ft.lines.join(", ")}` : ""}`,
  ];
}
