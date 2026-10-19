// Sync stato (posizioni/impostazioni) tra browser e server: abilita l'Autopilot ad app chiusa
import { getStore } from "@netlify/blobs";
import { deployWrites, readOnlyResponse } from "../../src/deploy.js";
import { mergeStateBody } from "../../src/journalSync.js";

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
    let incoming;
    try { incoming = JSON.parse(await req.text()); } catch { return Response.json({ error: "The state sent is not JSON." }, { status: 400 }); }
    const store = deps.getStore("autopilot");
    /* THE JOURNAL IS MERGED, NEVER REPLACED (PR 71). The positions and the settings a body sends replace the stored ones,
       as before; the Journal is merged entry by entry (`mergeStateBody()` in src/journalSync.js), so an empty or stale
       browser cannot delete an entry, and the ref counter only goes up. */
    let stored = {};
    try { stored = JSON.parse((await store.get("state")) || "{}"); } catch { stored = {}; }
    await store.set("state", JSON.stringify(mergeStateBody(stored, incoming)));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "method" }, { status: 405 });
};
