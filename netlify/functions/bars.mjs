// Barre giornaliere sottostante: Alpaca Market Data (env) -> fallback Alpha Vantage
export default async (req) => {
  const url0 = new URL(req.url);
  const sym = (url0.searchParams.get("sym") || "").toUpperCase().replace(/[^A-Z]/g, "");
  const daysBack = Math.min(1900, Math.max(90, +(url0.searchParams.get("days") || 400)));
  const occ = (url0.searchParams.get("occ") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const k = Netlify.env.get("ALPACA_KEY"), s = Netlify.env.get("ALPACA_SECRET");
  // storico del singolo contratto opzione (OCC) via Alpaca options data
  if (occ) {
    if (!k || !s) return Response.json({ error: "ALPACA_KEY and ALPACA_SECRET are needed for the price history of a single option contract." }, { status: 503 });
    try {
      const start = new Date(Date.now() - 180 * 864e5).toISOString();
      const r = await fetch(`https://data.alpaca.markets/v1beta1/options/bars?symbols=${occ}&timeframe=1Day&start=${start}&limit=200`, {
        headers: { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s },
      });
      const j = await r.json();
      const arr = j.bars?.[occ] || [];
      if (!r.ok || !arr.length) return Response.json({ error: j.message || "No price history for this contract — it may be too recently listed, or too thinly traded to have printed a daily bar." }, { status: 502 });
      const bars = arr.map((x) => ({ time: x.t.slice(0, 10), value: x.c, volume: x.v }));
      return Response.json({ bars, source: "Alpaca options" }, { headers: { "Cache-Control": "public, max-age=600" } });
    } catch (e) { return Response.json({ error: String(e.message || e) }, { status: 502 }); }
  }
  if (!sym) return Response.json({ error: "missing sym" }, { status: 400 });
  // 1) Alpaca (IEX feed, gratuito con le chiavi)
  if (k && s) {
    try {
      const start = new Date(Date.now() - daysBack * 864e5).toISOString();
      const r = await fetch(`https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=1Day&start=${start}&limit=2000&adjustment=split&feed=iex`, {
        headers: { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s },
      });
      if (r.ok) {
        const j = await r.json();
        if (j.bars?.length) {
          const bars = j.bars.map((b) => ({ time: b.t.slice(0, 10), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
          return Response.json({ bars, source: "Alpaca IEX" }, { headers: { "Cache-Control": "public, max-age=300" } });
        }
      }
    } catch { /* fallback */ }
  }
  // 2) Alpha Vantage daily
  const av = Netlify.env.get("ALPHAVANTAGE_KEY");
  if (av) {
    try {
      const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${sym}&outputsize=full&apikey=${av}`);
      const j = await r.json();
      const ts = j["Time Series (Daily)"];
      if (ts) {
        const bars = Object.entries(ts).slice(0, daysBack).reverse().map(([d, v]) => ({
          time: d, open: +v["1. open"], high: +v["2. high"], low: +v["3. low"], close: +v["4. close"], volume: +v["5. volume"],
        }));
        return Response.json({ bars, source: "Alpha Vantage" }, { headers: { "Cache-Control": "public, max-age=3600" } });
      }
    } catch { /* niente */ }
  }
  return Response.json({ error: "No price-history source is configured: set ALPACA_KEY and ALPACA_SECRET, or ALPHAVANTAGE_KEY, in the Netlify environment." }, { status: 503 });
};
