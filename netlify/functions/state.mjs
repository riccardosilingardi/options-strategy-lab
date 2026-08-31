// Sync stato (posizioni/impostazioni) tra browser e server: abilita l'Autopilot ad app chiusa
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const store = getStore("autopilot");
  if (req.method === "GET") {
    const s = await store.get("state");
    return new Response(s || "{}", { headers: { "Content-Type": "application/json" } });
  }
  if (req.method === "POST") {
    const body = await req.text();
    JSON.parse(body); // valida
    await store.set("state", body);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "method" }, { status: 405 });
};
