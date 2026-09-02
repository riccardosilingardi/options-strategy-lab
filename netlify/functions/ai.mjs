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
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body });
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
      return Response.json({ error: { type, message: message + hint, status: r.status } }, { status: r.status });
    }
    return new Response(out, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: { message: `Could not reach the Anthropic API: ${String(e.message || e)}` } }, { status: 502 });
  }
};
