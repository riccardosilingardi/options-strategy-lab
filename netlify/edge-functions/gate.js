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
const DEMO_COOKIE = "osl_demo";

/** Attach a Set-Cookie without letting an immutable response break the page. */
const withCookie = (res, cookie) => {
  try { res.headers.append("Set-Cookie", cookie); } catch { /* immutable: the client-side fallback carries the session */ }
  return res;
};
const SET = (secure) => `${DEMO_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax${secure ? "; Secure" : ""}`;
const CLEAR = `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

export default async (request, context) => {
  const PW = Deno.env.get("SITE_PASSWORD");
  const DEMO = Deno.env.get("DEMO_TOKEN");

  const url = new URL(request.url);
  const asked = url.searchParams.get("demo");
  const leaving = asked === "off";
  const cookies = request.headers.get("cookie") || "";
  const inDemo = !leaving && new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=1(?:;|$)`).test(cookies);

  // The demo door. A token is only a door if it is set: an empty DEMO_TOKEN
  // must never match an empty ?demo=, or the password would be optional.
  if (DEMO && !leaving && asked && asked === DEMO) {
    return withCookie(await context.next(), SET(url.protocol === "https:"));
  }
  if (DEMO && inDemo) return context.next();

  // Everything below here needs the password. `leaving` changes nothing about
  // that — it only decides whether the cookie is cleared on the way through.
  const pass = async () => (leaving ? withCookie(await context.next(), CLEAR) : context.next());

  if (!PW) return pass(); // no password set: the site is open

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const given = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : decoded;
      if (given === PW) return pass();
    } catch { /* malformed credentials: ask again */ }
  }
  return new Response("Access required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Options Desk", charset="UTF-8"' },
  });
};
export const config = { path: "/*", excludedPath: ["/api/approve"] };
