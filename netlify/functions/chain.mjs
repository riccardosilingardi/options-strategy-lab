// Chain CBOE lato server: prova simbolo diretto e con underscore, header browser
const HDRS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://www.cboe.com/",
  "Origin": "https://www.cboe.com",
};
async function tryFetch(sym) {
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`;
  const r = await fetch(url, { headers: HDRS });
  if (!r.ok) throw new Error(`${sym} → HTTP ${r.status}`);
  const j = await r.json();
  if (!j.data || !Array.isArray(j.data.options)) throw new Error(`${sym} → payload senza options`);
  return j;
}
export default async (req) => {
  const sym = (new URL(req.url).searchParams.get("sym") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!sym) return Response.json({ error: "missing sym" }, { status: 400 });
  const tried = [];
  for (const cand of [sym, `_${sym}`]) {
    try {
      const j = await tryFetch(cand);
      return new Response(JSON.stringify(j), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
      });
    } catch (e) { tried.push(String(e.message || e)); }
  }
  return Response.json({ error: "chain non disponibile", tried }, { status: 502 });
};
