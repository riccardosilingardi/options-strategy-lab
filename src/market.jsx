// ============================================================================
// src/market.jsx — THE MARKET PAGE, A STEP BETWEEN FIND AND BUILD (redesign PR 1, TASK 3; owner's mockups, 4 Oct 2026).
//
// Find shows one row per market; tapping a row opens THIS page for that market, on Strategies. It is a FILTERED VIEW
// OF FIND'S ONE SORTED LIST, not a second list: its cards are `findShown`'s cards for this ticker, in the same order,
// built by the same `findGen` (no new ranking, no new simulation). Three tabs, each a screen for Back (nav.js):
//
//   OVERVIEW    the price chart with no trade on it, the readout under the finger, "THE MARKET'S READ" (the Why
//               sheet's content, inline) and the chart copilot.
//   STRATEGIES  the market's cards in two groups — the signals' family first, then Neutral, "always listed" — each
//               the existing CandidateCard plus where it stands against the signals (`signalStance()`) and, when the
//               future and the past disagree, one sentence; actions Compare · ☆ · Open in chain · Build ›.
//   CHAIN       an advanced T-chain over the chain the app already holds: tap an ask to buy one, a bid to sell one;
//               the tray prices the legs through `listCardFigures()`, the function every card reads, and hands them to
//               Build through `buildHandOff()`. Nothing is sent from this page.
//
// THE HEADER, ON ALL THREE TABS: ticker, name · category, price and its freshness, the change since the last close
// (from the bars already cached), the market's clock, IV and IV rank, the expected move to the expiry shown, ☆ (saves
// the first Strategies card), the latest news the factor tagged, and the event line (src/events.js).
//
// IT COMPUTES NOTHING NEW. Every figure is handed in or read through a function another screen already reads; what
// is new is plain JS beside it (marketView.js, events.js, rows.js) and tested there. On ui.jsx's atoms and the type
// tokens: ui.test.jsx holds this file to the design system.
// ============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Chip, Note, Info, Sheet, Fold, Segments, Label, Stat, Placeholder, TAP } from "./ui.jsx";
import { CandidateCard } from "./card.jsx";
import { MarketRow, ComparePanel } from "./find.jsx";
import { WhySheet, HowWorkedOut } from "./why.jsx";
import { PriceChart, TaCopilot, scaleStrategy } from "./pro.jsx";
import { getU, MARKET_CATEGORIES } from "./markets.js";
import { hasOpenInterest, atmIv, feedName } from "./chain.js";
import { signalStance, sentimentDirection, findOrderOf, placeLine } from "./signals.js";
import { structureName } from "./positionView.js";
import { undefinedRiskLegs } from "./riskGate.js";
import { MLEG_MAX_LEGS } from "./alpacaContract.js";
import { legsLine } from "./path.js";
import { marketRows, rowFigure } from "./rows.js";
import { dayChange, expectedMove, latestNews, toggleChainLeg, legCell } from "./marketView.js";
import { nextEvent, eventsFor, localWhen, daysUntil, etDay } from "./events.js";
import { RULES, money, chanceText, expiryWords, sizedFree, sizedFigures, sizeLine, futureFigures, pastFigures, stopSigns,
  chanceBasisLabel, meetsRequest, MARKET_TABS, BACK_TO_FIND, MARKETS_SHEET_TITLE, SAVE_FIRST_CARD, dayChangeText, ivText,
  ivRankText, expectedMoveText, NEWS_NOT_READ, newsHeadlineText, groupHeadText, strategiesLine, stanceText, futurePastDisagree,
  OPEN_IN_CHAIN, BUILD_CTA, COMPARE_TICK, MARKET_READ_HEAD, HOW_WORKED_OUT_LINK, MARKET_READ_END, CHAIN_MODES,
  noOpenInterestText, underEntryText, THIN, spotLineText, legsMaxText, TRAY_LABELS, uncoveredText, trayEmptyText,
  chainEventText, eventLineText, eventInfoText, eventsBeforeLabel, DIRECTION_TAGS, CHAIN_HEAD, chainNotLoadedText,
  marketReadingText, noCardsText, ARIA,
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const NO_BARS = [];
const DIR_COLOR = { bull: T.green, bear: T.violet, neutral: T.mut };
const dirOfSent = (sent) => { const d = sentimentDirection(sent); return d > 0 ? "bull" : d < 0 ? "bear" : "neutral"; };

export function MarketPage({
  tk, tab = "strategies", onTab, onBack, onTicker,
  chain = null, freshLine = null, bars = NO_BARS, clock = null, clockLine = null, ivRank = null, ivDays = 0,
  board = null, fused = null, readingState = null, items = [], allItems = [], boards = {},
  request, freeSizing = false, findDir = "signals", sentiments = [], findOrder = "ev",
  newsItems = [], newsState = null, ago = (d) => String(d), exits = [], timeZone,
  isSaved = () => false, onSave = () => {}, inCompare = () => false, onTickCompare = () => {}, onBuild = () => {},
  onBuildLegs = () => {}, cardFigures = null, quoteOf = () => null, seasonal = null, matrix = null, liqFloor = 0,
  badgeOf = () => null, onMore = null, whyProps = {}, onAnalysis = () => {},
  sheet = null, onSheet = () => {}, compareProps = {}, now = Date.now(),
}) {
  const u = getU(tk);
  const spot = chain && chain.spot ? chain.spot : null;
  const atm = atmIv(chain);

  /* THE SIZE THE BUDGET BUYS, once per card per request — the same map Find reads. */
  const sizes = useMemo(() => {
    const m = new Map();
    for (const x of allItems) m.set(x.key, sizedFree(scaleStrategy(x.lf.aFill, request.mode, request.amt, request.riskCap), freeSizing));
    return m;
  }, [allItems, request, freeSizing]);
  const sizeOf = (c) => sizes.get(c.key) || null;

  /* THE CHAIN TAB'S TRAY lives here, so "Open in chain" on a card can load it before the tab opens. */
  const [tray, setTray] = useState(null);   // { expKey, legs, note }
  useEffect(() => { setTray(null); }, [tk]);
  const first = items[0] || null;
  useEffect(() => {
    if (tab === "chain" && !tray && first) setTray({ expKey: first.expKey, legs: first.legs.map((l) => ({ ...l })), note: null });
  }, [tab, tray, first]);
  const openInChain = (x) => { setTray({ expKey: x.expKey, legs: x.legs.map((l) => ({ ...l })), note: null }); onTab("chain"); };

  return (
    <div style={{ marginTop: 8, maxWidth: 1100 }}>
      <Btn small ghost color={T.blue} onClick={onBack}>{BACK_TO_FIND}</Btn>
      <MarketHeader tk={tk} u={u} spot={spot} freshLine={freshLine} bars={bars} clockLine={clockLine} atm={atm}
        ivRank={ivRank} ivDays={ivDays} board={board} sd={board ? board.signal : null} now={now}
        news={latestNews(tk, newsItems, newsState)} ago={ago} first={first} saved={first ? isSaved(first.cand) : false}
        onSave={() => first && onSave(first)} onTickerSheet={() => onSheet("market:tickers")}
        eventNode={tab === "chain" ? null : <EventLine tk={tk} expKey={board ? board.expKey : null} now={now} timeZone={timeZone} exits={exits}
          expiries={chain ? chain.expirations : []} />} />

      <div style={{ marginTop: 10 }}>
        <Segments label={ARIA.marketTabs(tk)} value={tab} onChange={onTab} items={MARKET_TABS} />
      </div>

      {tab === "overview" && (
        <Overview tk={tk} fused={fused} whyProps={whyProps} onAnalysis={onAnalysis} />
      )}
      {tab === "strategies" && (
        <Strategies tk={tk} items={items} board={board} fused={fused} findDir={findDir} sentiments={sentiments} findOrder={findOrder}
          request={request} sizeOf={sizeOf} bars={bars} isSaved={isSaved} onSave={onSave} inCompare={inCompare}
          onTickCompare={onTickCompare} onBuild={onBuild} onOpenInChain={openInChain} badgeOf={badgeOf} onMore={onMore}
          readingState={readingState} />
      )}
      {tab === "chain" && (
        <ChainTab tk={tk} chain={chain} clock={clock} tray={tray} setTray={setTray} cardFigures={cardFigures} quoteOf={quoteOf}
          seasonal={seasonal} matrix={matrix} iv={u.iv} liqFloor={liqFloor} onBuildLegs={onBuildLegs}
          eventNode={<EventLine tk={tk} expKey={board ? board.expKey : null} now={now} timeZone={timeZone} exits={exits}
            expiries={chain ? chain.expirations : []} chainExpiries={chain ? chain.expirations : []} />} />
      )}

      <ComparePanel {...compareProps} />

      {/* THE MARKETS, BY CATEGORY: the same rows as Find, the current one marked. Picking one keeps the tab. */}
      <Sheet open={sheet === "market:tickers"} title={MARKETS_SHEET_TITLE} onClose={() => onSheet(null)}>
        {MARKET_CATEGORIES.map((c) => {
          const rows = marketRows(allItems.filter((x) => c.tickers.includes(x.tk)), request, sizeOf);
          return (
            <div key={c.id} style={{ marginTop: 8 }}>
              <Label color={T.dim}>{c.id.toUpperCase()}</Label>
              <div role="list" style={{ display: "grid", gap: 6, marginTop: 4 }}>
                {rows.map((r) => (
                  <MarketRow key={r.tk} row={r} sd={(boards[r.tk] || {}).signal || null} current={r.tk === tk}
                    fig={rowFigure(r.x, sizes.get(r.x.key) || null, findOrder)} saved={isSaved(r.x.cand)}
                    onSave={() => onSave(r.x)} onOpen={() => { onSheet(null); onTicker(r.tk); }} />
                ))}
              </div>
            </div>
          );
        })}
      </Sheet>
    </div>
  );
}

/* ---------------------------------------------------------------- THE HEADER */
function MarketHeader({ tk, u, spot, freshLine, bars, clockLine, atm, ivRank, ivDays, board, sd, now, news, ago, first,
  saved, onSave, onTickerSheet, eventNode }) {
  const ch = dayChange(bars, spot, now);
  const mv = board && atm ? expectedMove(spot, atm.iv, board.dte) : null;
  return (
    <header style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onTickerSheet} aria-label={ARIA.pickMarket(tk)}
          style={{ ...mono, fontSize: FS.xl, fontWeight: FW.bold, color: T.ink, background: "transparent", border: "none",
            cursor: "pointer", minHeight: TAP, padding: 0 }}>{tk} ▼</button>
        <h2 data-view-heading tabIndex={-1} style={{ ...sans, fontSize: FS.sm, fontWeight: FW.regular, color: T.mut, margin: 0, outline: "none" }}>
          {u.name} · {u.category || "not proposed"}
        </h2>
        {sd && <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: DIR_COLOR[sd.dir] }}>{DIRECTION_TAGS[sd.dir]}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onSave} disabled={!first} aria-pressed={saved} aria-label={SAVE_FIRST_CARD}
          style={{ ...sans, fontSize: FS.lg, minWidth: TAP, minHeight: TAP, background: "transparent", border: "none",
            cursor: first ? "pointer" : "not-allowed", color: saved ? T.amber : T.dim }}>{saved ? "★" : "☆"}</button>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: FS.lg, fontWeight: FW.bold, color: T.ink }}>{spot == null ? "—" : `$${spot.toFixed(2)}`}</span>
        {ch && <span style={{ ...sans, fontSize: FS.sm, color: ch.change >= 0 ? T.green : T.violet }}>{dayChangeText(ch)}</span>}
      </div>
      {freshLine && <Note color={T.dim}>{freshLine}</Note>}
      {clockLine && <Note color={T.dim}>{clockLine}</Note>}
      <div style={{ ...sans, fontSize: FS.xs, color: T.body, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{ivText(atm ? atm.iv : null)}</span>
        <span>{ivRankText(ivRank, ivDays)}</span>
        {mv != null && <span>{expectedMoveText(mv, board.expKey)}</span>}
      </div>
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 2 }}>
        {!news ? null : news.failed ? NEWS_NOT_READ : news.none ? news.none
          : newsHeadlineText(news.title, news.source, news.date ? ago(Date.parse(news.date)) : null)}
      </div>
      {eventNode}
    </header>
  );
}

