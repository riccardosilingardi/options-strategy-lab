// src/learn.jsx — LEARN, THE FIGURE LAB (PR 74, owner 20 Oct 2026). The fifth place in the bottom bar.
//
// "Education, the figure lab, as on IBKR Campus: tabs that add a long or short call or put, blue points to drag, a card
// per figure." On a real market: its price, the strikes its chain lists, each strike's implied volatility; the premiums
// are the model's and say so. A sold option on its own is allowed here, to see what it does — the card says the app
// never sends it.
//
// IT COMPUTES NOTHING: App.jsx hands it `v` from learnView.js (`labModel()`, `labCard()`, `labLegRows()`,
// `labGallery()`) and the picture is visuals.jsx's `FigureChart`, cut from `payoffBands()`. NOTHING HERE SENDS OR
// SAVES: no order path, no gate call, no fetch (learn.test.js reads this file). Atoms from ui.jsx, sizes from TYPE.
import React, { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Note, Sheet, FilterChip, IconButton, TextBtn, TAP, useBoxWidth, Info, ContractName, ListingName, Segments } from "./ui.jsx";
import { FigureChart, FigureLegendLine as LegendLine } from "./visuals.jsx";
import { LEARN_WORDS as W, listingLine, listingName, listingSearchInfo, LISTING_SEARCH_LABEL } from "./rules.js";
import { getU } from "./markets.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const PANEL = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12 };
const H2 = { ...sans, margin: 0, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, lineHeight: LH.tight };
const tnum = { fontVariantNumeric: "tabular-nums" };

/**
 * v: {
 *   wide, ticker, markets: [tk], onMarket(tk), listingOf(tk) (PR 76: { exchange, name } or null), where ("GLD · 27 Nov · 38 days"), canPrevExp, canNextExp, onExpiry(dir),
 *   status: null | { text, retry? },      the chain loading, missing or without a usable board
 *   tabs: [{ id, label, onAdd }], full (the leg cap's sentence when reached),
 *   chart: { bands, legs, spot, onMove(i, drag), onStep(i, dir), label(i),
 *            curves, extremes, density, readout(s), snapLabel(i), market: { pop, text }, legend: [{ id, text, drawn }] },
 *   legs: [{ i, text, price, canMinus, canPlus, onMinus, onPlus, onFlip, flipLabel, onRemove }],
 *   card: labCard() | null, onClear, gallery: [{ id, name, idea, bands, spot, current, onLoad }],
 *   draw (PR 77): { mode: "points" | "draw", onMode, stroke, onStroke, canUndo, onUndo, onRedraw,
 *                   cards: [{ id, name, bands, tag, uncovered, sibling, onLoad }], lines: [sentence] } | null
 * }
 */
