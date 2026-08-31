// Proxy Anthropic API: la key arriva dal client (header x-api-key) e non viene salvata
export default async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
    const key = Netlify.env.get("ANTHROPIC_KEY");
    if (!key) return Response.json({ error: { message: "server non configurato: imposta ANTHROPIC_KEY nelle env Netlify" } }, { status: 503 });
    const body = await req.text();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body,
    });
    const out = await r.text();
    return new Response(out, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: { message: String(e.message || e) } }, { status: 502 });
  }
};
