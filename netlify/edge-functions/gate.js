// Password gate gratuito (Netlify Edge) via HTTP Basic Auth nativa del browser.
// Niente cookie, niente redirect, niente form: il browser mostra il proprio popup di login.
export default async (request, context) => {
  const PW = Deno.env.get("SITE_PASSWORD");
  if (!PW) return context.next(); // se non impostata, sito aperto

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : decoded;
      if (pass === PW) return context.next();
    } catch { /* credenziali malformate: richiedi di nuovo */ }
  }
  return new Response("Accesso richiesto", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Options Desk", charset="UTF-8"' },
  });
};
export const config = { path: "/*", excludedPath: ["/api/approve"] };
