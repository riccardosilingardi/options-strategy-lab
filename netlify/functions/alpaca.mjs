// Proxy Alpaca: SOLO paper trading (Netlify Functions 2.0)
const BASE = "https://paper-api.alpaca.markets"; // hardcoded: mai live
// L'host paper viaggia in un header di risposta: e' cosi' che il client puo'
// VERIFICARE (non presumere) di stare parlando col conto paper. src/riskGate.js
// rifiuta l'ordine quando questa verifica manca (PRD ss.8, regola 1).
export const PAPER_HOST = "paper-api.alpaca.markets";

/* ====================================================================
   THE ALLOWLIST (PR #46, TASK 0).

   This proxy used to forward ANY method to ANY /v2 path. DELETE
   /v2/positions — Alpaca's "liquidate everything at market" — was one
   request away from any page that could reach /api/alpaca, and a market close
   is exactly what this app refuses (a close is a limit priced at the tap).
   So the proxy names what the app uses and refuses the rest with a sentence:

     GET    the read paths the app uses (account, positions, orders, one
            order, the option contract list for open interest)
     POST   /v2/orders                     every new order (paths 1-6)
     PATCH  /v2/orders/{id}                Modify of a single-leg order (path 7)
     DELETE /v2/orders/{id}, /v2/orders    cancel one, cancel all

   Not here, on purpose: DELETE /v2/positions and /v2/positions/{symbol}
   (market liquidation), POST /v2/positions/{symbol}/exercise (turns the
   option into shares, outside defined risk), and everything else.
==================================================================== */
const ORDER_ID = "[A-Za-z0-9-]{1,64}";
const ROUTES = [
  { method: "GET", re: /^\/v2\/account$/ },
  { method: "GET", re: /^\/v2\/positions$/ },
  { method: "GET", re: /^\/v2\/orders(\?[A-Za-z0-9_=&%.-]*)?$/ },
  { method: "GET", re: new RegExp(`^/v2/orders/${ORDER_ID}$`) },
  { method: "GET", re: /^\/v2\/options\/contracts(\?[A-Za-z0-9_=&%.-]*)?$/ },
  { method: "POST", re: /^\/v2\/orders$/ },
  { method: "PATCH", re: new RegExp(`^/v2/orders/${ORDER_ID}$`) },
  { method: "DELETE", re: new RegExp(`^/v2/orders/${ORDER_ID}$`) },
  { method: "DELETE", re: /^\/v2\/orders$/ },
];

/**
 * Is this method on this path one the app uses?
 * @returns {{ ok: boolean, status: number, sentence: ?string }}
 */
export function routeAllowed(method, path) {
  const m = String(method || "GET").toUpperCase();
  const p = String(path || "");
  if (!/^\/v2\/[a-zA-Z0-9/_\-.?=&%]*$/.test(p) || p.includes("..")) {
    return { ok: false, status: 400, sentence: "bad path" };
  }
  if (ROUTES.some((r) => r.method === m && r.re.test(p))) return { ok: true, status: 200, sentence: null };
  return {
    ok: false, status: 405,
    sentence: `This app does not send ${m} ${p.split("?")[0]} to Alpaca. The proxy only passes the reads the app ` +
      `uses, new orders, a price change on one order, and cancels; a market liquidation or an exercise is not ` +
      `something this app does.`,
  };
}

export default async (req) => {
  try {
    const path = new URL(req.url).searchParams.get("path") || "/v2/account";
    const allowed = routeAllowed(req.method, path);
    if (!allowed.ok) {
      return Response.json({ error: allowed.sentence }, {
        status: allowed.status, headers: allowed.status === 405 ? { Allow: "GET, POST, PATCH, DELETE" } : {} });
    }
    const key = Netlify.env.get("ALPACA_KEY");
    const secret = Netlify.env.get("ALPACA_SECRET");
    if (!key || !secret) return Response.json({ error: "server non configurato: imposta ALPACA_KEY/ALPACA_SECRET nelle env Netlify" }, { status: 503 });
    const init = {
      method: req.method,
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
      },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.text();
      if (body) init.body = body;
    }
    const r = await fetch(BASE + path, init);
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": "application/json", "X-OSL-Paper-Endpoint": PAPER_HOST, "Access-Control-Expose-Headers": "X-OSL-Paper-Endpoint" } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
};