/* ---------------------------------------------------------------- THE EVENT LINE (TASK 4) */
function EventLine({ tk, expKey, now, timeZone, exits = [], expiries = [], chainExpiries = null }) {
  const n = nextEvent(tk, { now, expKey });
  if (!n) return null;
  if (n.placeholder) return <Placeholder id="events-calendar" />;
  const ev = n.ev;
  const beforeDay = expKey ? (expiryWords(expKey) || expKey).replace(/ \d{4}$/, "") : null;
  const line = eventLineText({ name: ev.name, when: localWhen(ev.at, timeZone), days: daysUntil(ev.at, now, timeZone),
    beforeDay, holiday: !!ev.holiday });
  const all = eventsFor(tk, { now, untilIso: expKey || undefined, expiries, exits }).filter((e) => !expKey || e.etDate < expKey);
  const allBefore = chainExpiries ? chainExpiries.filter((e) => e >= ev.etDate).length === chainExpiries.length : null;
  return (
    <div style={{ marginTop: 4 }}>
      <Fold summary={allBefore == null ? line : `${line} · ${chainEventText(allBefore)}`} label={eventsBeforeLabel(beforeDay || "the table's end")} tone={T.blue}>
        <div role="list" style={{ display: "grid", gap: 2 }}>
          {all.map((e) => (
            <div role="listitem" key={`${e.id}-${e.at}`} style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body }}>
              {e.name} · {localWhen(e.at, timeZone)}
              <Info label={`${e.name} ${etDay(e.etDate)}`}>{eventInfoText(e, etDay(e.etDate))}</Info>
            </div>
          ))}
        </div>
      </Fold>
    </div>
  );
}

