// ============================================================================
// src/saved.jsx — SAVED, INSIDE FIND (PR #47; redesign PR 1; round 2: moved out of App.jsx and drawn in Find's row
// grammar, owner's mockups of 4 Oct 2026).
//
// Saved trades show "When saved" beside "Now" for Chance, Future avg and You risk, with Build › and Remove. Orders that
// were sent and never filled stay here with their tag (owner, 4 Oct 2026). On every row, what it would have done is
// behind one fold: nothing is cut. IT COMPUTES NOTHING: every figure is handed in (App.jsx's `watchRows` and
// `savedNow`, priced through `listCardFigures()`); this file only draws them.
// ============================================================================
import React from "react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Fold, Note } from "./ui.jsx";
import { BandThumbnail, Gauge, payoffBands, bandTakeaway } from "./visuals.jsx";
import { legsLine } from "./path.js";
import { SAVED_COLUMNS, SAVED_ROWS, NOT_RECORDED, NOT_ON_CHAIN, savedEmptyText, SAVED_REMOVE, BUILD_CTA, WOULD_HAVE_DONE, per100Text,
  chanceText, money, rowSubtitleText, SAVED_PRICED_NOTE } from "./rules.js";
import { ActionBtn } from "./find.jsx";

/** "saved Mon 28 Sep" (the mockup), or "sent Mon 28 Sep" for an order that came back with nothing bought. */
const savedWhenText = (at, kind) => `${kind === "saved" ? "saved" : "sent"} ${new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}`;

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const NO_BARS = [];

export function SavedList({ rows = [], savedNow = {}, barsCache = {}, ago = (d) => String(d), fmtMoney = money, onBuild, onRemove }) {
  return (
    <div data-saved>
      <div style={{ padding: "4px 16px 6px" }}>
        <Fold summary="Nothing here is a position and nothing here is money." label="why" tone={T.mut}>
          <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>
            These are structures you saved, and orders that were sent and came back with nothing bought — kept so you
            can see what they would have done. No exit plan runs on them, none of them counts towards your exposure,
            and none of the figures below is a profit or a loss.
          </div>
        </Fold>
      </div>
      {rows.length === 0 && (
        <div style={{ ...sans, fontSize: FS.sm, color: T.mut, padding: "10px 16px", lineHeight: LH.body, borderTop: `1px solid ${T.line}` }}>{savedEmptyText()}</div>
      )}
      {/* ONE CARD PER SAVED TRADE (the mockup "Find · Saved"): panel cards 10px apart, the footnote last. */}
      <div role="list" aria-label="Saved trades" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px" }}>
        {rows.map((r) => <SavedRow key={r.key} r={r} now={r.kind === "saved" ? savedNow[r.saved.id] : null} bars={barsCache[r.ticker] || NO_BARS}
          ago={ago} fmtMoney={fmtMoney} onBuild={() => onBuild && onBuild(r)} onRemove={() => onRemove && onRemove(r)} />)}
        {rows.length > 0 && <div style={{ ...sans, fontSize: FS.xs, lineHeight: LH.body, color: T.mut, padding: "0 2px" }}>{SAVED_PRICED_NOTE}</div>}
      </div>
    </div>
  );
}

