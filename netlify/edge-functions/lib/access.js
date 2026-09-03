// ============================================================================
// WHO IS ALLOWED IN — the decision, in one place, for every edge function.
//
// `gate.js` owns the RESPONSE (the browser's Basic-Auth popup, the demo cookie,
// the way back out). This file owns only the QUESTION it answers, because more
// than one edge function now needs to ask it and a second copy of a password
// comparison is a second place for it to be wrong.
//
// Why that matters here and not before: /api/ai used to be an ordinary Netlify
// Function sitting behind `gate.js`'s `/*` path, so the gate was the only thing
// that had to be right. It is an EDGE function now (a synchronous function is
// killed at ~10 seconds and a streamed analysis always takes longer), and two
// edge functions matching the same request run in an order that is a deployment
// detail rather than something this repository can prove. If ai.js ever ran
// first it would be an unauthenticated Anthropic proxy on the open internet.
// So it asks this question itself, and the ordering stops mattering.
// ============================================================================

export const DEMO_COOKIE = "osl_demo";

/**
 * @returns {{ ok, how, leaving, demo }}
 *   `ok`      may this request proceed at all?
 *   `how`     "open" (no password set), "demo-token", "demo-cookie", "password"
 *             or null when it may not — enough to explain a refusal, never a
 *             secret.
 *   `leaving` the caller asked to leave demo mode (`?demo=off`); it is not a
 *             way IN, only an instruction to clear the cookie on the way past.
 *   `demo`    this request is inside a demo session.
 */
export function accessOf(request, { password, demoToken } = {}) {
  const url = new URL(request.url);
  const asked = url.searchParams.get("demo");
  const leaving = asked === "off";
  const cookies = request.headers.get("cookie") || "";
  const inDemo = !leaving && new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=1(?:;|$)`).test(cookies);

  // The demo door. A token is only a door if it is SET: an empty DEMO_TOKEN
  // must never match an empty ?demo=, or the password would be optional.
  if (demoToken && !leaving && asked && asked === demoToken) {
    return { ok: true, how: "demo-token", leaving, demo: true };
  }
  if (demoToken && inDemo) return { ok: true, how: "demo-cookie", leaving, demo: true };

  if (!password) return { ok: true, how: "open", leaving, demo: false };

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const given = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : decoded;
      if (given === password) return { ok: true, how: "password", leaving, demo: false };
    } catch { /* malformed credentials: ask again */ }
  }
  return { ok: false, how: null, leaving, demo: false };
}