/* ---------------------------------------------------------------- OVERVIEW */
function Overview({ tk, fused, whyProps, onAnalysis }) {
  const [bars, setBars] = useState(null);
  const [convo, setConvo] = useState({ msgs: [] });
  const [how, setHow] = useState(false);
  useEffect(() => { setConvo({ msgs: [] }); setBars(null); }, [tk]);
  return (
    <div style={{ marginTop: 10 }}>
      {/* No trade on this chart: no break-evens, no legs. Its range, its RSI and MACD panes, its switches and their
          saved prefs, and the readout at the last bar or under the finger, as on Build. */}
      <PriceChart ticker={tk} levels={null} breakevens={[]} entrySpot={null} legLines={[]} height={260} onBars={setBars} />
      <div style={{ marginTop: 14 }}>
        <Label>{MARKET_READ_HEAD}</Label>
        {fused ? <WhySheet fused={fused} ticker={tk} {...whyProps} /> : <Note>{marketReadingText(tk)}</Note>}
        {fused && (
          <Btn small ghost color={T.blue} aria-expanded={how} onClick={() => setHow((h) => !h)} style={{ marginTop: 6 }}>
            {HOW_WORKED_OUT_LINK}
          </Btn>
        )}
        {how && fused && <HowWorkedOut fused={fused} />}
        <Note color={T.dim} style={{ marginTop: 6 }}>{MARKET_READ_END}</Note>
      </div>
      <div style={{ marginTop: 14 }}>
        <TaCopilot ticker={tk} bars={bars || []} structure={null} convo={convo} setConvo={setConvo} onAnalysis={onAnalysis} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- STRATEGIES */
function Strategies({ tk, items, board, fused, findDir, sentiments, findOrder, request, sizeOf, bars, isSaved, onSave, inCompare,
  onTickCompare, onBuild, onOpenInChain, badgeOf, onMore, readingState }) {
  const sd = board ? board.signal : null;
  const fixed = findDir !== "signals" ? (sentiments.find((s) => s.id === findDir) || null) : null;
  const groups = fixed
    ? [{ id: "yours", head: groupHeadText(dirOfSent(fixed.id), "yours"), xs: items }]
    : [
      ...(sd && sd.dir !== "neutral" ? [{ id: "signal", head: groupHeadText(sd.dir, "signals"), xs: items.filter((x) => x.family === "signal") }] : []),
      { id: "neutral", head: groupHeadText("neutral", "neutral"), xs: items.filter((x) => x.family !== "signal") },
    ];
  const sortedBy = findOrderOf(findOrder).tile;
  return (
    <div style={{ marginTop: 10 }}>
      <Note color={T.body}>{strategiesLine({ sd: sd ? { ...sd, fused } : null,
        fixedLabel: fixed ? fixed.label : null, order: findOrder, expKey: board ? board.expKey : null, dte: board ? board.dte : null })}</Note>
      {readingState && readingState.reading && <Note color={T.dim}>{marketReadingText(tk)}</Note>}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.head} style={{ marginTop: 12 }}>
          <Label color={g.id === "neutral" ? T.mut : T.blue}>{g.head}</Label>
          <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
            {g.xs.map((x) => {
              const size = sizeOf(x.cand);
              const misses = meetsRequest(x.cand, request, size).misses;
              return (
                <StrategyCard key={x.key} x={x} size={size} misses={misses} bars={bars} sortedBy={sortedBy} findOrder={findOrder}
                  saved={isSaved(x.cand)} ticked={inCompare(x.cand)} onSave={() => onSave(x)} onTick={() => onTickCompare(x.cand)}
                  onBuild={() => onBuild(x)} onChain={() => onOpenInChain(x)} badge={badgeOf(x)} onMore={onMore} />
              );
            })}
            {g.xs.length === 0 && <Note>{noCardsText(tk, g.id === "neutral")}</Note>}
          </div>
        </section>
      ))}
    </div>
  );
}

