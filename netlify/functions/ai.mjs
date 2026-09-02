// Anthropic API proxy. The key never reaches the browser: it lives only in the
// Netlify environment (ANTHROPIC_KEY) and is attached here.
//
// ANTHROPIC_WORKSPACE_ID is OPTIONAL. An identity-linked API key belongs to a
// workspace and Anthropic refuses the call without the header
// ("anthropic-workspace-id is required when authenticating with an
// identity-linked API key"); a classic key rejects the header if it is sent
// with nothing in it. So the header exists only when the variable does.
export default async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: { message: "POST only" } }, { status: 405 });
    const key = Netlify.env.get("ANTHROPIC_KEY");
    if (!key) {
      return Response.json({ error: { message: "The server is not configured: set ANTHROPIC_KEY in the Netlify environment variables." } }, { status: 503 });
    }
    const workspace = (Netlify.env.get("ANTHROPIC_WORKSPACE_ID") || "").trim();
    const headers = {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
    if (workspace) headers["anthropic-workspace-id"] = workspace;

    const body = await req.text();
    // STREAM WHEN ASKED TO, AND THAT IS THE DEFAULT FOR THE COPILOT.
    //
    // This function used to await the WHOLE answer before sending a single byte
    // back. A pre-trade analysis takes tens of seconds to write, and a gateway
    // that sees a connection sit silent that long kills it — the browser then
    // gets an HTML error page ("Too much time has passed without sending any
    // data for document") instead of JSON, which is exactly what happened.
    //
    // Passing the SSE stream straight through means bytes move from the first
    // token onward, so nothing is ever idle long enough to be timed out, and the
    // reader watches the answer arrive instead of watching a spinner.
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
          "Connection": "keep-alive",
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
      // WHAT WE SENT, so the failure names its own cause. When this panel fails
      // the three candidates are: the variable is not set, the key is wrong, or
      // the request itself is malformed — and from the screen alone they look
      // identical. These three facts separate them without exposing anything:
      // whether the workspace header went out (not its value), which headers
      // were attached (names only, never the key), and which model was asked
      // for. Nothing secret is echoed: `x-api-key` appears as a name only.
      const sent = {
        workspaceHeader: workspace ? "sent" : "not sent (ANTHROPIC_WORKSPACE_ID is empty or unset)",
        headers: Object.keys(headers).sort(),
        endpoint: "https://api.anthropic.com/v1/messages",
        model: (() => { try { return JSON.parse(body)?.model || null; } catch { return null; } })(),
      };
      return Response.json({ error: { type, message: message + hint, status: r.status, sent } }, { status: r.status });
    }
    return new Response(out, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: { message: `Could not reach the Anthropic API: ${String(e.message || e)}` } }, { status: 502 });
  }
};
