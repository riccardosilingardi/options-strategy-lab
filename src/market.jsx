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
// ROUND 2 (owner's mockups "Market · Strategies", "Overview", "Chain", 5 Oct 2026): no desk header. A back arrow, the
// switcher (the category's icon, the ticker, "Corn · Grains"), ↻ and ☆; the price block; the event box; the news line;
// underlined tabs. Strategies draws the COMPACT card (one CandidateCard, `compact`); the chain's tray is fixed above the
// bottom bar while the chain scrolls.
//
// IT COMPUTES NOTHING NEW. Every figure is handed in or read through a function another screen already reads; what
// is new is plain JS beside it (marketView.js, events.js, rows.js) and tested there. On ui.jsx's atoms and the type
// tokens: ui.test.jsx holds this file to the design system.
// ============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, CalendarDays, Wheat, Flame, Gem, CircleDot } from "lucide-react";
import { T, TYPE, BADGE_H } from "./theme.js";
import { mono, sans, Note, Info, Sheet, Label, Placeholder, IconButton, UnderTabs, SegmentBar, TextBtn, Fold, TAP } from "./ui.jsx";
import { CandidateCard } from "./card.jsx";
import { MarketRow } from "./find.jsx";
import { WhySheet, HowWorkedOut } from "./why.jsx";
import { PriceChart, TaCopilot, scaleStrategy, useCopilot, skillsFor } from "./pro.jsx";
import { CopilotSection } from "./build.jsx";
import { BandThumbnail } from "./visuals.jsx";
import { getU, MARKET_CATEGORIES, CATEGORY_ICONS } from "./markets.js";
import { NAV_BAR_H } from "./navBar.jsx";
import { hasOpenInterest, atmIv, feedName } from "./chain.js";
import { signalStance, sentimentDirection, findOrderOf, placeLine } from "./signals.js";
import { structureName } from "./positionView.js";
import { undefinedRiskLegs } from "./riskGate.js";
import { MLEG_MAX_LEGS } from "./alpacaContract.js";
import { legsLine, MAX_COMPARE } from "./path.js";
import { marketRows, rowFigure } from "./rows.js";
import { dayChange, expectedMove, latestNews, toggleChainLeg, legCell } from "./marketView.js";
import { nextEvent, eventsFor, localWhen, daysUntil, etDay } from "./events.js";
import { RULES, money, chanceText, expiryWords, sizedFree, sizedFigures, sizeLine, futureFigures, pastFigures, stopSigns,
  chanceBasisLabel, meetsRequest, MARKET_TABS, MARKETS_SHEET_TITLE, SAVE_FIRST_CARD, UNSAVE_FIRST_CARD, dayChangeText, dayChangeShort,
  ivText, ivRankText, ivRankShort, moveLabel, HEADER_DEFINITIONS, NEWS_NOT_READ, newsHeadlineText, groupHeadText, strategiesLine,
  signalsParts, strategiesNote, MARKET_READ_LINK, BACK_TO_FIND_ARIA, refreshMarketAria, stanceText, futurePastDisagree, needsText,
  OPEN_IN_CHAIN, BUILD_CTA, COMPARE_TICK, MARKET_READ_HEAD, HOW_WORKED_OUT_LINK, MARKET_READ_END, CHAIN_MODES, marketNewsHead, marketNewsAsk,
  noOpenInterestText, underEntryText, THIN, spotLineText, legsMaxText, TRAY_LABELS, uncoveredText, trayEmptyText,
  chainEventText, eventLineText, eventInfoText, dateOnlyWhen, inDaysText, holidayWeekNote, eventsBeforeLabel, CHAIN_HEAD,
  chainNotLoadedText, marketReadingText, noCardsText, ARIA, readScoreLine, compareTrayLine, SEE_THEM,
} from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const NO_BARS = [];
const dirOfSent = (sent) => { const d = sentimentDirection(sent); return d > 0 ? "bull" : d < 0 ? "bear" : "neutral"; };
/** A category's icon, by the name markets.js gives it (CATEGORY_ICONS). */
const ICONS = { Wheat, Flame, Gem };
const tnum = { fontVariantNumeric: "tabular-nums" };
/** A panel on the market page (the mockups): the panel ground, a hairline, radius 12. */
const PANEL = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, boxSizing: "border-box", minWidth: 0 };
/** A section's small capital heading (THE MARKET'S READ, ASK ABOUT THIS CHART): 12 bold, spaced, mut. */
export const SECTION_HEAD = { ...sans, margin: 0, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, textTransform: "uppercase", lineHeight: LH.tight };

