// ============================================================================
// src/find.jsx — STEP 1, FIND: ONE REQUEST, ONE LIST (PR #40, TASK 1; MOVED OUT OF App.jsx IN PR #45, TASK 5).
//
// Radar, Shortlist and the guided door were three lists of one question and could give three answers on the same
// data. This is the one: the request block above, every candidate across the selected markets below it, re-filtered
// live, and what does not match HIDDEN behind a count. The Shortlist is the one-market filter; Compare (max 3) stays.
//
// WHY IT IS ITS OWN FILE. `App.jsx` is 6,000 lines of every screen, and the design-system foundation has to be
// provable on the screen it was built for: this file, `card.jsx` and `ui.jsx` import their atoms from `ui.jsx` and
// their sizes from the type tokens, and `ui.test.jsx` fails the build on a `fontSize` literal or a local copy of an
// atom in any of them. The Find block in App.jsx is one component call now.
//
// IT HOLDS NO STATE OF ITS OWN BUT THE ONE THE SCREEN OWNS (nothing, here). The generation memo — chains, floors,
// the 8,000-run chance — stays in App.jsx (`findGen`). A slider moves `request`, and this file reads `findGen`'s
// output: it filters and sizes, and never simulates. `scripts/measure-find.mjs` times that.
//
// WHAT IS PASSED IN AS A FUNCTION (`badgeOf`, `actionsOf`, `foldedNode`) is what lives in App.jsx's closures —
// the Why-this-market sheet, Compare ticks, Save, the liquidity filter. Passing them as props is the price of not
// importing App.jsx back, which would be a cycle.
// ============================================================================
import React, { useCallback, useMemo } from "react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Panel, Label, Stat, Note, Fold, CheckField } from "./ui.jsx";
import { RequestControls, MatchList, CandidateCard, CompareTray, ResultsFilter } from "./card.jsx";
import { categoryCounts } from "./markets.js";
import { StepForward } from "./steps.jsx";
import { CompareFigure } from "./visuals.jsx";
import { scaleStrategy } from "./pro.jsx";
import { legsLine, MAX_COMPARE } from "./path.js";
import { money, chanceText, NO_CEILING, noCeilingNote, noCeilingRankNote, seasonalStampNote,
  filterFold, qualityFloorLine, qualityFloorSentence, liquiditySettingNote, looseningWarning, isLoosened,
  unpriceableNote, impossibleLossNote, modelDisagreementNote, wideSpreadNote, wideComboNote, crossingNote,
  liquiditySkippedNote, spreadSkippedNote, comboSpreadSkippedNote, horizonFloorNote, perTradeCapLabel,
  nothingTodayLine, staleBoardLine, stopSigns, sizedFree, sizedFigures, sizeLine, controlReadings, directionTag,
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
/** One empty list, so a market with no bars yet hands every card the SAME array and a memoised picture stays put. */
const NO_BARS = [];

export function FindStep({
  request, onRequest, sentiments, universe, find, setFind, spot,
  limits, onLimit, freeSizing,
  findGen, findShown, flaggedHidden, barsCache, badgeOf, actionsOf, onMore = null,
  liqLevel, foldedNode,
  compare, showCompare, compareNote, onTickCompare, onClearCompare, onToggleCompare, onTakeToBuild,
  forward,
}) {
  /* ---- SIZE, ONCE PER CARD PER REQUEST. Every other reading below (the list, the histograms, the nearest
     relaxation) reads this map, so a slider move is one `scaleStrategy()` per candidate and nothing else. ---- */
  const sizes = useMemo(() => {
    const m = new Map();
    for (const x of findShown) m.set(x.key, sizedFree(scaleStrategy(x.lf.aFill, request.mode, request.amt, request.riskCap), freeSizing));
    return m;
  }, [findShown, request, freeSizing]);
  const byKey = useMemo(() => new Map(findShown.map((x) => [x.key, x])), [findShown]);
  const cands = useMemo(() => findShown.map((x) => x.cand), [findShown]);
  const sizeOf = useCallback((c) => sizes.get(c.key) || null, [sizes]);
  const readings = useMemo(() => controlReadings(cands, request, sizeOf), [cands, request, sizeOf]);

  const renderItem = (c, misses) => {
    const x = byKey.get(c.key);
    if (!x) return null;
    const af = x.lf.aFill;
    const size = sizes.get(x.key) || null;
    const n = size && size.ok ? size.n : null;
    const mc = x.lf.mc;
    const signs = stopSigns({ fused: x.fused, flags: x.flags, feedBroken: x.feedBroken,
      noQuoteLegs: x.noQuoteLegs, contracts: n, askSize: x.touchSize });
    return (
      <CandidateCard key={x.key} cardKey={x.key}
        name={`${x.tk} · ${x.name}`} legs={`${legsLine(x.legs)} · ${x.expKey}`}
        direction={find.dir === "season" ? directionTag(x.sent, sentiments) : null}
        misses={misses} signs={signs}
        figures={sizedFigures(af, n)} sizeText={size && size.ok ? sizeLine(size) : null}
        rr={x.lf.rr} pop={x.lf.pop}
        picture={x.lf.bands ? { bands: x.lf.bands, legs: x.legs, entryNet: af.entry, spot: x.spot, bars: barsCache[x.tk] || NO_BARS,
          dte: x.dte, sigma: mc ? mc.sigma : undefined, driftAnnual: mc ? mc.driftAnnual : undefined, ticker: x.tk } : null}
        badge={badgeOf(x)} actions={actionsOf(x)}
        more={onMore ? { tk: x.tk, onOpen: () => onMore(x) } : null} />
    );
  };

  const t = findGen.tally;
  const what = find.market || find.markets.join(", ");
  const fold = filterFold(t, { level: liqLevel, what: find.market || null });
  const unb = findGen.items.filter((x) => x.lf.aFill.profitUnbounded).length;
  const loose = looseningWarning(liqLevel);

  return (
    <div style={{ marginTop: 12, maxWidth: 1280 }}>
      <h2 data-view-heading tabIndex={-1}
        style={{ ...sans, fontSize: FS.lg, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink, margin: "4px 0 0", outline: "none" }}>
        Step 1 — find a trade
      </h2>

      <RequestControls style={{ marginTop: 10 }}
        request={request} onChange={onRequest} readings={readings}
        sentiments={sentiments} direction={find.dir} onDirection={(d) => setFind((f) => ({ ...f, dir: d }))}
        universe={universe} markets={find.markets}
        onMarkets={(m) => setFind((f) => ({ ...f, markets: m, market: m.includes(f.market) ? f.market : null }))}
        horizon={find.horizon} onHorizon={(h) => setFind((f) => ({ ...f, horizon: h }))}
        ticker={find.market} spot={spot}
        limits={limits} onLimit={onLimit} />

      {/* THE RESULTS FILTER, BY CATEGORY (PR #48): "All N · Grains n · Energy n · Metals n"; a category opens its
          tickers' counts, and a ticker is the one-market filter the Shortlist was. */}
      <ResultsFilter counts={categoryCounts(findGen.items, find.markets)} total={findGen.items.length}
        cat={find.cat || null} market={find.market}
        statusOf={(tk) => (findGen.failed.some((x) => x.tk === tk) ? "failed" : findGen.loading.includes(tk) ? "loading"
          : findGen.noBoard.includes(tk) ? "no board" : null)}
        onCat={(c) => setFind((f) => ({ ...f, cat: c, market: null }))}
        onMarket={(tk) => setFind((f) => ({ ...f, market: tk }))} />
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
        <CheckField checked={find.flagged} onChange={(e) => setFind((f) => ({ ...f, flagged: e.target.checked }))}>
          show flagged{flaggedHidden ? ` (${flaggedHidden} hidden)` : ""}
        </CheckField>
      </div>

      {/* A STALE BOARD IS SAID ONCE, HERE, ABOVE THE LIST (PR #41, TASK 2) — never repeated per card. A card carries
          its own label only when a broken pair touches its own strikes. */}
      {findGen.stale.length > 0 && (
        <Note color={T.amber} style={{ marginTop: 8 }}>⚠ {staleBoardLine(findGen.stale)}</Note>
      )}

      {/* "NOTHING TODAY" ONLY WHEN ZERO CANDIDATES PASS, WITH THE COUNTS. Prices still arriving are not a verdict:
          "Nothing today" waits until every selected market has been read. */}
      {findGen.items.length === 0 && (
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, marginTop: 10, lineHeight: LH.body, padding: "10px 12px", border: `1px dashed ${T.line}`, borderRadius: 8 }}>
          {nothingTodayLine(findGen.tally, { noBoard: findGen.noBoard, loading: findGen.loading, failed: findGen.failed, level: liqLevel })}
        </div>
      )}

      {findShown.length > 0 && (
        <MatchList items={cands} request={request} sizeOf={sizeOf} priceNote renderItem={renderItem} style={{ marginTop: 6 }} />
      )}

      {/* EVERYTHING THAT EXPLAINS THE LIST, BEHIND ONE "why". Nothing in it is cut: the floor counts and their own
          sentences, the skipped floors, the setting and what loosening lets back in, and the floor held against the
          chains it judges. */}
      <Fold label="why" tone={loose ? T.red : T.dim} style={{ marginTop: 10 }}
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
        <Note color={T.dim} style={{ marginTop: 6 }}>
          Candidates marked CONFLICT sit at the bottom by construction: the four factors contradict each other on that underlying, and no expected value is worth a signal we cannot read.
        </Note>
        <Note color={isLoosened(liqLevel) ? T.red : T.dim} style={{ marginTop: 6 }}>
          {liquiditySettingNote(liqLevel, { ...t, kept: findGen.items.length })}
        </Note>
        {loose && <Note color={T.red} style={{ marginTop: 6 }}>{loose}</Note>}
        <Note color={T.dim} style={{ marginTop: 8 }}>{qualityFloorSentence(liqLevel)}</Note>
        <Note color={T.dim} style={{ marginTop: 6 }}>
          {`${limits.answered ? "Your" : "The suggested"} per-trade limit: ${money(limits.perTradeLimit)} (${perTradeCapLabel()}).`} Budget is the most you will pay, taken from live prices. For trades where you receive money up front, the limit becomes the capital tied up instead. Chance is the probability of ending in profit at expiry.
        </Note>
        {foldedNode}
      </Fold>

      {/* COMPARING — up to three, one picture (PRD §6). */}
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

      <StepForward label={forward.label} disabled={forward.disabled} disabledNote={forward.disabledNote}
        sub={forward.sub} onClick={forward.onClick} />
    </div>
  );
}
