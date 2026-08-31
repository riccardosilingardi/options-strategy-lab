// Proxy generico con allowlist (Netlify Functions 2.0)
const ALLOWED_HOSTS = [
  "cdn.cboe.com",
  "www.alphavantage.co",
  "news.google.com",
  "feeds.finance.yahoo.com",
  "www.eia.gov",
  "api.open-meteo.com",
];

export default async (req) => {
  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return Response.json({ error: "missing url" }, { status: 400 });
    const u = new URL(url);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname)) {
      return Response.json({ error: "host not allowed" }, { status: 403 });
    }
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (options-lab)" } });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") || "text/plain",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
};