export function MarketPage({
  tk, tab = "strategies", onTab, onBack, onTicker, onRefresh = null, busy = false,
  chain = null, freshLine = null, bars = NO_BARS, clock = null, clockLine = null, ivRank = null, ivDays = 0,
  board = null, fused = null, readingState = null, items = [], allItems = [], boards = {},
  request, freeSizing = false, findDir = "signals", sentiments = [], findOrder = "ev",
  newsItems = [], newsState = null, ago = (d) => String(d), exits = [], timeZone,
  isSaved = () => false, onSave = () => {}, inCompare = () => false, onTickCompare = () => {}, onBuild = () => {},
  onBuildLegs = () => {}, cardFigures = null, quoteOf = () => null, seasonal = null, matrix = null, liqFloor = 0,
  badgeOf = () => null, onMore = null, whyProps = {}, onAnalysis = () => {}, copilot = null,
  sheet = null, onSheet = () => {}, compareProps = {}, now = Date.now(), initialTray = null,
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
  const [tray, setTray] = useState(initialTray);   // { expKey, legs, note }
  useEffect(() => { if (!initialTray) setTray(null); }, [tk]); // eslint-disable-line
  const first = items[0] || null;
  useEffect(() => {
    if (tab === "chain" && !tray && first) setTray({ expKey: first.expKey, legs: first.legs.map((l) => ({ ...l })), note: null });
  }, [tab, tray, first]);
  const openInChain = (x) => { setTray({ expKey: x.expKey, legs: x.legs.map((l) => ({ ...l })), note: null }); onTab("chain"); };
  const eventProps = { tk, expKey: board ? board.expKey : null, now, timeZone, exits, expiries: chain ? chain.expirations : [] };

  return (
    <div data-market style={{ maxWidth: 1100 }}>
      <MarketHeader tk={tk} u={u} spot={spot} freshLine={freshLine} bars={bars} clockLine={clockLine} atm={atm}
        ivRank={ivRank} ivDays={ivDays} board={board} now={now} onBack={onBack} onRefresh={onRefresh} busy={busy}
        news={latestNews(tk, newsItems, newsState)} newsItems={newsItems} ago={ago} first={first} saved={first ? isSaved(first.cand) : false}
        onSave={() => first && onSave(first)} onTickerSheet={() => onSheet("market:tickers")}
        eventNode={<EventLine {...eventProps} chainExpiries={tab === "chain" && chain ? chain.expirations : null} />} />

      <UnderTabs label={ARIA.marketTabs(tk)} value={tab} onChange={onTab} items={MARKET_TABS} />

      {tab === "overview" && (
        <Overview tk={tk} fused={fused} whyProps={whyProps} onAnalysis={onAnalysis} copilot={copilot} />
      )}
      {tab === "strategies" && (
        <Strategies tk={tk} items={items} board={board} fused={fused} findDir={findDir} sentiments={sentiments} findOrder={findOrder}
          request={request} sizeOf={sizeOf} bars={bars} isSaved={isSaved} onSave={onSave} inCompare={inCompare}
          onTickCompare={onTickCompare} onBuild={onBuild} onOpenInChain={openInChain} badgeOf={badgeOf} onMore={onMore}
          readingState={readingState} onRead={() => onTab("overview")} />
      )}
      {tab === "chain" && (
        <ChainTab tk={tk} chain={chain} clock={clock} tray={tray} setTray={setTray} cardFigures={cardFigures} quoteOf={quoteOf}
          seasonal={seasonal} matrix={matrix} iv={u.iv} liqFloor={liqFloor} onBuildLegs={onBuildLegs} />
      )}

      {/* ONE COMPARE (PR 61): right after a tick, how many are ticked and the way to the one Compare sheet. Fixed above the
          bottom bar, so it is on screen where the tap was; the Chain tab has its own tray there. */}
      {tab !== "chain" && (compareProps.compare || []).length > 0 && (
        <CompareLine n={compareProps.compare.length} note={compareProps.note || null} onOpen={compareProps.onOpen} />
      )}

      {/* THE MARKETS, BY CATEGORY: the same rows as Find, the current one marked. Picking one keeps the tab. */}
      <Sheet open={sheet === "market:tickers"} title={MARKETS_SHEET_TITLE} value={tk} onClose={() => onSheet(null)}>
        {MARKET_CATEGORIES.map((c) => {
          const rows = marketRows(allItems.filter((x) => c.tickers.includes(x.tk)), request, sizeOf);
          return (
            <div key={c.id} style={{ marginTop: 8 }}>
              <Label color={T.mut}>{c.id.toUpperCase()}</Label>
              <div role="list" style={{ marginTop: 4 }}>
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

/** "2 of 3 to compare · See them ›" (PR 61), and the refusal of a fourth when there is one. */
export function CompareLine({ n, note = null, onOpen }) {
  return (
    <>
      <div aria-hidden="true" style={{ height: note ? 88 : 56 }} />
      <div data-compare-line style={{ position: "fixed", left: 0, right: 0, zIndex: 55, display: "flex", justifyContent: "center", pointerEvents: "none",
        bottom: `calc(${BADGE_H + NAV_BAR_H}px + env(safe-area-inset-bottom, 0px))` }}>
        <div role="status" style={{ pointerEvents: "auto", width: "100%", maxWidth: 640, boxSizing: "border-box", background: T.panel,
          borderTop: `1px solid ${T.field}`, boxShadow: "0 -6px 18px rgba(0,0,0,0.22)", padding: "4px 8px 4px 16px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...sans, flex: 1, fontSize: FS.sm, color: T.ink }}>{compareTrayLine(n, MAX_COMPARE)}</span>
            <TextBtn height={TAP} onClick={onOpen} style={{ fontSize: FS.sm, fontWeight: FW.bold }}>{SEE_THEM}</TextBtn>
          </div>
          {note && <Note color={T.amber} style={{ paddingBottom: 6 }}>{note}</Note>}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- THE HEADER */
function MarketHeader({ tk, u, spot, freshLine, bars, clockLine, atm, ivRank, ivDays, board, now, news, newsItems, ago, first,
  saved, onSave, onTickerSheet, eventNode, onBack, onRefresh, busy }) {
  const [def, setDef] = useState(null);
  const ch = dayChange(bars, spot, now);
  const mv = board && atm ? expectedMove(spot, atm.iv, board.dte) : null;
  const Icon = ICONS[CATEGORY_ICONS[u.category]] || CircleDot;
  const link = news && news.title ? ((newsItems || []).find((i) => i.title === news.title) || {}).link || null : null;
  const newsText = !news ? null : news.failed ? NEWS_NOT_READ : news.none ? news.none
    : newsHeadlineText(news.title, news.source, news.date ? ago(Date.parse(news.date)) : null);
  const facts = [
    ["iv", "IV", atm ? `${(atm.iv * 100).toFixed(1)}%` : "not quoted", ivText(atm ? atm.iv : null)],
    ["ivRank", "IV rank", ivRankShort(ivRank, ivDays), ivRankText(ivRank, ivDays)],
    ...(board ? [["move", moveLabel(board.expKey), mv == null ? "—" : `±$${mv.toFixed(2)}`, null]] : []),
  ];
  return (
    <header data-market-header>
      <h2 data-view-heading tabIndex={-1} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: 0 }}>
        {tk} · {u.name} · {u.category || "not proposed"}
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 0 4px" }}>
        <IconButton label={BACK_TO_FIND_ARIA} onClick={onBack}><ArrowLeft size={22} strokeWidth={1.75} aria-hidden="true" /></IconButton>
        <button onClick={onTickerSheet} aria-label={ARIA.pickMarket(tk)}
          style={{ flex: 1, minWidth: 0, minHeight: TAP, display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none",
            cursor: "pointer", padding: "0 4px", textAlign: "left" }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: T.raise, color: T.mut, flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} strokeWidth={1.75} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", lineHeight: LH.tight }}>
              <span data-market-ticker style={{ ...mono, fontSize: FS.lg, fontWeight: FW.bold, color: T.ink }}>{tk}</span>
              <span style={{ ...sans, fontSize: FS.xs, color: T.mut, marginLeft: 6 }}>▾</span>
            </span>
            <span style={{ ...sans, display: "block", fontSize: FS.xs, color: T.mut, lineHeight: LH.tight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {u.name} · {u.category || "not proposed"}
            </span>
          </span>
        </button>
        {onRefresh && <IconButton label={refreshMarketAria(tk)} onClick={onRefresh} disabled={busy}><RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" /></IconButton>}
        <IconButton onClick={onSave} disabled={!first} pressed={saved} label={saved ? UNSAVE_FIRST_CARD : SAVE_FIRST_CARD} color={saved ? T.amber : T.dim}
          style={{ fontSize: FS.lg }}>{saved ? "★" : "☆"}</IconButton>
      </div>

      {/* THE PRICE BLOCK: the price, the day change, the status; IV, IV rank and the move to the expiry, each label tappable. */}
      <div style={{ display: "flex", gap: 12, padding: "4px 16px 10px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ ...mono, ...tnum, fontSize: FS.xl, fontWeight: FW.bold, color: T.ink, lineHeight: LH.tight }}>{spot == null ? "—" : `$${spot.toFixed(2)}`}</div>
          {ch && <div aria-label={dayChangeText(ch)} title={dayChangeText(ch)}
            style={{ ...mono, ...tnum, fontSize: FS.sm, color: ch.change >= 0 ? T.green : T.red, whiteSpace: "pre" }}>{dayChangeShort(ch)}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", alignItems: "baseline", minWidth: 0 }}>
          {facts.map(([id, k, v, spoken]) => (
            <React.Fragment key={id}>
              <button onClick={() => setDef((d) => (d === id ? null : id))} aria-expanded={def === id} aria-label={spoken || k}
                style={{ ...sans, fontSize: FS.xs, color: T.mut, background: "transparent", border: "none", padding: 0, cursor: "pointer",
                  textAlign: "left", textDecoration: "underline dotted", textUnderlineOffset: 3, whiteSpace: "nowrap" }}>{k}</button>
              <span style={{ ...mono, ...tnum, fontSize: FS.xs, color: T.ink, textAlign: "right", whiteSpace: "nowrap" }}>{v}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, padding: "0 16px 8px", marginTop: -6 }}>{[freshLine, clockLine].filter(Boolean).join(" · ")}</div>
      {def && <div role="note" style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body, padding: "0 16px 8px" }}>{HEADER_DEFINITIONS[def]}</div>}
      {eventNode}
      {/* THE NEWS LINE: one line; a tap opens the headline. */}
      {newsText && (
        link ? (
          <a href={link} target="_blank" rel="noreferrer noopener" style={{ ...sans, display: "block", fontSize: FS.xs, color: T.mut, padding: "0 16px 8px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none" }}>{newsText}</a>
        ) : (
          <div style={{ ...sans, fontSize: FS.xs, color: T.mut, padding: "0 16px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{newsText}</div>
        )
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- THE EVENT BOX (TASK 4; round 2's look) */
/** When an event falls: in the user's time, or — when the publisher gives only the day — that ET day and no hour. */
const whenOf = (ev, timeZone) => (ev.dateOnly ? dateOnlyWhen(ev.what, etDay(ev.etDate)) : localWhen(ev.at, timeZone));
function EventLine({ tk, expKey, now, timeZone, exits = [], expiries = [], chainExpiries = null }) {
  const [open, setOpen] = useState(false);
  const n = nextEvent(tk, { now, expKey });
  if (!n) return null;
  if (n.placeholder) return <div style={{ padding: "0 16px 6px" }}><Placeholder id="events-calendar" /></div>;
  const ev = n.ev;
  const beforeDay = expKey ? (expiryWords(expKey) || expKey).replace(/ \d{4}$/, "") : null;
  const days = daysUntil(ev.at, now, ev.dateOnly ? "America/New_York" : timeZone);
  const line = eventLineText({ name: ev.name, when: whenOf(ev, timeZone), days, beforeDay, holiday: !!ev.holiday, dateOnly: ev.dateOnly, publisher: ev.publisher });
  const all = eventsFor(tk, { now, untilIso: expKey || undefined, expiries, exits }).filter((e) => !expKey || e.etDate < expKey);
  const allBefore = chainExpiries ? chainExpiries.filter((e) => e >= ev.etDate).length === chainExpiries.length : null;
  return (
    <div style={{ margin: "0 16px 6px" }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} data-event-line={line}
        style={{ ...sans, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", minHeight: TAP, border: `1px solid ${T.line}`,
          background: T.panel, borderRadius: 10, fontSize: FS.sm, lineHeight: LH.body, color: T.body, textAlign: "left", cursor: "pointer" }}>
        <CalendarDays size={16} strokeWidth={1.75} color={T.mut} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ color: T.ink }}>{ev.name}</b>{ev.what && !ev.dateOnly ? ` ${ev.what}` : ""} · {whenOf(ev, timeZone)}{ev.dateOnly ? "" : " your time"}
          {" · "}<span style={{ color: T.mut }}>{inDaysText(days)}</span>
          {ev.holiday && <span style={{ color: T.amber }}> · {holidayWeekNote(ev.publisher)}</span>}
          {allBefore != null && <span style={{ color: T.mut }}> · {chainEventText(allBefore)}</span>}
        </span>
        <span aria-hidden="true" style={{ color: T.mut, fontSize: FS.xs }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div role="list" aria-label={eventsBeforeLabel(beforeDay || "the table's end")} style={{ padding: "6px 4px 0" }}>
          <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.mut, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {eventsBeforeLabel(beforeDay || "the table's end")}
          </div>
          {all.map((e) => (
            <div role="listitem" key={`${e.id}-${e.at}`} style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body }}>
              {e.name} · {whenOf(e, timeZone)}
              <Info label={`${e.name} ${etDay(e.etDate)}`}>{eventInfoText(e, etDay(e.etDate))}</Info>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- OVERVIEW */
function Overview({ tk, fused, whyProps, onAnalysis, copilot = null }) {
  const [bars, setBars] = useState(null);
  const [convo, setConvo] = useState({ msgs: [] });
  const [how, setHow] = useState(false);
  useEffect(() => { setConvo({ msgs: [] }); setBars(null); }, [tk]);
  // THE NEWS QUESTION SITS IN THE NEWS BLOCK (PR 4, owner: "news is one of the four factors"): News impact on this market,
  // the market page's own question (SKILLS, place "market"). Its conversation is App.jsx's, cleared when the market changes.
  const ask = useCopilot({ ...(copilot || { convo: null, setConvo: () => {} }), ctx: (copilot && copilot.ctx) || {} });
  const askAll = { ...ask, clear: () => copilot && copilot.setConvo({ msgs: [], busy: false, err: null }) };
  useEffect(() => { if (copilot) copilot.setConvo({ msgs: [], busy: false, err: null, partial: "" }); }, [tk]); // eslint-disable-line
  // One tap away (a fold): the chart copilot is already at rest on this tab, and one copilot at rest is enough.
  const newsExtra = copilot ? (
    <Fold label="ask" tone={T.blue} summary={marketNewsAsk(tk)} style={{ marginTop: 2 }}>
      <div data-market-news-copilot style={{ marginTop: 6 }}>
        <CopilotSection ask={askAll} skills={skillsFor("market")} label={marketNewsHead(tk)} heading={marketNewsHead(tk)}
          ownLabel={`Your own question about ${tk}'s news`} />
      </div>
    </Fold>
  ) : null;
  return (
    <div data-market-body style={{ padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* THREE PANELS (the mockup "Market · Overview"): the chart, the market's read, the chart copilot. */}
      {/* No trade on this chart: no break-evens, no legs. Its range, its RSI and MACD panes, its switches and their
          saved prefs, and the readout at the last bar or under the finger, as on Build. */}
      <section aria-label="Price chart" data-chart-panel style={PANEL}>
        <PriceChart ticker={tk} levels={null} breakevens={[]} entrySpot={null} legLines={[]} height={260} onBars={setBars} />
      </section>
      <section aria-label={MARKET_READ_HEAD} data-market-read style={{ ...PANEL, padding: "14px 14px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h2 style={SECTION_HEAD}>{MARKET_READ_HEAD}</h2>
          {fused && <span style={{ ...mono, ...tnum, fontSize: FS.xs, color: T.mut }}>{readScoreLine(fused)}</span>}
        </div>
        {fused ? <WhySheet fused={fused} ticker={tk} {...whyProps} factorsAtRest newsExtra={newsExtra} /> : <Note>{marketReadingText(tk)}</Note>}
        <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 8, padding: "8px 0 4px" }}>
          <Note color={T.mut}>{MARKET_READ_END}</Note>
          {fused && (
            <TextBtn height={TAP} aria-expanded={how} onClick={() => setHow((h) => !h)} style={{ padding: 0 }}>
              {HOW_WORKED_OUT_LINK}
            </TextBtn>
          )}
          {how && fused && <HowWorkedOut fused={fused} />}
        </div>
      </section>
      <TaCopilot ticker={tk} bars={bars || []} structure={null} convo={convo} setConvo={setConvo} onAnalysis={onAnalysis} look="market" />
    </div>
  );
}

/* ---------------------------------------------------------------- STRATEGIES */
function Strategies({ tk, items, board, fused, findDir, sentiments, findOrder, request, sizeOf, bars, isSaved, onSave, inCompare,
  onTickCompare, onBuild, onOpenInChain, badgeOf, onMore, readingState, onRead }) {
  const sd = board ? board.signal : null;
  const fixed = findDir !== "signals" ? (sentiments.find((s) => s.id === findDir) || null) : null;
  const groups = fixed
    ? [{ id: "yours", head: groupHeadText(dirOfSent(fixed.id), "yours"), xs: items }]
    : [
      ...(sd && sd.dir !== "neutral" ? [{ id: "signal", head: groupHeadText(sd.dir, "signals"), xs: items.filter((x) => x.family === "signal") }] : []),
      { id: "neutral", head: groupHeadText("neutral", "neutral"), xs: items.filter((x) => x.family !== "signal") },
    ];
  const sortedBy = findOrderOf(findOrder).tile;
  const sig = signalsParts({ sd: sd ? { ...sd, fused } : null, fixedLabel: fixed ? fixed.label : null });
  return (
    <div data-market-body style={{ padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* The whole line, for a screen reader and for the word counter: strategiesLine() says it once. */}
      <div data-signals-line aria-label={strategiesLine({ sd: sd ? { ...sd, fused } : null, fixedLabel: fixed ? fixed.label : null, order: findOrder,
        expKey: board ? board.expKey : null, dte: board ? board.dte : null })}>
        <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>
          {sig.lead}{sig.math && <> <span style={{ ...mono, ...tnum }}>{sig.math}</span></>}{sig.result && ` ${sig.result}`}
          {" "}<TextBtn onClick={onRead} style={{ fontSize: FS.sm, padding: 0, minHeight: 0 }}>{MARKET_READ_LINK}</TextBtn>
        </div>
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, lineHeight: LH.body }}>
          {strategiesNote({ order: findOrder, expKey: board ? board.expKey : null, dte: board ? board.dte : null, fixed: !!fixed })}
        </div>
      </div>
      {readingState && readingState.reading && <Note color={T.mut}>{marketReadingText(tk)}</Note>}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.head} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, textTransform: "uppercase", marginTop: 4 }}>{g.head}</div>
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
        </section>
      ))}
    </div>
  );
}

/** One card on Strategies (round 2): the COMPACT CandidateCard — the four figures, what it needs, where it stands against
 *  the signals, the future and the past in one line, the disagree sentence, ☆ · Compare · Open in chain · Build › — and
 *  "Details ▾" holding the full card as it was (tiles, picture row, sizing, the chance's make-up, per contract). */
export function StrategyCard({ x, size, misses, bars, sortedBy, findOrder, saved, ticked, onSave, onTick, onBuild, onChain, badge, onMore }) {
  const af = x.lf.aFill;
  const n = size && size.ok ? size.n : null;
  const mc = x.lf.mc;
  const signs = stopSigns({ fused: x.fused, flags: x.flags, feedBroken: x.feedBroken, noQuoteLegs: x.noQuoteLegs, contracts: n, askSize: x.touchSize });
  const st = signalStance(x.fused, sentimentDirection(x.sent));
  const stance = stanceText(st);
  const disagree = futurePastDisagree(futureFigures(mc, af, null, x.expKey), pastFigures(x.lf.bt, af));
  const common = {
    cardKey: x.key, name: `${x.tk} · ${x.name}`, legs: `${legsLine(x.legs)} · ${x.expKey}`, misses, signs, figures: sizedFigures(af, n),
    sizeText: size && size.ok ? sizeLine(size) : null, rr: x.lf.rr, pop: x.lf.pop, basis: mc ? chanceBasisLabel(mc) : null,
    picture: x.lf.bands ? { bands: x.lf.bands, legs: x.legs, entryNet: af.entry, spot: x.spot, bars: bars || NO_BARS,
      dte: x.dte, sigma: mc ? mc.sigma : undefined, driftAnnual: mc ? mc.driftAnnual : undefined, ticker: x.tk } : null,
    future: futureFigures(mc, af, n, x.expKey), past: pastFigures(x.lf.bt, af, n), ticker: x.tk, sortedBy,
    placeAtRest: findOrderOf(findOrder).id === "evSignal" ? placeLine(x, findOrder) : null,
  };
  const btn = { ...sans, flex: 1, minWidth: 0, minHeight: TAP, borderRadius: 10, fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer", padding: 0,
    whiteSpace: "nowrap" };
  return (
    <CandidateCard {...common} cardKey={x.key} compact needs={needsText(x.lf.bands, x.tk)} direction={stance}
      thumb={x.lf.bands ? <BandThumbnail bands={x.lf.bands} bars={bars || NO_BARS} width={72} height={40} lineWidth={1.5} /> : null}
      stanceKind={!st ? null : st.kind === "against" ? "against" : st.kind === "neutral" || st.kind === "quiet" ? "neutral" : "with"}
      disagree={disagree}
      actions={(
        <div data-card-actions style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* TWO ROWS SINCE PR 61: the tick shows its word ("Compare" / "✓ Comparing"), and four buttons with words do not
              fit one phone row ("Open in chain" was cut). ☆ and Compare, then Open in chain and Build ›. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", minHeight: TAP }}>
            <IconButton onClick={onSave} pressed={saved} label={ARIA.saveTrade(saved, x.tk, x.name)} color={saved ? T.amber : T.dim}
              style={{ fontSize: FS.lg, border: `1px solid ${T.field}` }}>{saved ? "★" : "☆"}</IconButton>
            {/* THE TICK SHOWS ITS WORD (PR 61): it selects the card for the one Compare sheet. */}
            <button onClick={onTick} aria-pressed={ticked} data-compare-tick
              style={{ ...btn, background: ticked ? T.raise : "transparent", color: ticked ? T.blue : T.ink,
                border: `1px solid ${ticked ? T.blue : T.field}` }}>{ticked ? COMPARE_TICK.on : COMPARE_TICK.off}</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", minHeight: TAP }}>
            <button onClick={onChain} style={{ ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.field}` }}>{OPEN_IN_CHAIN}</button>
            <button onClick={onBuild} style={{ ...btn, background: T.amber, color: T.onAccent, border: "none" }}>{BUILD_CTA}</button>
          </div>
        </div>
      )}
      details={<CandidateCard {...common} misses={[]} direction={stance} badge={badge}
        more={onMore ? { tk: x.tk, onOpen: () => onMore(x) } : null} style={{ background: T.bg }} cardKey={null} />} />
  );
}

/* ---------------------------------------------------------------- CHAIN (advanced) */
export function ChainTab({ tk, chain, clock, tray, setTray, cardFigures, quoteOf, seasonal, matrix, iv, liqFloor, onBuildLegs }) {
  const [mode, setMode] = useState("price");
  if (!chain || !chain.spot || !chain.expirations || !chain.expirations.length) return <Note style={{ padding: "10px 16px" }}>{chainNotLoadedText(tk)}</Note>;
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
  const cell = (q) => {
    if (mode === "greeks") return [fmt(q && q.delta), q && q.iv != null ? `${(q.iv * 100).toFixed(0)}%` : "—"];
    if (mode === "oi") return [q && q.oi != null ? String(q.oi) : "—", q && q.vol != null ? String(q.vol) : "—"];
    return [fmt(q && q.bid), fmt(q && q.ask)];
  };
  const head = CHAIN_HEAD[mode];
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr 60px 1fr 1fr", gap: 4, alignItems: "stretch" };
  /** One cell: in the money on `raise`; a thin strike dim; a buy in the tray filled amber "+1 2.40"; a sell ringed "−1 0.93". */
  const btn = (sel, itm, thin, enabled) => ({ ...mono, ...tnum, fontSize: FS.md, minHeight: 46, borderRadius: 8, padding: 0,
    cursor: enabled ? "pointer" : "default", fontWeight: sel ? FW.bold : FW.regular,
    background: sel === "buy" ? T.amber : itm ? T.raise : "transparent",
    color: sel === "buy" ? T.onAccent : thin ? (itm ? T.mut : T.dim) : T.ink,
    border: sel === "sell" ? `2px solid ${T.amber}` : "2px solid transparent" });
  const label = (sel, v) => (sel === "buy" ? `+1 ${v}` : sel === "sell" ? `−1 ${v}` : v);
  /** What scripts/audit-screen.mjs reads a cell by: in the money, and bought or sold on the tray. */
  const cellData = (sel, itm) => ({ "data-chain-cell": "true", "data-itm": itm ? "true" : undefined, "data-picked": sel || undefined });
  let spotDrawn = false;
  return (
    <div data-market-body>
      <div role="group" aria-label={ARIA.expiries} style={{ display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap", padding: "10px 16px 6px" }}>
        {chain.expirations.map((x) => {
          const d = chain.byExp[x].dte;
          const under = d < RULES.minEntryDTE;
          const on = x === ek;
          return (
            <button key={x} onClick={() => { if (!under) pick(x); }} aria-pressed={on} aria-label={ARIA.expiryChip(x, d, under)} data-short={under ? "true" : undefined}
              style={{ ...sans, flex: "0 0 auto", minWidth: 76, minHeight: 48, padding: "0 8px", borderRadius: 10, cursor: under ? "not-allowed" : "pointer",
                border: `1px ${under ? "dashed" : "solid"} ${on ? T.ink : T.line}`, background: on ? T.raise : "transparent",
                color: under ? T.dim : T.ink, fontWeight: on ? FW.bold : FW.regular, display: "inline-flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", lineHeight: LH.tight }}>
              <span style={{ ...mono, fontSize: FS.sm }}>{(expiryWords(x) || x).replace(/ \d{4}$/, "")}</span>
              <span style={{ fontSize: FS.xs, color: under ? T.dim : T.mut }}>{under ? underEntryText() : `${d}d`}</span>
            </button>
          );
        })}
      </div>
      <SegmentBar label={ARIA.chainShows} value={mode} onChange={setMode} style={{ margin: "4px 16px" }}
        items={CHAIN_MODES.map((md) => ({ id: md.id, label: md.label, disabled: md.id === "oi" && !oi }))} />
      <div data-chain-hint style={{ ...sans, fontSize: FS.xs, color: T.dim, lineHeight: LH.body, padding: "2px 16px 4px" }}>
        {trayEmptyText()}{!oi ? ` ${noOpenInterestText(feedName(chain))}.` : ""}
      </div>
      <div role="table" aria-label={ARIA.chainTable(tk, ek)} style={{ padding: "0 8px 260px" }}>
        <div role="row" style={{ ...grid, ...sans, fontSize: FS.xs, color: T.mut, textAlign: "center", padding: "4px 0" }}>
          <span role="columnheader">{`${CHAIN_HEAD.call} ${head[0]}`}</span><span role="columnheader">{`${CHAIN_HEAD.call} ${head[1]}`}</span>
          <span role="columnheader">{CHAIN_HEAD.strike}</span>
          <span role="columnheader">{`${CHAIN_HEAD.put} ${head[0]}`}</span><span role="columnheader">{`${CHAIN_HEAD.put} ${head[1]}`}</span>
        </div>
        {ks.map((k) => {
          const c = (e.calls || {})[k], p = (e.puts || {})[k];
          const [c1, c2] = cell(c), [p1, p2] = cell(p);
          const callOn = legCell(legs, "call", k), putOn = legCell(legs, "put", k);
          const thin = oi && Math.min(c && c.oi != null ? c.oi : Infinity, p && p.oi != null ? p.oi : Infinity) < liqFloor;
          const price = mode === "price";
          const showSpot = !spotDrawn && k >= spot;
          if (showSpot) spotDrawn = true;
          const cItm = k < spot, pItm = k > spot;
          const sel = (on, side) => (on === side ? (side === "ask" ? "buy" : "sell") : null);
          return (
            <React.Fragment key={k}>
              {showSpot && (
                <div role="row" data-spot style={{ position: "relative", height: 18, margin: "2px 0" }}>
                  {/* (The mockup: a dashed rule and the price in an ink pill.) */}
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 8, borderTop: `1px dashed ${T.field}` }} />
                  <span style={{ ...mono, ...tnum, position: "relative", display: "block", width: "max-content", margin: "0 auto", padding: "0 8px",
                    fontSize: FS.xs, fontWeight: FW.bold, color: T.bg, background: T.ink, borderRadius: 999, lineHeight: "18px" }}>{spotLineText(spot, spotState)}</span>
                </div>
              )}
              <div role="row" style={{ ...grid, marginTop: 4 }}>
                <button role="cell" {...cellData(sel(callOn, "bid"), cItm)} style={btn(sel(callOn, "bid"), cItm, thin, price)} disabled={!price || !c}
                  aria-label={ARIA.chainCell(-1, k, "call")} onClick={() => tap("call", k, -1)}>{label(sel(callOn, "bid"), c1)}</button>
                <button role="cell" {...cellData(sel(callOn, "ask"), cItm)} style={btn(sel(callOn, "ask"), cItm, thin, price)} disabled={!price || !c}
                  aria-label={ARIA.chainCell(1, k, "call")} onClick={() => tap("call", k, 1)}>{label(sel(callOn, "ask"), c2)}</button>
                <span role="cell" data-chain-strike style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: thin ? T.dim : T.ink, textAlign: "center",
                  background: T.panel, borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`,
                  display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: LH.tight }}>
                  {k}{thin && <span style={{ ...sans, fontSize: FS.xs, fontWeight: FW.regular, color: T.dim }}>{THIN}</span>}
                </span>
                <button role="cell" {...cellData(sel(putOn, "bid"), pItm)} style={btn(sel(putOn, "bid"), pItm, thin, price)} disabled={!price || !p}
                  aria-label={ARIA.chainCell(-1, k, "put")} onClick={() => tap("put", k, -1)}>{label(sel(putOn, "bid"), p1)}</button>
                <button role="cell" {...cellData(sel(putOn, "ask"), pItm)} style={btn(sel(putOn, "ask"), pItm, thin, price)} disabled={!price || !p}
                  aria-label={ARIA.chainCell(1, k, "put")} onClick={() => tap("put", k, 1)}>{label(sel(putOn, "ask"), p2)}</button>
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

/** The tray, FIXED above the bottom bar while the chain scrolls (round 2): the structure's name, the legs as chips, and
 *  Debit or Credit · Max profit · Max loss · Chance — through `listCardFigures()`, the function every card reads. Build is
 *  blocked, with the reason, on an uncovered short. */
function ChainTray({ tk, chain, ek, legs, note, cardFigures, quoteOf, seasonal, matrix, iv, onClear, onBuild }) {
  const e = chain.byExp[ek];
  const lf = useMemo(() => (legs.length && cardFigures && e
    ? cardFigures(legs, { spot: chain.spot, dte: e.dte, iv, q: quoteOf(chain, ek), ticker: tk, expKey: ek, seasonal, matrix })
    : null), [legs, cardFigures, chain, ek, e, iv, quoteOf, tk, seasonal, matrix]);
  const naked = undefinedRiskLegs(legs);
  const af = lf ? lf.aFill : null;
  const entry = af && Number.isFinite(af.entry) ? af.entry : null;
  const figs = [
    [entry == null ? TRAY_LABELS.debit : entry >= 0 ? TRAY_LABELS.debit : TRAY_LABELS.credit, entry == null ? "—" : money(Math.abs(entry) * 100)],
    [TRAY_LABELS.maxProfit, af ? (af.profitUnbounded ? TRAY_LABELS.noCap : af.maxProfit == null ? "—" : money(af.maxProfit)) : "—"],
    [TRAY_LABELS.maxLoss, af && af.maxLoss != null && !naked.length ? money(Math.abs(af.maxLoss)) : "—"],
    [TRAY_LABELS.chance, chanceText(lf ? lf.pop : null)],
  ];
  return (
    <div data-chain-tray style={{ position: "fixed", left: 0, right: 0, zIndex: 55,
      bottom: `calc(${BADGE_H + NAV_BAR_H}px + env(safe-area-inset-bottom, 0px))`, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 640, boxSizing: "border-box", background: T.panel, borderTop: `1px solid ${T.field}`,
        boxShadow: "0 -6px 18px rgba(0,0,0,0.22)", padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Empty, the tray holds its two buttons only: the hint line above the chain says what to tap. */}
        {legs.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span data-tray-name style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, marginRight: 4 }}>{structureName(legs, ek)}</span>
              {legs.map((l) => (
                <span key={`${l.type}${l.strike}`} data-tray-leg style={{ ...mono, ...tnum, fontSize: FS.xs, color: T.ink, border: `1px solid ${T.field}`,
                  borderRadius: 6, padding: "0 6px", lineHeight: "22px" }}>{legsLine([l])}</span>
              ))}
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, margin: 0 }}>
              {figs.map(([k, v]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <dt style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{k}</dt>
                  <dd style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, whiteSpace: "nowrap", margin: 0 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {naked.length > 0 && <Note color={T.red} role="alert">{uncoveredText()}</Note>}
        {note && <Note color={T.amber} role="status">{note}</Note>}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={!legs.length} onClick={onClear} style={{ ...sans, minHeight: TAP, padding: "0 16px", borderRadius: 10, fontSize: FS.sm,
            fontWeight: FW.bold, background: "transparent", color: T.ink, border: `1px solid ${T.field}`, cursor: legs.length ? "pointer" : "not-allowed",
            opacity: legs.length ? 1 : 0.5 }}>{TRAY_LABELS.clear}</button>
          <button disabled={!legs.length || naked.length > 0} onClick={onBuild} style={{ ...sans, flex: 1, minHeight: TAP, borderRadius: 10, fontSize: FS.sm,
            fontWeight: FW.bold, background: T.amber, color: T.onAccent, border: "none", cursor: !legs.length || naked.length ? "not-allowed" : "pointer",
            opacity: !legs.length || naked.length ? 0.5 : 1 }}>{BUILD_CTA}</button>
        </div>
      </div>
    </div>
  );
}
