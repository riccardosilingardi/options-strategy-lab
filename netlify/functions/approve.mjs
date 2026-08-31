// One-tap approve: esegue su Alpaca PAPER l'ordine proposto dall'Autopilot, previa validazione token
import { getStore } from "@netlify/blobs";
const page = (title, body, ok) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#14181d;font-family:ui-monospace,monospace;color:#f5f0e6}
div{background:#1a1f26;border:1px solid ${ok ? "#7fb85c" : "#d66a5a"};border-radius:10px;padding:28px;max-width:360px}
h1{font-size:15px;color:${ok ? "#7fb85c" : "#d66a5a"};margin:0 0 10px}p{font-size:12px;color:#8b95a1;line-height:1.5}</style></head>
<body><div><h1>${title}</h1><p>${body}</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } });

export default async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const store = getStore("autopilot");
    const raw = await store.get("approvals");
    const approvals = raw ? JSON.parse(raw) : {};
    const a = approvals[id];
    if (!a) return page("Link non valido", "Autorizzazione inesistente o già rimossa.", false);
    if (a.used) return page("Già eseguito", `Questo ordine era già stato autorizzato il ${new Date(a.usedAt).toLocaleString("it-IT")}.`, false);
    if (Date.now() > a.exp) return page("Link scaduto", "L'autorizzazione è scaduta (24h). L'Autopilot ne genererà una nuova al prossimo ciclo se ancora rilevante.", false);
    const k = Netlify.env.get("ALPACA_KEY"), s = Netlify.env.get("ALPACA_SECRET");
    if (!k || !s) return page("Server non configurato", "Mancano ALPACA_KEY/ALPACA_SECRET.", false);
    const r = await fetch("https://paper-api.alpaca.markets/v2/orders", {
      method: "POST",
      headers: { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s, "Content-Type": "application/json" },
      body: JSON.stringify(a.order),
    });
    const out = await r.json();
    if (!r.ok) return page("Ordine rifiutato da Alpaca", JSON.stringify(out).slice(0, 300), false);
    a.used = true; a.usedAt = Date.now(); a.orderId = out.id;
    approvals[id] = a;
    await store.set("approvals", JSON.stringify(approvals));
    return page("Ordine eseguito ✓", `${a.label} · ${a.posName}<br>Ordine Alpaca PAPER ${out.id?.slice(0, 8)}… inviato (${out.status}).`, true);
  } catch (e) {
    return page("Errore", String(e.message || e), false);
  }
};
