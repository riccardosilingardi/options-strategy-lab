// ============================================================================
// Anthropic API proxy — AN EDGE FUNCTION, and that is the whole point.
//
// WHY IT MOVED. This was netlify/functions/ai.mjs, an ordinary synchronous
// Netlify Function. Those are capped at roughly TEN SECONDS of execution. A
// 1200-token analysis written for a non-expert takes longer than that every
// single time, so the copilot panel and the weekly report did not fail
// intermittently — they were STRUCTURALLY cut off, and no amount of streaming
// inside a ten-second box was going to fix it. Edge functions carry no such
// limit and streaming is the case they exist for.
//
// The redirect path is unchanged: the browser still POSTs to /api/ai and
// nothing else in the app moved. `netlify.toml` no longer redirects /api/ai to
// a function — this file claims that path directly.
//
// Deno, not Node: `Deno.env.get` instead of `Netlify.env.get`, and `fetch`,
// `Response` and `ReadableStream` are already there.
//
// ANTHROPIC_WORKSPACE_ID is OPTIONAL. An identity-linked API key belongs to a
// workspace and Anthropic refuses the call without the header
// ("anthropic-workspace-id is required when authenticating with an
// identity-linked API key"); a classic key rejects the header if it is sent
// with nothing in it. So the header exists only when the variable does.
// ============================================================================
import { accessOf } from "./lib/access.js";

export default async (req) => {
  try {
    // THE PASSWORD, ASKED HERE TOO. gate.js is declared first in netlify.toml
    // and covers /* — but two edge functions on one request run in an order
    // this repository cannot prove, and the failure mode if that order is ever
    // wrong is an unauthenticated Anthropic proxy on the open internet. The
    // decision is the one gate.js uses, imported rather than copied, so there
    // is still exactly one place a password is compared.
    const access = accessOf(req, {
      password: Deno.env.get("SITE_PASSWORD"),
      demoToken: Deno.env.get("DEMO_TOKEN"),
    });
    if (!access.ok) {
      return new Response("Access required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Options Desk", charset="UTF-8"' },
      });
    }

    if (req.method !== "POST") return Response.json({ error: { message: "POST only" } }, { status: 405 });
    const key = Deno.env.get("ANTHROPIC_KEY");
    if (!key) {
      return Response.json({ error: { message: "The server is not configured: set ANTHROPIC_KEY in the Netlify environment variables." } }, { status: 503 });
    }
    const workspace = (Deno.env.get("ANTHROPIC_WORKSPACE_ID") || "").trim();
    const headers = {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
    if (workspace) headers["anthropic-workspace-id"] = workspace;

    const body = await req.text();
    // STREAM WHEN ASKED TO, AND THAT IS THE DEFAULT FOR THE COPILOT.
    //
    // Passing the SSE stream straight through means bytes move from the first
    // token onward, so nothing is ever idle long enough to be timed out, and
    // the reader watches the answer arrive instead of watching a spinner. On
    // the edge there is no execution ceiling underneath it either, which is the
    // half that was missing.
    let wantsStream = false;
    try { wantsStream = JSON.parse(body)?.stream === true; } catch { /* body is checked below */ }

    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body });

    // An error is JSON even on a streaming request: read it and fall through to
    // the reporting below rather than streaming an error page.
    if (wantsStream && r.ok && r.body) {
      return new Response(r.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          // Some proxies buffer a response until it completes, which would put
          // the silence back. This is the conventional ask not to.
          "X-Accel-Buffering": "no",
        },
      });
    }
    const out = await r.text();

    // Pass the real API error through unchanged where it already is one, and
    // wrap it in the same shape when it is not: the UI shows whatever message
    // arrives here, so "something went wrong" would hide the one sentence that
    // says what to fix.
    if (!r.ok) {
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* not JSON */ }
      const message = parsed?.error?.message || (out || "").trim().slice(0, 400) || `Anthropic returned HTTP ${r.status}.`;
      const type = parsed?.error?.type || "api_error";
      // The API names the fix; this names WHERE to apply it. Whether a key is
      // identity-linked cannot be read off the key, so the app cannot know in
      // advance — but the moment Anthropic says the header is missing, the one
      // useful sentence is which Netlify variable to set. Only added when the
      // variable really is unset, so it can never point at the wrong cause.
      const hint = !workspace && /workspace/i.test(message)
        ? " — set ANTHROPIC_WORKSPACE_ID in the Netlify environment variables: this key belongs to a workspace, and Anthropic will not accept the call without it."
        : "";
      // WHAT WE SENT, so the failure names its own cause. Nothing secret is
      // echoed: `x-api-key` appears as a name only.
      const sent = {
        workspaceHeader: workspace ? "sent" : "not sent (ANTHROPIC_WORKSPACE_ID is empty or unset)",
        headers: Object.keys(headers).sort(),
        endpoint: "https://api.anthropic.com/v1/messages",
        model: (() => { try { return JSON.parse(body)?.model || null; } catch { return null; } })(),
        runtime: "netlify edge (no 10s execution ceiling)",
      };
      return Response.json({ error: { type, message: message + hint, status: r.status, sent } }, { status: r.status });
    }
    return new Response(out, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: { message: `Could not reach the Anthropic API: ${String(e.message || e)}` } }, { status: 502 });
  }
};

// Declared in netlify.toml, AFTER gate.js, so the password runs first. See the
// note at the bottom of gate.js.
