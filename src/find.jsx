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
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Chip, Panel, Label, Stat, Note, Fold, CheckField, Info, Sheet, TAP } from "./ui.jsx";
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
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
/** One empty list, so a market with no bars yet hands every row the SAME array and a memoised picture stays put. */
const NO_BARS = [];
/** A direction's colour: red is for errors only, so a bear reading is violet. */
const DIR_COLOR = { bull: T.green, bear: T.violet, neutral: T.mut };

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
  const { n, m } = rowCounts(rows);
  const shown = find.hideMisses ? rows.filter((r) => r.fits) : rows;
  const nf = useMemo(() => (rows.length && n === 0 ? nothingFits(cands, request, sizeOf) : null), [rows.length, n, cands, request, sizeOf]);

  const st = { order: findOrder, request, horizon: find.horizon, dir: find.dir,
    dirLabel: (sentiments.find((s) => s.id === find.dir) || {}).label, positiveOnly: find.positiveOnly, flagged: find.flagged,
    liqId: liqState && liqState.id, liqLabel: liqState && liqState.label, liqDefault: liqState && liqState.defaultId };
  const sheetId = sheet && String(sheet).startsWith("find:") ? String(sheet).slice(5) : null;
  const closeSheet = () => onSheet(null);
  const footer = <Btn color={T.blue} onClick={closeSheet} style={{ width: "100%" }}>{showRowsCta(n, rows.length)}</Btn>;
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

  return (
    <div style={{ marginTop: 8, maxWidth: 1280 }}>
      {/* THE CATEGORY TABS — the registry's own counts (markets.js), never a typed list. They only filter what is shown. */}
      <div role="group" aria-label={ARIA.categories} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <Chip on={!find.cat} color={T.blue} onClick={() => setFind((f) => ({ ...f, cat: null }))}>
          {CATEGORY_ALL} <span style={mono}>{BASKET.length}</span>
        </Chip>
        {MARKET_CATEGORIES.map((c) => (
          <Chip key={c.id} on={find.cat === c.id} color={T.blue} onClick={() => setFind((f) => ({ ...f, cat: find.cat === c.id ? null : c.id }))}>
            {c.id} <span style={mono}>{c.tickers.length}</span>
          </Chip>
        ))}
      </div>

      {/* ONE ROW OF CHIPS, scrolling sideways. Each says its value; one off its default is filled. */}
      <div role="toolbar" aria-label={ARIA.filters} data-chip-row
        style={{ display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap", marginTop: 8, paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {FIND_CHIPS.map((c) => ({ c, txt: chipText(c.id, st) })).map(({ c, txt }) => (
          <Chip key={c.id} on={chipOffDefault(c.id, st)} color={T.amber} style={{ flex: "0 0 auto" }}
            label={c.sheet ? `${txt}: change` : POSITIVE_FUTURE_TOGGLE}
            onClick={() => (c.sheet ? onSheet(`find:${c.id}`) : setFind((f) => ({ ...f, positiveOnly: !f.positiveOnly })))}>
            {txt}{c.id === "positive" && positiveHidden ? <span style={mono}>{` · ${positiveHidden}`}</span> : null}
          </Chip>
        ))}
      </div>

      {/* THE SUMMARY LINE: "4 of 10 fit · 6 dimmed", Hide them / Show them, Reset. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <span aria-live="polite" style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>
          {rowsResultsLine(n, m, !!find.hideMisses)}
        </span>
        {m > 0 && (
          <Btn small ghost color={T.blue} onClick={() => setFind((f) => ({ ...f, hideMisses: !f.hideMisses }))}>
            {find.hideMisses ? SHOW_ROWS : HIDE_ROWS}
          </Btn>
        )}
        {anyChipOff(st) && <Btn small ghost color={T.dim} onClick={onReset}>{RESET_FILTERS}</Btn>}
      </div>
      {/* While markets are still being read and some rows are in (with none in, "Nothing today" below says it). */}
      {reading && findGen.items.length > 0 && <Note color={T.dim} role="status">{findReadingLine(find.markets.length, doneN)}</Note>}

      {/* SIGNALS THAT LANDED AND ADDED A FAMILY, one line each (PR #48, TASK 3). */}
      {signalLines.length > 0 && <Note color={T.blue} role="status" style={{ marginTop: 4 }}>{signalLines.join(" · ")}</Note>}

      {/* STALE: Find's freshness line as a banner, with Retry (the existing Refresh). */}
      {freshness && freshness.stale && (
        <div role="status" style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.ink, marginTop: 8, padding: "8px 12px",
          border: `1px solid ${T.amber}`, borderRadius: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 220px" }}>{staleBannerLine({ closeDay: freshness.closeDay, failedAt: freshness.failedAt })}</span>
          <Btn small color={T.amber} onClick={freshness.onRetry}>{RETRY}</Btn>
        </div>
      )}

      {/* A STALE BOARD IS SAID ONCE, ABOVE THE ROWS (PR #41, TASK 2). */}
      {findGen.stale.length > 0 && <Note color={T.amber} style={{ marginTop: 6 }}>⚠ {staleBoardLine(findGen.stale)}</Note>}

      {/* "NOTHING TODAY" ONLY WHEN ZERO CANDIDATES PASS THE FLOORS, WITH THE COUNTS. */}
      {findGen.items.length === 0 && (
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 10, lineHeight: LH.body, padding: "10px 12px", border: `1px dashed ${T.line}`, borderRadius: 8 }}>
          {nothingTodayLine(findGen.tally, { noBoard: findGen.noBoard, loading: findGen.loading, failed: findGen.failed, level: liqLevel })}
        </div>
      )}

      {/* NOTHING FITS: the filter that binds, the cheapest card here, ONE fix that never passes a limit. */}
      {nf && (
        <div role="status" style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.ink, marginTop: 10, padding: "10px 12px",
          border: `1px solid ${T.line}`, borderRadius: 8 }}>
          <div style={{ fontWeight: FW.bold }}>{nothingFitsLine(nf.control)}</div>
          <div>{allMissLine(rows.length, nf.cheapest)}</div>
          {nf.overLimit != null && <div style={{ color: T.amber }}>{overLimitNote(nf.overLimit)}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {nf.fix ? <Btn small color={T.blue} onClick={() => onRequest(nf.fix.patch)}>{nf.fix.label}</Btn>
              : <Btn small color={T.blue} onClick={onReset}>{RESET_ALL_FILTERS}</Btn>}
            {find.hideMisses && <Btn small ghost color={T.blue} onClick={() => setFind((f) => ({ ...f, hideMisses: false }))}>{showMissesCta(m)}</Btn>}
          </div>
        </div>
      )}

      {/* THE COLUMN HEAD, and the ⓘ "How <TK>'s numbers connect" for the top row's market. */}
      {(shown.length > 0 || waiting.length > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10,
          ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", color: T.dim }}>
          <span>{COLUMN_MARKET}</span>
          <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {columnHeadText(findOrder)}
            {/* "HOW <TK>'S NUMBERS CONNECT": five numbered steps, each number read from its own function — the score and
                the confidence (HowWorkedOut), the direction (`signalDirection()`'s own arithmetic), the strategy (its
                family and the size the budget buys), the chance and the future avg (the card's own figures) — then
                "How the numbers fit". One tap away, written inside the ⓘ. */}
            {top && <Info label={howConnectLabel(top.tk)}>
              <span style={{ display: "block" }}>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {howConnectSteps(top.x, (findGen.boards[top.tk] || {}).signal || null, sizes.get(top.x.key) || null).map((t, i) => (
                    <li key={HOW_CONNECT_STEPS[i]} style={{ marginTop: 4 }}><b>{HOW_CONNECT_STEPS[i]}.</b> {t}</li>
                  ))}
                </ol>
                {top.x.fused && <HowWorkedOut fused={top.x.fused} />}
                <span style={{ display: "block", marginTop: 6 }}><NumbersFit order={findOrder} /></span>
              </span>
            </Info>}
          </span>
        </div>
      )}

      <div role="list" aria-label={ARIA.markets} style={{ marginTop: 4, display: "grid", gap: 6 }}>
        {shown.map((r) => (
          <MarketRow key={r.tk} row={r} sd={(findGen.boards[r.tk] || {}).signal || null}
            fig={rowFigure(r.x, sizes.get(r.x.key) || null, findOrder)} bars={barsCache[r.tk] || NO_BARS}
            saved={isSaved(r.x.cand)} onSave={() => onSave(r.x)} onOpen={() => onOpenMarket(r.tk)} />
        ))}
        {waiting.map((w) => <WaitingRow key={w.tk} tk={w.tk} st={w.st} />)}
      </div>

      {/* ---- THE SHEETS, one at a time, from `deskSheet` (Back closes them). ---- */}
      <Sheet open={sheetId === "order"} title={FIND_SHEET_TITLES.order} onClose={closeSheet} footer={footer}>
        <div role="radiogroup" aria-label={FIND_SHEET_TITLES.order} style={{ display: "grid", gap: 6 }}>
          {FIND_ORDERS.map((o) => (
            <button key={o.id} role="radio" aria-checked={findOrder === o.id}
              onClick={() => { if (onFindOrder) onFindOrder(o.id); closeSheet(); }}
              style={{ ...sans, textAlign: "left", minHeight: TAP, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                border: `1.5px solid ${findOrder === o.id ? T.blue : T.line}`, background: findOrder === o.id ? `${T.blue}22` : "transparent", color: T.ink }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold }}>{o.label}</div>
              <div style={{ fontSize: FS.xs, color: T.mut }}>{o.note}</div>
            </button>
          ))}
        </div>
        <CheckField checked={find.flagged} onChange={(e) => setFind((f) => ({ ...f, flagged: e.target.checked }))} style={{ marginTop: 8 }}>
          {SHOW_FLAGGED_TOGGLE}{flaggedHidden ? ` (${flaggedHidden} hidden)` : ""}
        </CheckField>
      </Sheet>
      <Sheet open={sheetId === "budget"} title={FIND_SHEET_TITLES.budget} onClose={closeSheet} footer={footer}>
        <RequestControls only={["size"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "chance"} title={FIND_SHEET_TITLES.chance} onClose={closeSheet} footer={footer}>
        <RequestControls only={["chance"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "return"} title={FIND_SHEET_TITLES.return} onClose={closeSheet} footer={footer}>
        <RequestControls only={["return"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "horizon"} title={FIND_SHEET_TITLES.horizon} onClose={closeSheet} footer={footer}>
        <RequestControls only={["horizon"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "direction"} title={FIND_SHEET_TITLES.direction} onClose={closeSheet} footer={footer}>
        <RequestControls only={["direction"]} {...sharedControls} />
      </Sheet>
      <Sheet open={sheetId === "liquidity"} title={FIND_SHEET_TITLES.liquidity} onClose={closeSheet} footer={footer}>
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

/* ONE ROW: ☆ · the ticker and its direction · the subtitle (or the miss reason) · the 72×40 picture · the figure the
   list is sorted by and "risk $N". The row (not the ☆) opens the market's page on Strategies. */
export function MarketRow({ row, sd = null, fig, bars = NO_BARS, saved = false, onSave, onOpen, current = false }) {
  const x = row.x;
  const muted = !row.fits;
  const ink = muted ? T.mut : T.ink;
  const dir = sd ? sd.dir : null;
  return (
    <div role="listitem" data-row={row.tk} data-miss={muted ? "true" : undefined} aria-current={current ? "true" : undefined}
      style={{ display: "flex", alignItems: "stretch", gap: 4, background: T.bg, borderRadius: 8,
        border: `${current ? 2 : 1}px ${muted ? "dashed" : "solid"} ${current ? T.blue : T.line}` }}>
      <button onClick={onSave} aria-pressed={saved} aria-label={ARIA.saveTrade(saved, x.tk, x.name)}
        style={{ ...sans, fontSize: FS.md, minWidth: TAP, minHeight: TAP, background: "transparent", border: "none",
          cursor: "pointer", color: saved ? T.amber : T.dim }}>{saved ? "★" : "☆"}</button>
      <button onClick={onOpen} aria-label={ARIA.openMarket(x.tk)}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none",
          cursor: "pointer", padding: "6px 8px 6px 0", textAlign: "left", minHeight: TAP }}>
        <span style={{ flex: "1 1 0", minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: ink }}>{x.tk}</span>
            {dir && <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: muted ? T.mut : DIR_COLOR[dir] }}>{DIRECTION_TAGS[dir]}</span>}
          </span>
          <span style={{ ...sans, display: "block", fontSize: FS.xs, lineHeight: LH.tight, color: muted ? T.amber : T.mut,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {muted ? row.misses.map(missReasonLine).filter(Boolean).join(" · ") : rowSubtitleText(x.name, x.expKey)}
          </span>
        </span>
        <span aria-hidden="true" style={{ flex: "0 0 72px", width: 72, height: 40, opacity: muted ? 0.6 : 1 }}>
          {x.lf.bands && <BandThumbnail bands={x.lf.bands} bars={bars} width={72} height={40} />}
        </span>
        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: 76 }}>
          <span data-row-figure={fig.tile} style={{ ...mono, display: "block", fontSize: FS.sm, fontWeight: FW.bold, color: ink }}>{fig.value}</span>
          <span style={{ ...mono, display: "block", fontSize: FS.xs, color: T.mut }}>{rowRiskText(fig.risk)}</span>
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
      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: TAP, padding: "6px 10px 6px 48px", borderRadius: 8,
        border: `1px dashed ${T.line}` }}>
      <span style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.mut }}>{tk}</span>
      <span style={{ ...sans, flex: 1, fontSize: FS.xs, color: st.state === "failed" ? T.amber : T.mut }}>{words}</span>
      <span style={{ ...mono, fontSize: FS.sm, color: T.mut }}>—</span>
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
