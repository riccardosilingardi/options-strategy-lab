// AUTOPILOT — Netlify Scheduled Function (giorni feriali 11:00 UTC ≈ 13:00 CET, pre-apertura USA)
// Ciclo: posizioni → dati oggettivi (chain CBOE, stagionalità) → TIS + Exit Simulator → brief Claude → approve link → webhook
import { getStore } from "@netlify/blobs";
import { netBS, probProfit, exitSim, SEASONAL, SIGMA } from "../../src/engine.js";
import { RULES, ruleBadge, copilotRulesBlock, money, pctText } from "../../src/rules.js";
import { evaluateTrade } from "../../src/riskGate.js";

// L'autopilot parla solo con paper-api.alpaca.markets (vedi approve.mjs, dove
// l'host e' costante): la verifica paper e' vera per costruzione, non presunta.
const PAPER_ACCOUNT = { paperVerified: true, paperSource: "the approve endpoint posts only to paper-api.alpaca.markets" };

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
  pts += cur.dteLeft > RULES.exitDTE * 2 ? 20 : cur.dteLeft > RULES.exitDTE ? 10 : 0;
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
  const rejected = [];   // PRD §9: le proposte respinte dal cancello si vedono, non spariscono
  const capitalAnswers = {
    tradingCapital: state.settings?.capital,
    concurrentTarget: state.settings?.concurrentTarget,
    savings: state.settings?.savings,
    override: state.settings?.sizeOverride,
  };

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
    const material = !prev || Math.abs((prev.tis ?? 50) - tis) >= 10 || pctMax >= RULES.takeProfitPct * 100 || pnl <= RULES.stopLossPct * pos.maxLoss || dteLeft <= RULES.exitDTE || (prev.dteLeft ?? 99) > RULES.exitDTE;

    let verdict = "HOLD", rationale = "Nessun cambiamento materiale: HOLD confermato.", evidence = [], invalidation = "";
    if (material && anthKey) {
      try {
        const facts = {
          posizione: { ticker: pos.ticker, nome: pos.name, legs: pos.legs, exp: pos.expKey, dteLeft },
          targets: { takeProfit: +(RULES.takeProfitPct * pos.maxProfit).toFixed(0), stopWarning: +(RULES.stopLossPct * pos.maxLoss).toFixed(0), exitDTE: RULES.exitDTE },
          tesi_ingresso: pos.thesis,
          oggi: { fonte_chain: data ? "CBOE delayed" : "modello BS", spot: +spot.toFixed(2), pnl: +pnl.toFixed(0), pct_max_profit: +pctMax.toFixed(0), pop_ora: +(pop * 100).toFixed(0), iv_ora: +(iv * 100).toFixed(0), tis, stagionale_mese: seasonalNow },
          simulator_from_today: { p_take_profit_first: +(sim.pTP * 100).toFixed(0), p_stop_first: +(sim.pSL * 100).toFixed(0), p_exit_at_exit_dte_positive: +(sim.pTimePos * 100).toFixed(0), expected_pnl_following_rules: +sim.ev.toFixed(0), median_days_to_take_profit: sim.medDays },
        };
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 700,
            system: `You are the autopilot of a PAPER options trader. ${copilotRulesBlock()} You receive OBJECTIVE DATA ONLY. Reply with VALID JSON ONLY: {"verdict":"HOLD|CLOSE_ALL|STOP","confidence":0-100,"rationale":"one sentence","evidence":["3-5 pieces of evidence, each with a number taken from the data"],"invalidation":"the spot or P&L level at which this verdict changes"}. Verdict CLOSE_ALL when pct_max_profit >= ${RULES.takeProfitPct * 100} or the simulator clearly favours taking the money; STOP when pnl <= the stop warning or the thesis has collapsed (tis < 40 with negative P&L); otherwise HOLD. Never quote a rule number other than the ones above.`,
            messages: [{ role: "user", content: JSON.stringify(facts) }],
          }),
        });
        const j = await r.json();
        const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const parsed = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
        verdict = ({ CHIUDI_TUTTO: "CLOSE_ALL", CLOSE: "CLOSE_ALL" }[parsed.verdict] || parsed.verdict || verdict); rationale = parsed.rationale || rationale;
        evidence = parsed.evidence || []; invalidation = parsed.invalidation || "";
      } catch (e) { rationale = `AI non disponibile (${String(e.message).slice(0, 60)}): applico regole meccaniche.`; }
    }
    // fallback regole meccaniche
    if (pctMax >= RULES.takeProfitPct * 100 && verdict === "HOLD") { verdict = "CLOSE_ALL"; rationale = `Rule: reached ${pctText(RULES.takeProfitPct)} of max profit.`; }
    if (pnl <= RULES.stopLossPct * pos.maxLoss) { verdict = "STOP"; rationale = `Rule: P&L reached the ${pctText(RULES.stopLossPct)} stop warning (${money(pnl)}).`; }
    if (dteLeft <= RULES.exitDTE && verdict === "HOLD") { verdict = "CLOSE_ALL"; rationale = `Rule: inside the ≤${RULES.exitDTE} DTE exit window.`; }

    // ordine proposto + approve link (solo se azione richiesta)
    let approveUrl = null, gateResult = null;
    if (verdict !== "HOLD") {
      // PRD §8: anche l'autopilot passa dal cancello, PRIMA di creare il link.
      // Una proposta respinta non sparisce: finisce in REJECTED BY GATE.
      gateResult = evaluateTrade({
        proposal: { intent: "close", ticker: pos.ticker, name: pos.name, legs: pos.legs,
          dte: dteLeft, contracts: 1, maxLoss: pos.maxLoss, maxProfit: pos.maxProfit, pnl },
        portfolio: { positions, account: PAPER_ACCOUNT },
        capital: capitalAnswers,
        signals: pos.thesis?.signal || null,
      });
    }
    if (verdict !== "HOLD" && gateResult && !gateResult.pass) {
      rejected.push({ pos: `${pos.ticker} ${pos.name}`, verdict, reasons: gateResult.violations.map((v) => v.message) });
      pos.timeline = [...(pos.timeline || []), { t: Date.now(), type: "gate",
        text: `RISK GATE: ${verdict} non proposto — ${gateResult.violations.map((v) => v.message).join(" ")}` }];
    }
    if (verdict !== "HOLD" && gateResult && gateResult.pass) {
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
      // Il contesto viaggia con l'autorizzazione: approve.mjs rifa' girare il
      // cancello al momento dell'esecuzione, che puo' essere 24h dopo.
      approvals[id] = { order, posName: `${pos.ticker} ${pos.name}`, label: verdict,
        exp: Date.now() + 24 * 36e5, used: false,
        gateContext: {
          proposal: { intent: "close", ticker: pos.ticker, name: pos.name, legs: pos.legs,
            dte: dteLeft, contracts: 1, maxLoss: pos.maxLoss, maxProfit: pos.maxProfit },
          capital: capitalAnswers,
        } };
      approveUrl = `${siteUrl}/api/approve?id=${id}`;
    }

    const brief = { t: Date.now(), verdict, rationale, evidence, invalidation, pnl: +pnl.toFixed(0), pctMax: +pctMax.toFixed(0), tis, pop: +(pop * 100).toFixed(0), dteLeft, sim, approveUrl, gateWarnings: (gateResult?.warnings || []).map((w) => w.message), gateBlocked: !!(gateResult && !gateResult.pass) };
    briefsPrev[pos.id] = { tis, dteLeft, t: brief.t };
    pos.timeline = [...(pos.timeline || []), { t: brief.t, type: "autopilot", text: `AUTOPILOT ${verdict} (${brief.pctMax}% maxP, TIS ${tis}) — ${rationale}${approveUrl ? " · [approva: " + approveUrl + "]" : ""}` }];
    out.push({ pos: `${pos.ticker} ${pos.name}`, brief });
  }

  await store.set("state", JSON.stringify(state));
  await store.set("approvals", JSON.stringify(approvals));
  await store.set("briefs", JSON.stringify(briefsPrev));

  if (webhook) {
    // PRD §9: il brief ha tre sezioni, e la terza esiste anche quando e' vuota.
    const openMd = out.map((o) => {
      const b = o.brief;
      return `## ${o.pos} → **${b.verdict}** (TIS ${b.tis}/100)\n${b.rationale}\n${(b.evidence || []).map((e) => `- ${e}`).join("\n")}\n${b.invalidation ? `_Invalida se: ${b.invalidation}_\n` : ""}P&L ${b.pnl}$ (${b.pctMax}% maxP) · PoP ${b.pop}% · ${b.dteLeft} DTE · Sim: take profit ${(b.sim.pTP * 100).toFixed(0)}% / stop ${(b.sim.pSL * 100).toFixed(0)}%${(b.gateWarnings || []).map((w) => `\n⚠ ${w}`).join("")}${b.approveUrl ? `\n\n**→ AUTORIZZA (24h): ${b.approveUrl}**` : ""}`;
    }).join("\n\n---\n\n");
    const rejectedMd = rejected.length
      ? rejected.map((r) => `## ${r.pos} → ${r.verdict} **RESPINTO**\n${r.reasons.map((x) => `- ${x}`).join("\n")}`).join("\n\n")
      : "_Nessuna proposta respinta in questo ciclo._";
    const md = `# OPEN POSITIONS\n\n${openMd || "_Nessuna posizione aperta._"}\n\n---\n\n# NEW PROPOSALS\n\n_Fase OPEN non ancora attiva (PRD §9)._\n\n---\n\n# REJECTED BY GATE\n\n${rejectedMd}\n\n---\n\nRegole in vigore: ${ruleBadge()}.`;
    try { await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: `Autopilot ${new Date().toLocaleDateString("it-IT")}: ${out.map((o) => o.brief.verdict).join(", ")}${rejected.length ? ` · ${rejected.length} respinte dal gate` : ""}`, markdown: md }) }); } catch { /* log only */ }
  }
  return Response.json({ ran: out.length, rejected: rejected.length });
};
