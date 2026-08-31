// AUTOPILOT — Netlify Scheduled Function (giorni feriali 11:00 UTC ≈ 13:00 CET, pre-apertura USA)
// Ciclo: posizioni → dati oggettivi (chain CBOE, stagionalità) → TIS + Exit Simulator → brief Claude → approve link → webhook
import { getStore } from "@netlify/blobs";
import { netBS, probProfit, exitSim, SEASONAL, SIGMA } from "../../src/engine.js";

export const config = { schedule: "0 11 * * 1-5" };

const HDRS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Referer": "https://www.cboe.com/", "Origin": "https://www.cboe.com" };
async function fetchChain(sym) {
  for (const cand of [sym, `_${sym}`]) {
    try {
      const r = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${cand}.json`, { headers: HDRS });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.data?.options?.length) return j.data;
    } catch { /* next */ }
  }
  return null;
}
function markFromChain(data, pos) {
  if (!data) return null;
  const spot = data.current_price ?? data.close ?? null;
  const exp = (pos.expKey || "").replaceAll("-", "").slice(2);
  let net = 0, found = 0;
  for (const l of pos.legs) {
    const k = String(Math.round(l.strike * 1000)).padStart(8, "0");
    const occ = `${pos.ticker}${exp}${l.type === "call" ? "C" : "P"}${k}`;
    const o = data.options.find((x) => x.option === occ);
    if (o && o.bid > 0 && o.ask > 0) { net += Math.sign(l.side) * l.qty * (o.bid + o.ask) / 2; found++; }
  }
  const ivs = [];
  for (const l of pos.legs) {
    const k = String(Math.round(l.strike * 1000)).padStart(8, "0");
    const occ = `${pos.ticker}${exp}${l.type === "call" ? "C" : "P"}${k}`;
    const o = data.options.find((x) => x.option === occ);
    if (o?.iv) ivs.push(o.iv);
  }
  return { spot, net: found === pos.legs.length ? net : null, iv: ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null };
}
function computeTIS(pos, cur) {
  const th = pos.thesis || {};
  let pts = 0;
  pts += th.pop && cur.pop ? Math.round(Math.max(0, Math.min(1.2, cur.pop / th.pop)) / 1.2 * 40) : 20;
  const same = th.seasonal == null || Math.sign(th.seasonal) === Math.sign(cur.seasonalNow);
  pts += same ? 16 : 4;
  const fav = (Math.sign(th.vega ?? 1) || 1) * ((cur.ivNow ?? th.iv ?? 0.25) - (th.iv ?? 0.25));
  pts += fav > 0.01 ? 20 : fav < -0.02 ? 2 : 10;
  pts += cur.dteLeft > 14 ? 20 : cur.dteLeft > 7 ? 10 : 0;
  return pts;
}

/* ---------- ciclo ---------- */
export default async () => {
  const store = getStore("autopilot");
  const state = JSON.parse((await store.get("state")) || "{}");
  const approvals = JSON.parse((await store.get("approvals")) || "{}");
  const briefsPrev = JSON.parse((await store.get("briefs")) || "{}");
  const positions = state.positions || [];
  if (!positions.length) return new Response("no positions");
  const webhook = Netlify.env.get("WEBHOOK_URL") || state.settings?.webhook || null;
  const anthKey = Netlify.env.get("ANTHROPIC_KEY");
  const siteUrl = Netlify.env.get("URL") || "https://options-strategy-lab.netlify.app";
  const month = new Date().getMonth();
  const out = [];

  for (const pos of positions) {
    const dteLeft = Math.max(0, Math.round((new Date(pos.expiry) - Date.now()) / 864e5));
    const data = await fetchChain(pos.ticker);
    const m = markFromChain(data, pos);
    const spot = m?.spot ?? pos.entrySpot;
    const iv = m?.iv ?? pos.thesis?.iv ?? 0.25;
    const markNet = m?.net ?? netBS(pos.legs, spot, dteLeft, iv);
    const pnl = (markNet - pos.entryNet) * 100;
    const pop = probProfit(pos.legs, pos.entryNet, spot, iv, Math.max(1, dteLeft));
    const seasonalNow = (SEASONAL[pos.ticker] || SEASONAL.SPY)[month];
    const tis = computeTIS(pos, { pop, ivNow: iv, seasonalNow, dteLeft });
    const sim = exitSim(pos, spot, dteLeft, iv, SIGMA[pos.ticker] || 0.25);
    const pctMax = pos.maxProfit > 0 ? (pnl / pos.maxProfit) * 100 : 0;

    // anti-rumore: nessun cambiamento materiale → riga singola
    const prev = briefsPrev[pos.id];
    const material = !prev || Math.abs((prev.tis ?? 50) - tis) >= 10 || pctMax >= 50 || pnl <= 0.5 * pos.maxLoss || dteLeft <= 7 || (prev.dteLeft ?? 99) > 7;

    let verdict = "HOLD", rationale = "Nessun cambiamento materiale: HOLD confermato.", evidence = [], invalidation = "";
    if (material && anthKey) {
      try {
        const facts = {
          posizione: { ticker: pos.ticker, nome: pos.name, legs: pos.legs, exp: pos.expKey, dteLeft },
          obiettivo: { tp50: +(0.5 * pos.maxProfit).toFixed(0), sl50: +(0.5 * pos.maxLoss).toFixed(0), regola_dte: 7 },
          tesi_ingresso: pos.thesis,
          oggi: { fonte_chain: data ? "CBOE delayed" : "modello BS", spot: +spot.toFixed(2), pnl: +pnl.toFixed(0), pct_max_profit: +pctMax.toFixed(0), pop_ora: +(pop * 100).toFixed(0), iv_ora: +(iv * 100).toFixed(0), tis, stagionale_mese: seasonalNow },
          simulatore_da_oggi: { p_tp50_prima: +(sim.pTP * 100).toFixed(0), p_stop_prima: +(sim.pSL * 100).toFixed(0), p_exit7dte_positivo: +(sim.pTimePos * 100).toFixed(0), pnl_atteso_regole: +sim.ev.toFixed(0), giorni_mediani_tp: sim.medDays },
        };
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 700,
            system: "Sei l'autopilot di un trader di opzioni PAPER con regole ferree: TP 50% max profit, SL 50% max loss, exit 7 DTE. Ricevi SOLO dati oggettivi. Rispondi SOLO JSON valido: {\"verdict\":\"HOLD|CHIUDI_TUTTO|STOP\",\"confidence\":0-100,\"rationale\":\"1 frase\",\"evidence\":[\"3-5 evidenze, ognuna con numero e fonte dai dati\"],\"invalidation\":\"a quale livello di spot/pnl il verdetto cambia\"}. Verdetto CHIUDI_TUTTO se pct_max_profit>=50 o il simulatore favorisce nettamente l'incasso; STOP se pnl<=sl50 o tesi crollata (tis<40 con pnl negativo); altrimenti HOLD.",
            messages: [{ role: "user", content: JSON.stringify(facts) }],
          }),
        });
        const j = await r.json();
        const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const parsed = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
        verdict = parsed.verdict || verdict; rationale = parsed.rationale || rationale;
        evidence = parsed.evidence || []; invalidation = parsed.invalidation || "";
      } catch (e) { rationale = `AI non disponibile (${String(e.message).slice(0, 60)}): applico regole meccaniche.`; }
    }
    // fallback regole meccaniche
    if (pctMax >= 50 && verdict === "HOLD") { verdict = "CHIUDI_TUTTO"; rationale = "Regola: raggiunto TP 50% del max profit."; }
    if (pnl <= 0.5 * pos.maxLoss) { verdict = "STOP"; rationale = "Regola: toccato SL 50% della max loss."; }
    if (dteLeft <= 7 && verdict === "HOLD") { verdict = "CHIUDI_TUTTO"; rationale = "Regola: finestra ≤7 DTE."; }

    // ordine proposto + approve link (solo se azione richiesta)
    let approveUrl = null;
    if (verdict !== "HOLD") {
      const exp = (pos.expKey || "").replaceAll("-", "").slice(2);
      const mlegs2 = pos.legs.map((l) => ({
        symbol: `${pos.ticker}${exp}${l.type === "call" ? "C" : "P"}${String(Math.round(l.strike * 1000)).padStart(8, "0")}`,
        ratio_qty: String(l.qty), side: l.side > 0 ? "sell" : "buy",
        position_intent: l.side > 0 ? "sell_to_close" : "buy_to_close",
      }));
      const order = mlegs2.length === 1
        ? { symbol: mlegs2[0].symbol, qty: mlegs2[0].ratio_qty, side: mlegs2[0].side, type: "market", time_in_force: "day" }
        : { order_class: "mleg", qty: "1", type: "market", time_in_force: "day", legs: mlegs2.slice(0, 4) };
      const id = crypto.randomUUID();
      approvals[id] = { order, posName: `${pos.ticker} ${pos.name}`, label: verdict, exp: Date.now() + 24 * 36e5, used: false };
      approveUrl = `${siteUrl}/api/approve?id=${id}`;
    }

    const brief = { t: Date.now(), verdict, rationale, evidence, invalidation, pnl: +pnl.toFixed(0), pctMax: +pctMax.toFixed(0), tis, pop: +(pop * 100).toFixed(0), dteLeft, sim, approveUrl };
    briefsPrev[pos.id] = { tis, dteLeft, t: brief.t };
    pos.timeline = [...(pos.timeline || []), { t: brief.t, type: "autopilot", text: `AUTOPILOT ${verdict} (${brief.pctMax}% maxP, TIS ${tis}) — ${rationale}${approveUrl ? " · [approva: " + approveUrl + "]" : ""}` }];
    out.push({ pos: `${pos.ticker} ${pos.name}`, brief });
  }

  await store.set("state", JSON.stringify(state));
  await store.set("approvals", JSON.stringify(approvals));
  await store.set("briefs", JSON.stringify(briefsPrev));

  if (webhook) {
    const md = out.map((o) => {
      const b = o.brief;
      return `## ${o.pos} → **${b.verdict}** (TIS ${b.tis}/100)\n${b.rationale}\n${(b.evidence || []).map((e) => `- ${e}`).join("\n")}\n${b.invalidation ? `_Invalida se: ${b.invalidation}_\n` : ""}P&L ${b.pnl}$ (${b.pctMax}% maxP) · PoP ${b.pop}% · ${b.dteLeft} DTE · Sim: TP ${(b.sim.pTP * 100).toFixed(0)}% / Stop ${(b.sim.pSL * 100).toFixed(0)}%${b.approveUrl ? `\n\n**→ AUTORIZZA (24h): ${b.approveUrl}**` : ""}`;
    }).join("\n\n---\n\n");
    try { await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: `Autopilot ${new Date().toLocaleDateString("it-IT")}: ${out.map((o) => o.brief.verdict).join(", ")}`, markdown: md }) }); } catch { /* log only */ }
  }
  return Response.json({ ran: out.length });
};
