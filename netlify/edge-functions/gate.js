// Password gate (Netlify Edge) using the browser's own HTTP Basic Auth popup.
// No cookies, no redirects, no form — except for the demo path below.
//
// TWO ways in, and only two:
//   1. the password, typed into the browser's own login popup (SITE_PASSWORD)
//   2. ?demo=<DEMO_TOKEN> — a read-only public demo. The token is checked here,
//      on the edge, and never reaches the client bundle. Once it matches we set
//      an `osl_demo` cookie so the SESSION stays in demo mode: the app is a
//      single page that then fetches /api/chain, /api/bars and the rest, and
//      those requests carry no query string of their own.
//
// `?demo=off` is the way back OUT of demo mode, not a third way in. It only
// ever clears the cookie: the request still has to satisfy one of the two
// doors above, or the demo escape hatch would be an open one.
//
// The cookie is deliberately NOT httpOnly: the client reads it to know it is in
// demo mode and to disable every button that would reach the broker. It carries
// no secret — it says "this session came in through the demo door", nothing
// more, and the token itself is never written into it.
// The DECISION — which of the two doors this request came through, if either —
// lives in lib/access.js, because /api/ai is an edge function now and has to
// ask the same question. This file still owns what to DO about the answer: the
// popup, the cookie, and the way back out.
import { accessOf, DEMO_COOKIE } from "./lib/access.js";

/** Attach a Set-Cookie without letting an immutable response break the page. */
const withCookie = (res, cookie) => {
  try { res.headers.append("Set-Cookie", cookie); } catch { /* immutable: the client-side fallback carries the session */ }
  return res;
};
const SET = (secure) => `${DEMO_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax${secure ? "; Secure" : ""}`;
const CLEAR = `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

export default async (request, context) => {
  const url = new URL(request.url);
  const access = accessOf(request, {
    password: Deno.env.get("SITE_PASSWORD"),
    demoToken: Deno.env.get("DEMO_TOKEN"),
  });

  if (!access.ok) {
    return new Response("Access required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Options Desk", charset="UTF-8"' },
    });
  }
  // The token door SETS the cookie so the rest of the session stays in demo
  // mode: the app is one page that then fetches /api/chain, /api/bars and the
  // rest, and those requests carry no query string of their own.
  if (access.how === "demo-token") {
    return withCookie(await context.next(), SET(url.protocol === "https:"));
  }
  // `leaving` is not a way in — the request had to satisfy a door above — it
  // only decides whether the cookie is cleared on the way through.
  return access.leaving ? withCookie(await context.next(), CLEAR) : context.next();
};

// DECLARED IN netlify.toml, NOT HERE. There are two edge functions now, and
// their order decides whether the AI proxy is behind the password. netlify.toml
// runs them in the order they are written; in-source configuration does not
// promise anything about the order between files. Both are declared there, this
// one first. (ai.js checks the password itself as well — see lib/access.js —
// so a wrong order would still not open the proxy. Belt and braces, because
// this is the one mistake in this repository that would matter to somebody
// other than its owner.)
