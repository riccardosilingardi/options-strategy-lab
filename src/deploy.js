// ============================================================================
// src/deploy.js — DEPLOY PREVIEWS ARE READ-ONLY (redesign PR 2, TASK 0a).
//
// Measured on 5 Oct 2026: "File in Journal" tapped on deploy-preview-51 went into that preview's own Journal (each
// address has its own browser storage), while the positions copy on the server lost the GDX position. Every function
// reads and writes ONE site-wide blob store (`getStore("autopilot")`), previews included, and a preview may hold the
// same Alpaca paper keys as production. So a preview could change production's book and could send a paper order.
//
// The fix is on the server: every function that writes or sends asks `deployWrites()` first and refuses with 403 and
// `PREVIEW_READ_ONLY` unless the deploy is production AND the published one. Unknown is not production: a context the
// function cannot read is refused. Reads (chains, bars, news, the state GET, Alpaca's account, positions, orders) are
// never asked.
//
// WHERE THE CONTEXT COMES FROM. Netlify hands both function types a context object as their second argument, and
// `context.deploy` carries { context, id, published } — "production", "deploy-preview", "branch-deploy", … and whether
// this function belongs to the currently published deploy. Documented on:
//   Functions v2:    https://docs.netlify.com/build/functions/api/   (the Netlify-specific Context object)
//   Edge functions:  https://docs.netlify.com/build/edge-functions/api/   (the same Context object)
// Read from Netlify's own type definitions, `@netlify/types` 3.2.0 (`Context.deploy`, `NetlifyGlobal.context`), shared
// by `@netlify/functions` 6.0.2 and `@netlify/edge-functions` 4.0.2: this sandbox could not open docs.netlify.com, so
// the section anchors above are unverified. `Netlify.context` (the global) is the fallback when no argument is passed.
//
// `published` is required too (owner, 5 Oct 2026): an old production deploy reached by its permanent link still says
// "production", runs old code, and is not the published one.
//
// THE CLIENT knows its deploy from the build: Netlify sets CONTEXT during every build and vite.config.js stamps it in
// as `__OSL_DEPLOY_CONTEXT__` ("unknown" when unset, e.g. a local `npm run dev`). Anything but "production" is a
// preview here: a banner on every screen, and Send, Close, Modify, Cancel and File in Journal disabled with the reason.
// A file that is not a vite build (a test, a node script) carries no stamp and is not a preview.
//
// Plain JS, imports nothing: the Netlify functions and the client both read it.
// ============================================================================

/** The one sentence a refused write says, on the server and under every disabled control. */
export const PREVIEW_READ_ONLY = "Preview deploys are read-only: nothing is saved or sent from here.";
/** The banner on every screen of a preview. */
export const PREVIEW_BANNER = "Preview · read-only: nothing here is saved or sent";

/**
 * May this function write or send? Reads the Netlify context it was handed (or `Netlify.context`).
 * @returns {{ ok: boolean, context: ?string, why: ?string }}
 */
export function deployWrites(context) {
  let ctx = context;
  if (ctx == null) {
    try { ctx = typeof Netlify !== "undefined" ? Netlify.context : null; } catch { ctx = null; }
  }
  const d = ctx && typeof ctx === "object" ? ctx.deploy : null;
  if (!d || typeof d.context !== "string" || !d.context) return { ok: false, context: null, why: "the deploy context could not be read" };
  if (d.context !== "production") return { ok: false, context: d.context, why: `this is a ${d.context} deploy` };
  if (d.published !== true) return { ok: false, context: d.context, why: "this production deploy is not the published one" };
  return { ok: true, context: d.context, why: null };
}

/** The 403 every writer answers with when `deployWrites()` says no. */
export function readOnlyResponse() {
  return new Response(JSON.stringify({ error: PREVIEW_READ_ONLY }), {
    status: 403, headers: { "Content-Type": "application/json" },
  });
}

/* ---- the client's side ---- */
/* global __OSL_DEPLOY_CONTEXT__ */
const STAMP = typeof __OSL_DEPLOY_CONTEXT__ === "string" ? __OSL_DEPLOY_CONTEXT__ : undefined;
/** What the build was stamped with, or null when this is not a vite build. */
export const BUILD_CONTEXT = STAMP ?? null;
/** True on any vite build that is not production: the client draws the banner and disables every write. */
export const isPreviewContext = (stamp) => stamp !== undefined && stamp !== null && stamp !== "production";
export const PREVIEW = isPreviewContext(STAMP);
