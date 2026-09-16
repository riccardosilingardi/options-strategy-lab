import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { T } from "./theme.js";

// Boundary alla RADICE: qualunque errore sfuggito ai boundary interni non produce
// mai più una schermata nera, ma un pannello con messaggio e reset dei dati locali.
// I colori vengono dal tema condiviso, così la schermata d'errore non è l'unica
// cosa scura in un'app chiara.
class RootBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.body, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "ui-sans-serif, system-ui" }}>
        <div style={{ maxWidth: 560, background: T.panel, border: `1px solid ${T.red}66`, borderRadius: 12, padding: 22 }}>
          <div style={{ ...mono, fontSize: 13, color: T.red, fontWeight: 700 }}>⚠ SOMETHING WENT WRONG</div>
          <div style={{ ...mono, fontSize: 11, color: T.mut, marginTop: 10, whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err).slice(0, 400)}</div>
          <div style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>Copy the message above if you want it fixed. In the meantime:</div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={() => location.reload()} style={{ fontSize: 15, minHeight: 52, padding: "0 18px", borderRadius: 10, cursor: "pointer", background: T.amber, color: T.onAccent, border: "none", fontWeight: 700, fontFamily: "ui-sans-serif, system-ui" }}>Reload the app</button>
            <button onClick={() => { try { localStorage.removeItem("options-lab-state"); } catch { /* private mode */ } location.reload(); }} style={{ fontSize: 15, minHeight: 52, padding: "0 18px", borderRadius: 10, cursor: "pointer", background: "transparent", color: T.red, border: `1px solid ${T.red}66`, fontFamily: "ui-sans-serif, system-ui" }}>Clear local data and reload</button>
          </div>
          <div style={{ fontSize: 12.5, color: T.dim, marginTop: 12, lineHeight: 1.5 }}>Clearing only removes what this browser saved — your paper positions and saved strategies. Your Alpaca account is not touched.</div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootBoundary><App /></RootBoundary>
);

/* ---------------------------------------------------------------------------
   THE SERVICE WORKER — registered last, and never in the way.

   It is what makes the app installable and lets it open from the home-screen
   icon with no network. Everything it is allowed to remember is in public/sw.js
   and it is only the shell: no price, no position and no order is ever cached.

   Registered AFTER the app has rendered, and a failure is logged rather than
   shown. If it does not register, the app is exactly what it was before this
   existed — a web page that needs a network — so a broken registration must
   never be allowed to become a broken app. The site sits behind a password, and
   whether the browser sends those credentials when it fetches the worker script
   is a question only a real device answers: if it does not, this logs and the
   app carries on.

   Not in dev: `vite dev` serves modules that change on every save, and a worker
   in front of them turns an edit into a mystery.
--------------------------------------------------------------------------- */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("Service worker not registered — the app runs online only.", e);
    });
  });
}