export function LearnScreen({ v }) {
  const [pick, setPick] = useState(false);
  const listingOf = typeof v.listingOf === "function" ? v.listingOf : () => null;
  const [boxRef, boxW] = useBoxWidth(358);
  const chartW = Math.max(240, Math.min(boxW || 358, 760));
  return (
    <div data-learn style={{ paddingBottom: 8 }}>
      <header style={{ padding: "12px 16px 0" }}>
        <h1 data-view-heading tabIndex={-1} style={{ ...sans, margin: 0, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
          outline: "none" }}>{W.title}</h1>
        <p data-learn-sub style={{ ...sans, margin: "2px 0 0", fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>{W.sub}</p>
      </header>
      <main data-learn-cols={v.wide ? "2" : "1"} style={v.wide
        ? { display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 1fr)", gap: 16, alignItems: "start", padding: "12px 16px 0", maxWidth: 1440 }
        : { display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px 0" }}>
        {/* ON A COMPUTER: the lab on the left (market, tabs, picture, legs); the figure's card and the gallery on the right. */}
        <div data-learn-col="lab" style={v.wide ? { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } : { display: "contents" }}>
          <section data-learn-market aria-label={W.market} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <FilterChip name={W.market} value={listingLine(v.ticker, listingOf(v.ticker))} opens onClick={() => setPick(true)} label={`${W.market}: ${v.ticker}`} />
            <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              <IconButton label="Earlier expiry" disabled={!v.canPrevExp} onClick={() => v.onExpiry(-1)}>‹</IconButton>
              <span data-learn-where style={{ ...mono, ...tnum, fontSize: FS.sm, color: T.ink }}>{v.where}</span>
              <IconButton label="Later expiry" disabled={!v.canNextExp} onClick={() => v.onExpiry(1)}>›</IconButton>
            </div>
          </section>
          {/* PR 76: the market's official name, as IBKR prints it under "UNG · ARCA" (read from Alpaca; nothing when not read). */}
          <ListingName name={listingName(listingOf(v.ticker))} data-learn-listing="" style={{ marginTop: -6 }} />

          {v.status ? (
            <div data-learn-status style={{ ...PANEL, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <Note style={{ margin: 0, flex: 1 }}>{v.status.text}</Note>
              {v.status.retry && <TextBtn onClick={v.status.retry}>{W.retry}</TextBtn>}
            </div>
          ) : (
            <>
              <div role="group" aria-label="Add an option" data-learn-tabs style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {v.tabs.map((t) => (
                  <FilterChip key={t.id} label={t.label} onClick={t.onAdd} strong style={v.full ? { opacity: 0.5, cursor: "not-allowed" } : null}>
                    <span data-learn-tab={t.id}>{t.label}</span>
                  </FilterChip>
                ))}
              </div>
              {v.full && <Note data-learn-full style={{ margin: 0 }}>{v.full}</Note>}

              {/* PR 77: what a finger does on the picture — move the points, or draw the figure you want. */}
              {v.draw && <div data-learn-mode style={{ display: "flex" }}><Segments items={[{ id: "points", label: W.modePoints }, { id: "draw", label: W.modeDraw }]}
                value={v.draw.mode} onChange={v.draw.onMode} label={W.modeLabel} /></div>}
              <div ref={boxRef} data-learn-chart style={{ minWidth: 0 }}>
                <FigureChart bands={v.chart.bands} legs={v.chart.legs} spot={v.chart.spot} width={chartW} height={v.wide ? 320 : 260}
                  onMove={v.chart.onMove} onStep={v.chart.onStep} handleLabel={v.chart.label} curves={v.chart.curves}
                  extremes={v.chart.extremes} density={v.chart.density} readout={v.chart.readout} snapLabel={v.chart.snapLabel}
                  drawMode={!!v.draw && v.draw.mode === "draw"} stroke={v.draw ? v.draw.stroke : null} onStroke={v.draw ? v.draw.onStroke : null} />
              </div>
              {/* PR 77: DRAWN — Undo and Redraw on one row, then the closest figures (the defined-risk one first when the closest
                  is a figure the app never sends), or the sentence that names none. A tap loads one into the lab. */}
              {v.draw && v.draw.mode === "draw" && (
                <section data-learn-draw aria-label={W.closest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {!v.draw.stroke && <Note style={{ margin: 0 }}>{W.drawHint}</Note>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <TextBtn onClick={v.draw.onUndo} disabled={!v.draw.canUndo} height={TAP} style={{ opacity: v.draw.canUndo ? 1 : 0.5 }}>{W.undo}</TextBtn>
                    <TextBtn onClick={v.draw.onRedraw} disabled={!v.draw.stroke} height={TAP} style={{ opacity: v.draw.stroke ? 1 : 0.5 }}>{W.redraw}</TextBtn>
                  </div>
                  {v.draw.cards.length > 0 && (
                    <>
                      <h2 style={H2}>{W.closest.toUpperCase()}</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                        {v.draw.cards.map((c) => (
                          <button key={c.id} data-learn-match={c.id} data-sibling={c.sibling ? "true" : undefined} onClick={c.onLoad}
                            style={{ ...PANEL, ...sans, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: 8, textAlign: "left",
                              cursor: "pointer", color: T.ink, minHeight: TAP, minWidth: 0, border: `1px solid ${c.sibling ? T.green : T.line}` }}>
                            <FigureChart compact bands={c.bands} spot={v.chart.spot} width={96} height={44} />
                            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, lineHeight: LH.tight }}>{c.name}</span>
                            <span style={{ fontSize: FS.xs, color: c.sibling ? T.green : T.mut, lineHeight: LH.tight }}>{c.tag}</span>
                            {c.uncovered && <span data-learn-match-warn style={{ fontSize: FS.xs, color: T.amber, lineHeight: LH.tight }}>{W.neverSentShort}</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {v.draw.lines.map((t) => <Note key={t} data-learn-draw-line style={{ margin: 0 }}>{t}</Note>)}
                </section>
              )}
              {/* PR 76: what each curve is, then the market's chance with the band's ⓘ. */}
              {v.chart.legend && (
                <div data-learn-legend style={{ display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 2, ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>
                  {v.chart.legend.map((e) => (
                    <span key={e.id} data-learn-legend-item={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {e.drawn && <LegendLine id={e.id} />}{e.text}
                    </span>
                  ))}
                </div>
              )}
              {v.chart.market && (
                <div data-learn-market-chance style={{ ...sans, fontSize: FS.xs, color: T.body, lineHeight: LH.body }}>
                  {v.chart.market.text} {v.chart.density && v.chart.density.length > 0 && <Info label={W.band}>{W.bandInfo(v.ticker)}</Info>}
                </div>
              )}
              {v.legs.length ? <Note style={{ margin: 0 }}>{W.drag}</Note> : <Note data-learn-empty style={{ margin: 0 }}>{W.empty}</Note>}

              {v.legs.length > 0 && (
                <ul data-learn-legs style={{ listStyle: "none", margin: 0, padding: 0, ...PANEL }}>
                  {v.legs.map((l, n) => (
                    <li key={l.i} data-learn-leg={l.i} style={{ display: "flex", flexDirection: "column", gap: 0, padding: "8px 6px 2px 12px",
                      borderTop: n ? `1px solid ${T.line}` : "none", minWidth: 0 }}>
                      {/* PR 76: the contract as IBKR writes it, and under it the chain's own OCC symbol with Copy (none when the chain
                          gives none — never one built), each on a line of its own (as Build's legs since PR 72); then the leg's price
                          and the leg's controls. */}
                      {l.occ ? <ContractName name={l.name} occ={l.occ} nameProps={{ "data-learn-leg-name": "" }} />
                        : <div data-learn-leg-name style={{ ...mono, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>{l.name}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <div style={{ ...mono, ...tnum, flex: 1, minWidth: 0, fontSize: FS.xs, color: T.mut }}>{l.price}</div>
                        <IconButton label={`Lower strike: ${l.text}`} disabled={!l.canMinus} onClick={l.onMinus}><Minus size={18} aria-hidden="true" /></IconButton>
                        <IconButton label={`Higher strike: ${l.text}`} disabled={!l.canPlus} onClick={l.onPlus}><Plus size={18} aria-hidden="true" /></IconButton>
                        <TextBtn onClick={l.onFlip} height={TAP} aria-label={`${l.flipLabel}: ${l.text}`}>{l.flipLabel}</TextBtn>
                        <IconButton label={`Remove: ${l.text}`} onClick={l.onRemove}><X size={18} aria-hidden="true" /></IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div data-learn-col="cards" style={v.wide ? { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } : { display: "contents" }}>
          {v.card && (
            <section data-learn-card={v.card.id} aria-label={v.card.name} style={{ ...PANEL, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <h2 style={{ ...sans, margin: 0, fontSize: FS.lg, fontWeight: FW.bold, color: T.ink, lineHeight: LH.tight }}>{v.card.name}</h2>
                <TextBtn onClick={v.onClear}>{W.clear}</TextBtn>
              </div>
              <div data-learn-risk={v.card.risk.tone} style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body,
                color: v.card.risk.tone === "warn" ? T.amber : T.body }}>{v.card.risk.text}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                {v.card.rows.map((r) => (
                  <div key={r.id} data-learn-row={r.id} style={{ minWidth: 0 }}>
                    <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{r.label}</div>
                    <div style={{ ...mono, ...tnum, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, overflowWrap: "anywhere" }}>{r.value}</div>
                  </div>
                ))}
              </div>
              {v.card.needs && <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>{v.card.needs}</div>}
              {v.card.missing.map((t) => <Note key={t} color={T.amber} style={{ margin: 0 }}>{t}</Note>)}
            </section>
          )}

          <section data-learn-gallery aria-label={W.gallery} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <h2 style={H2}>{W.gallery.toUpperCase()}</h2>
              <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{W.galleryNote}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {v.gallery.map((g) => (
                <button key={g.id} data-learn-figure={g.id} onClick={g.onLoad} disabled={!g.onLoad} aria-pressed={g.current}
                  style={{ ...PANEL, ...sans, display: "flex", alignItems: "center", gap: 12, padding: 10, textAlign: "left", cursor: g.onLoad ? "pointer" : "not-allowed",
                    border: `1px solid ${g.current ? T.ink : T.line}`, color: T.ink, minHeight: TAP, opacity: g.onLoad ? 1 : 0.5, minWidth: 0 }}>
                  <span style={{ flexShrink: 0 }}>
                    <FigureChart compact bands={g.bands} spot={g.spot} width={84} height={44} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: FS.sm, fontWeight: FW.bold, lineHeight: LH.tight }}>{g.name}</span>
                    <span style={{ display: "block", fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 2 }}>{g.idea}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Sheet open={pick} title={W.market} value={listingLine(v.ticker, listingOf(v.ticker))} onClose={() => setPick(false)}>
        {/* PR 76: finding the market in IBKR — by its symbol, not its word. */}
        <Info label={LISTING_SEARCH_LABEL}>{listingSearchInfo(v.ticker, getU(v.ticker).name)}</Info>
        <div data-learn-markets style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {v.markets.map((tk) => (
            <FilterChip key={tk} off={tk === v.ticker} label={tk} onClick={() => { v.onMarket(tk); setPick(false); }}>
              <span style={mono}>{listingLine(tk, listingOf(tk))}</span>
            </FilterChip>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