function SavedRow({ r, now, bars, ago, fmtMoney, onBuild, onRemove }) {
  const w = r.would;
  const bands = r.spot ? payoffBands({ legs: r.legs, entryNet: r.entryNet, spot: r.spot }) : null;
  const sv = r.kind === "saved" ? r.saved : null;
  const whenRisk = sv && sv.maxLoss != null && Number.isFinite(Number(sv.maxLoss)) ? Math.abs(Number(sv.maxLoss)) : null;
  return (
    <div role="listitem" data-saved-row={r.key} style={{ display: "flex", flexDirection: "column", gap: 8, background: T.panel,
      border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px" }}>
      {/* THE HEAD (the mockup): the ticker and the structure in 15 bold, when it was saved on the right. */}
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ minWidth: 0 }}>
          <span data-saved-ticker style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{r.ref ? `${r.ref} ` : ""}{r.ticker}</span>
          <span data-saved-name style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{` · ${rowSubtitleText(r.name, r.expKey)}`}</span>
        </span>
        <span data-saved-when style={{ ...sans, fontSize: FS.xs, color: T.mut, whiteSpace: "nowrap" }}>{r.at ? savedWhenText(r.at, r.kind) : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* WHICH OF THE TWO IT IS, on the card: "I chose not to" and "I tried and missed" are different facts. */}
          <span style={{ ...sans, fontSize: FS.xs, lineHeight: "18px", padding: "0 6px", borderRadius: 6, whiteSpace: "nowrap",
            border: `1px solid ${T.field}`, color: r.kind === "saved" ? T.mut : T.amber }}>
            {r.kind === "saved" ? "Saved, never sent" : `Sent · ${String(r.status || "finished").replace(/_/g, " ")}`}
          </span>
          <span style={{ ...mono, display: "block", fontSize: FS.xs, color: T.mut, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {legsLine(r.legs)}{r.at ? ` · ${ago(r.at)}` : ""}
          </span>
        </span>
        {bands && <span aria-hidden="true" style={{ flex: "0 0 72px", width: 72, height: 40, borderRadius: 4, overflow: "hidden" }}>
          <BandThumbnail bands={bands} bars={bars} width={72} height={40} lineWidth={1.5} />
        </span>}
      </div>

      {/* WHEN SAVED · NOW: three figures, one contract, in mono. A figure not saved with the item reads "not recorded";
          an expiry today's chain does not list reads "not on today's chain". */}
      {sv && (
        <div role="table" aria-label="When saved and now" data-saved-grid style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "4px 12px", fontSize: FS.sm }}>
          <span />
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut, textAlign: "right" }}>{SAVED_COLUMNS.when}</span>
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut, textAlign: "right" }}>{SAVED_COLUMNS.now}</span>
          {[
            [SAVED_ROWS.chance, sv.pop == null ? NOT_RECORDED : chanceText(sv.pop), now ? chanceText(now.pop) : NOT_ON_CHAIN, sv.pop, now ? now.pop : null],
            [SAVED_ROWS.future, sv.futureAvg == null ? NOT_RECORDED : per100Text(sv.futureAvg), now ? per100Text(now.per100) : NOT_ON_CHAIN, sv.futureAvg, now ? now.per100 : null],
            [SAVED_ROWS.risk, whenRisk == null ? NOT_RECORDED : money(whenRisk), now ? (now.risk == null ? "—" : money(now.risk)) : NOT_ON_CHAIN, null, null],
          ].map(([k, a, b, x0, x1]) => (
            <React.Fragment key={k}>
              <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>{k}</span>
              <span style={{ ...(/^[a-z]/.test(a) ? sans : mono), fontSize: FS.sm, color: T.ink, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a}</span>
              {/* NOW, against when saved (the mockup): better in green, worse in amber, the same in ink. A reading, never red. */}
              <span style={{ ...(/^[a-z]/.test(b) ? sans : mono), fontSize: FS.sm, fontWeight: FW.bold, textAlign: "right", fontVariantNumeric: "tabular-nums",
                color: x0 == null || x1 == null || Number(x1) === Number(x0) ? T.ink : Number(x1) > Number(x0) ? T.green : T.amber }}>{b}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      <Fold summary={WOULD_HAVE_DONE} label="show" tone={T.mut}>
        {bands && (
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <BandThumbnail bands={bands} bars={bars} width={200} height={40} title={bandTakeaway(bands, { ticker: r.ticker })} />
            <Gauge bands={bands} size={96} ticker={r.ticker} />
          </div>
        )}
        {/* THE THEORETICAL FIGURE, AND IT MAY NEVER LOOK LIKE A REAL ONE. Muted, never red or green, with the sentence
            beside it — `wouldHaveDone()` returns the two together so one cannot be rendered without the other. */}
        <div style={{ marginTop: 9, padding: "8px 10px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
            {[["WOULD HAVE OPENED AT", Number.isFinite(Number(r.entryNet)) ? fmtMoney(Math.abs(Number(r.entryNet)) * 100 * r.contracts) : "—"],
              ["WORTH TODAY", r.nowNet != null ? fmtMoney(Math.abs(r.nowNet) * 100 * r.contracts) : "—"],
              ["DIFFERENCE", w ? `${w.pnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(w.pnl))}` : "—"]].map(([k, v]) => (
              <div key={k}>
                <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{k}</div>
                <div style={{ ...mono, fontSize: FS.sm, fontWeight: FW.bold, color: T.mut }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ ...sans, fontSize: FS.sm, color: T.body, marginTop: 6, lineHeight: LH.body }}>
            {w ? w.sentence
              : `Today's price for this structure cannot be read, so there is nothing to compare the ` +
                `opening price with. That is a missing number, not a flat result.`}
          </div>
          {/* AND WHICH PRICE IT STARTED FROM. A row begun at the mid flatters itself for ever. */}
          <Note style={{ marginTop: 5 }}>
            {r.entrySource === "limit"
              ? `Opened at the price that would really have been paid, not the mid.`
              : `This one starts from the MID — the middle of the market, which is not a price anybody ` +
                `has to give you. Read it as the friendliest version of what would have happened.`}
          </Note>
        </div>
      </Fold>

      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn onClick={onRemove}>{SAVED_REMOVE}</ActionBtn>
        <ActionBtn primary onClick={onBuild} style={{ flex: 1 }}>{BUILD_CTA}</ActionBtn>
      </div>
    </div>
  );
}
