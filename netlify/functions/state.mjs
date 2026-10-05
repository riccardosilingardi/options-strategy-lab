// Sync stato (posizioni/impostazioni) tra browser e server: abilita l'Autopilot ad app chiusa
import { getStore } from "@netlify/blobs";
import { deployWrites, readOnlyResponse } from "../../src/deploy.js";

/* The blob store, behind one name a test can replace (redesign PR 2, TASK 0a). Production reads the real one. */
export const deps = { getStore };

export default async (req, context) => {
  if (req.method === "GET") {
    const store = deps.getStore("autopilot");
    const s = await store.get("state");
    return new Response(s || "{}", { headers: { "Content-Type": "application/json" } });
  }
  if (req.method === "POST") {
    /* PREVIEWS ARE READ-ONLY (TASK 0a): `getStore("autopilot")` is site-wide, so a preview's save overwrote production's
       book (deploy-preview-51 lost the GDX position, 5 Oct 2026). Only the published production deploy may write; a
       context that cannot be read is refused. See src/deploy.js for the Netlify doc pages. */
    if (!deployWrites(context).ok) return readOnlyResponse();
    const store = deps.getStore("autopilot");
    const body = await req.text();
    JSON.parse(body); // valida
    await store.set("state", body);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "method" }, { status: 405 });
};
