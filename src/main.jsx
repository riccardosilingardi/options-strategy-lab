import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Boundary alla RADICE: qualunque errore sfuggito ai boundary interni non produce
// mai più una schermata nera, ma un pannello con messaggio e reset dei dati locali.
class RootBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
    return (
      <div style={{ minHeight: "100vh", background: "#14181d", color: "#c9d1d9", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 560, background: "#1a1f26", border: "1px solid #d66a5a66", borderRadius: 10, padding: 20 }}>
          <div style={{ ...mono, fontSize: 13, color: "#d66a5a", fontWeight: 700 }}>⚠ L'APP HA INCONTRATO UN ERRORE</div>
          <div style={{ ...mono, fontSize: 11, color: "#8b95a1", marginTop: 10, whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err).slice(0, 400)}</div>
          <div style={{ fontSize: 12, marginTop: 12 }}>Copia il messaggio qui sopra e incollalo in chat per il fix. Nel frattempo puoi:</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => location.reload()} style={{ ...mono, fontSize: 12, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: "#e8b545", color: "#14181d", border: "none", fontWeight: 700 }}>Ricarica l'app</button>
            <button onClick={() => { try { localStorage.removeItem("options-lab-state"); } catch {} location.reload(); }} style={{ ...mono, fontSize: 12, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: "transparent", color: "#d66a5a", border: "1px solid #d66a5a66" }}>Reset dati locali e ricarica</button>
          </div>
          <div style={{ ...mono, fontSize: 9.5, color: "#6b7280", marginTop: 8 }}>Il reset cancella solo i dati salvati nel browser (posizioni paper interne, strategie salvate). Il conto Alpaca non viene toccato.</div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootBoundary><App /></RootBoundary>
);
