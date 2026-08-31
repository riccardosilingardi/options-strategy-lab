export default async (req) => {
  try {
    const sym = (new URL(req.url).searchParams.get("sym") || "").toUpperCase().replace(/[^A-Z]/g, "");
    const key = Netlify.env.get("ALPHAVANTAGE_KEY");
    if (!key) return Response.json({ error: "server non configurato: imposta ALPHAVANTAGE_KEY" }, { status: 503 });
    if (!sym) return Response.json({ error: "missing sym" }, { status: 400 });
    const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${sym}&apikey=${key}`);
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
};
