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
import { Trash2 } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { mono, sans, Btn, Fold, Note } from "./ui.jsx";
import { BandThumbnail, Gauge, payoffBands, bandTakeaway } from "./visuals.jsx";
import { legsLine } from "./path.js";
import { SAVED_COLUMNS, SAVED_ROWS, NOT_RECORDED, NOT_ON_CHAIN, savedEmptyText, SAVED_REMOVE, BUILD_CTA, WOULD_HAVE_DONE, per100Text,
  chanceText, money } from "./rules.js";

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
      <div role="list" aria-label="Saved trades">
        {rows.map((r) => <SavedRow key={r.key} r={r} now={r.kind === "saved" ? savedNow[r.saved.id] : null} bars={barsCache[r.ticker] || NO_BARS}
          ago={ago} fmtMoney={fmtMoney} onBuild={() => onBuild && onBuild(r)} onRemove={() => onRemove && onRemove(r)} />)}
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
    <div role="listitem" data-saved-row={r.key} style={{ borderTop: `1px solid ${T.line}`, padding: "10px 16px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <span style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{r.ref ? `${r.ref} ` : ""}{r.ticker}</span>
            {/* WHICH OF THE TWO IT IS, on the row: "I chose not to" and "I tried and missed" are different facts. */}
            <span style={{ ...sans, fontSize: FS.xs, lineHeight: "18px", padding: "0 6px", borderRadius: 6, whiteSpace: "nowrap",
              border: `1px solid ${T.field}`, color: r.kind === "saved" ? T.mut : T.amber }}>
              {r.kind === "saved" ? "Saved, never sent" : `Sent · ${String(r.status || "finished").replace(/_/g, " ")}`}
            </span>
            <span style={{ ...mono, fontSize: FS.xs, color: T.dim, marginLeft: "auto" }}>{r.at ? ago(r.at) : ""}</span>
          </span>
          <span style={{ ...sans, display: "block", fontSize: FS.xs, color: T.mut, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.name} · <span style={mono}>{legsLine(r.legs)}{r.expKey ? ` · ${r.expKey}` : ""}</span>
          </span>
        </span>
        {bands && <span aria-hidden="true" style={{ flex: "0 0 72px", width: 72, height: 40, borderRadius: 4, overflow: "hidden" }}>
          <BandThumbnail bands={bands} bars={bars} width={72} height={40} lineWidth={1.5} />
        </span>}
      </div>

      {/* WHEN SAVED · NOW: three figures, one contract, in mono. A figure not saved with the item reads "not recorded";
          an expiry today's chain does not list reads "not on today's chain". */}
      {sv && (
        <div role="table" aria-label="When saved and now" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "2px 8px", marginTop: 8 }}>
          <span />
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut, textAlign: "right" }}>{SAVED_COLUMNS.when}</span>
          <span style={{ ...sans, fontSize: FS.xs, color: T.mut, textAlign: "right" }}>{SAVED_COLUMNS.now}</span>
          {[
            [SAVED_ROWS.chance, sv.pop == null ? NOT_RECORDED : chanceText(sv.pop), now ? chanceText(now.pop) : NOT_ON_CHAIN],
            [SAVED_ROWS.future, sv.futureAvg == null ? NOT_RECORDED : per100Text(sv.futureAvg), now ? per100Text(now.per100) : NOT_ON_CHAIN],
            [SAVED_ROWS.risk, whenRisk == null ? NOT_RECORDED : money(whenRisk), now ? (now.risk == null ? "—" : money(now.risk)) : NOT_ON_CHAIN],
          ].map(([k, a, b]) => (
            <React.Fragment key={k}>
              <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{k}</span>
              <span style={{ ...(/^[a-z]/.test(a) ? sans : mono), fontSize: FS.xs, color: T.mut, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a}</span>
              <span style={{ ...(/^[a-z]/.test(b) ? sans : mono), fontSize: FS.xs, color: T.ink, fontWeight: FW.bold, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      <Fold summary={WOULD_HAVE_DONE} label="show" tone={T.mut} style={{ marginTop: 2 }}>
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

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Btn small ghost color={T.mut} onClick={onRemove} style={{ border: `1px solid ${T.field}`, borderRadius: 10 }}>
          <Trash2 size={14} aria-hidden="true" /> {SAVED_REMOVE}
        </Btn>
        <Btn color={T.amber} onClick={onBuild} style={{ flex: 1, borderRadius: 10, fontSize: FS.sm }}>{BUILD_CTA}</Btn>
      </div>
    </div>
  );
}