/** One card: the existing CandidateCard (tiles, picture, misses in place, quieter, reason first), plus the stance
 *  line, the future/past sentence, and Compare · ☆ · Open in chain · Build ›. */
export function StrategyCard({ x, size, misses, bars, sortedBy, findOrder, saved, ticked, onSave, onTick, onBuild, onChain, badge, onMore }) {
  const af = x.lf.aFill;
  const n = size && size.ok ? size.n : null;
  const mc = x.lf.mc;
  const signs = stopSigns({ fused: x.fused, flags: x.flags, feedBroken: x.feedBroken, noQuoteLegs: x.noQuoteLegs, contracts: n, askSize: x.touchSize });
  const stance = stanceText(signalStance(x.fused, sentimentDirection(x.sent)));
  const disagree = futurePastDisagree(futureFigures(mc, af, null, x.expKey), pastFigures(x.lf.bt, af));
  return (
    <div>
      <CandidateCard cardKey={x.key} name={`${x.tk} · ${x.name}`} legs={`${legsLine(x.legs)} · ${x.expKey}`}
        misses={misses} signs={signs} figures={sizedFigures(af, n)} sizeText={size && size.ok ? sizeLine(size) : null}
        rr={x.lf.rr} pop={x.lf.pop} basis={mc ? chanceBasisLabel(mc) : null}
        picture={x.lf.bands ? { bands: x.lf.bands, legs: x.legs, entryNet: af.entry, spot: x.spot, bars: bars || NO_BARS,
          dte: x.dte, sigma: mc ? mc.sigma : undefined, driftAnnual: mc ? mc.driftAnnual : undefined, ticker: x.tk } : null}
        future={futureFigures(mc, af, n, x.expKey)} past={pastFigures(x.lf.bt, af, n)} ticker={x.tk}
        sortedBy={sortedBy} placeAtRest={findOrderOf(findOrder).id === "evSignal" ? placeLine(x, findOrder) : null}
        direction={stance} badge={badge}
        more={onMore ? { tk: x.tk, onOpen: () => onMore(x) } : null}
        actions={(
          <div>
            {disagree && <Note color={T.amber} style={{ marginBottom: 6 }}>{disagree}</Note>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <Btn small ghost={!ticked} color={T.blue} onClick={onTick}>{ticked ? COMPARE_TICK.on : COMPARE_TICK.off}</Btn>
              <Btn small ghost color={saved ? T.amber : T.dim} aria-pressed={saved} aria-label={ARIA.saveTrade(saved, x.tk, x.name)}
                onClick={onSave}>{saved ? "★" : "☆"}</Btn>
              <Btn small ghost color={T.blue} onClick={onChain}>{OPEN_IN_CHAIN}</Btn>
              <Btn small color={T.action} onClick={onBuild}>{BUILD_CTA}</Btn>
            </div>
          </div>
        )} />
    </div>
  );
}

/* ---------------------------------------------------------------- CHAIN (advanced) */
export function ChainTab({ tk, chain, clock, tray, setTray, cardFigures, quoteOf, seasonal, matrix, iv, liqFloor, onBuildLegs, eventNode }) {
  const [mode, setMode] = useState("price");
  if (!chain || !chain.spot || !chain.expirations || !chain.expirations.length) return <Note style={{ marginTop: 10 }}>{chainNotLoadedText(tk)}</Note>;
  const oi = hasOpenInterest(chain);
  const ek = tray && chain.byExp[tray.expKey] ? tray.expKey
    : chain.expirations.find((e) => chain.byExp[e].dte >= RULES.minEntryDTE) || chain.expirations[0];
  const e = chain.byExp[ek];
  const legs = tray && tray.expKey === ek ? tray.legs : [];
  const spot = chain.spot;
  const ks = Array.from(new Set([...Object.keys(e.calls || {}), ...Object.keys(e.puts || {})].map(Number)))
    .sort((a, b) => a - b).filter((k) => k >= spot * 0.8 && k <= spot * 1.2);
  const spotState = clock && clock.is_open === false ? "close" : clock && clock.is_open ? "now" : null;
  const tap = (type, strike, side) => {
    const r = toggleChainLeg(legs, { type, strike, side }, MLEG_MAX_LEGS);
    setTray({ expKey: ek, legs: r.legs, note: r.full ? legsMaxText(MLEG_MAX_LEGS) : null });
  };
  const pick = (exp) => setTray({ expKey: exp, legs: [], note: null });
  const fmt = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
  const cell = (q, type, k) => {
    if (mode === "greeks") return [fmt(q && q.delta), q && q.iv != null ? `${(q.iv * 100).toFixed(0)}%` : "—"];
    if (mode === "oi") return [q && q.oi != null ? String(q.oi) : "—", q && q.vol != null ? String(q.vol) : "—"];
    return [fmt(q && q.bid), fmt(q && q.ask)];
  };
  const head = CHAIN_HEAD[mode];
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr 64px 1fr 1fr", gap: 2, alignItems: "stretch" };
  const btn = (on, enabled) => ({ ...mono, fontSize: FS.xs, minHeight: TAP, border: `1px solid ${on ? T.blue : T.line}`, borderRadius: 6,
    background: on ? `${T.blue}33` : "transparent", color: T.ink, cursor: enabled ? "pointer" : "default", padding: 0 });
  let spotDrawn = false;
  return (
    <div style={{ marginTop: 10 }}>
      {eventNode}
      <div role="group" aria-label={ARIA.expiries} style={{ display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 4, marginTop: 6 }}>
        {chain.expirations.map((x) => {
          const d = chain.byExp[x].dte;
          const under = d < RULES.minEntryDTE;
          return (
            <Chip key={x} on={x === ek} color={under ? T.dim : T.blue} onClick={() => { if (!under) pick(x); }}
              label={ARIA.expiryChip(x, d, under)}
              style={{ flex: "0 0 auto", borderStyle: under ? "dashed" : "solid", cursor: under ? "not-allowed" : "pointer" }}>
              <span style={mono}>{(expiryWords(x) || x).replace(/ \d{4}$/, "")}</span> {under ? underEntryText() : `${d}d`}
            </Chip>
          );
        })}
      </div>
      <div role="group" aria-label={ARIA.chainShows} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {CHAIN_MODES.map((md) => {
          const off = md.id === "oi" && !oi;
          return (
            <Chip key={md.id} on={mode === md.id} color={off ? T.dim : T.blue} onClick={() => { if (!off) setMode(md.id); }}
              style={off ? { borderStyle: "dashed", cursor: "not-allowed" } : undefined}>
              {off ? noOpenInterestText(feedName(chain)) : md.label}
            </Chip>
          );
        })}
      </div>
      <div role="table" aria-label={ARIA.chainTable(tk, ek)} style={{ marginTop: 8 }}>
        <div role="row" style={{ ...grid, ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.dim, textAlign: "center" }}>
          <span role="columnheader">{`${CHAIN_HEAD.call} ${head[0]}`}</span><span role="columnheader">{`${CHAIN_HEAD.call} ${head[1]}`}</span>
          <span role="columnheader">{CHAIN_HEAD.strike}</span>
          <span role="columnheader">{`${CHAIN_HEAD.put} ${head[0]}`}</span><span role="columnheader">{`${CHAIN_HEAD.put} ${head[1]}`}</span>
        </div>
        {ks.map((k) => {
          const c = (e.calls || {})[k], p = (e.puts || {})[k];
          const [c1, c2] = cell(c, "call", k), [p1, p2] = cell(p, "put", k);
          const callOn = legCell(legs, "call", k), putOn = legCell(legs, "put", k);
          const thin = oi && Math.min(c && c.oi != null ? c.oi : Infinity, p && p.oi != null ? p.oi : Infinity) < liqFloor;
          const price = mode === "price";
          const showSpot = !spotDrawn && k >= spot;
          if (showSpot) spotDrawn = true;
          return (
            <React.Fragment key={k}>
              {showSpot && (
                <div role="row" data-spot style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, color: T.amber, textAlign: "center",
                  borderTop: `2px solid ${T.amber}`, margin: "2px 0" }}>{spotLineText(spot, spotState)}</div>
              )}
              <div role="row" style={{ ...grid, marginTop: 2 }}>
                <button role="cell" style={btn(callOn === "bid", price)} disabled={!price || !c}
                  aria-label={ARIA.chainCell(-1, k, "call")} onClick={() => tap("call", k, -1)}>{c1}</button>
                <button role="cell" style={btn(callOn === "ask", price)} disabled={!price || !c}
                  aria-label={ARIA.chainCell(1, k, "call")} onClick={() => tap("call", k, 1)}>{c2}</button>
                <span role="cell" style={{ ...mono, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink, textAlign: "center",
                  display: "flex", flexDirection: "column", justifyContent: "center", background: T.panel, borderRadius: 6 }}>
                  {k}{thin && <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.regular, color: T.amber }}>{THIN}</span>}
                </span>
                <button role="cell" style={btn(putOn === "bid", price)} disabled={!price || !p}
                  aria-label={ARIA.chainCell(-1, k, "put")} onClick={() => tap("put", k, -1)}>{p1}</button>
                <button role="cell" style={btn(putOn === "ask", price)} disabled={!price || !p}
                  aria-label={ARIA.chainCell(1, k, "put")} onClick={() => tap("put", k, 1)}>{p2}</button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <ChainTray tk={tk} chain={chain} ek={ek} legs={legs} note={tray ? tray.note : null} cardFigures={cardFigures}
        quoteOf={quoteOf} seasonal={seasonal} matrix={matrix} iv={iv} onClear={() => setTray({ expKey: ek, legs: [], note: null })}
        onBuild={() => onBuildLegs({ ticker: tk, expKey: ek, legs, name: structureName(legs) })} />
    </div>
  );
}

/** The tray: the legs, the structure's name, and Debit or Credit · Max profit · Max loss · Chance — through
 *  `listCardFigures()`, the function every card reads. Build is blocked, with the reason, on an uncovered short. */
function ChainTray({ tk, chain, ek, legs, note, cardFigures, quoteOf, seasonal, matrix, iv, onClear, onBuild }) {
  const e = chain.byExp[ek];
  const lf = useMemo(() => (legs.length && cardFigures && e
    ? cardFigures(legs, { spot: chain.spot, dte: e.dte, iv, q: quoteOf(chain, ek), ticker: tk, expKey: ek, seasonal, matrix })
    : null), [legs, cardFigures, chain, ek, e, iv, quoteOf, tk, seasonal, matrix]);
  const naked = undefinedRiskLegs(legs);
  const af = lf ? lf.aFill : null;
  const entry = af && Number.isFinite(af.entry) ? af.entry : null;
  return (
    <div data-chain-tray style={{ marginTop: 10, padding: "10px 12px", background: T.panel,
      border: `1px solid ${T.field}`, borderRadius: 10 }}>
      {!legs.length && <Note>{trayEmptyText()}</Note>}
      {legs.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{structureName(legs, ek)}</span>
            <span style={{ ...mono, fontSize: FS.xs, color: T.mut }}>{legsLine(legs)}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            <Stat k={entry == null ? TRAY_LABELS.debit : entry >= 0 ? TRAY_LABELS.debit : TRAY_LABELS.credit}
              v={entry == null ? "—" : money(Math.abs(entry) * 100)} />
            <Stat k={TRAY_LABELS.maxProfit} v={af ? (af.profitUnbounded ? TRAY_LABELS.noCap : af.maxProfit == null ? "—" : money(af.maxProfit)) : "—"} c={T.green} />
            <Stat k={TRAY_LABELS.maxLoss} v={af && af.maxLoss != null && !naked.length ? money(Math.abs(af.maxLoss)) : "—"} c={T.red} />
            <Stat k={TRAY_LABELS.chance} v={chanceText(lf ? lf.pop : null)} />
          </div>
        </>
      )}
      {note && <Note color={T.amber} role="status" style={{ marginTop: 4 }}>{note}</Note>}
      {naked.length > 0 && <Note color={T.red} role="alert" style={{ marginTop: 4 }}>{uncoveredText()}</Note>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <Btn small ghost color={T.dim} disabled={!legs.length} onClick={onClear}>{TRAY_LABELS.clear}</Btn>
        <Btn small color={T.action} disabled={!legs.length || naked.length > 0} onClick={onBuild}>{BUILD_CTA}</Btn>
      </div>
    </div>
  );
}
