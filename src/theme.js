// Tema unico e condiviso (chiaro/scuro) — un solo punto di verità per evitare
// conflitti di inizializzazione tra i moduli che lo importano.
const DARKT = {
  bg: "#14181d", panel: "#1a1f26", line: "#2a2f36", ink: "#f5f0e6",
  mut: "#8b95a1", dim: "#6b7280", amber: "#e8b545", green: "#7fb85c",
  red: "#d66a5a", blue: "#5aa7d6", violet: "#a78bda", body: "#c9d1d9",
};
const LIGHTT = {
  bg: "#f4f2ec", panel: "#ffffff", line: "#ddd8cc", ink: "#1c2128",
  mut: "#5a6472", dim: "#8a93a0", amber: "#b07d18", green: "#3e7d2c",
  red: "#b8432f", blue: "#2d6f9e", violet: "#6d4fb3", body: "#2a3038",
};
export const T = (typeof localStorage !== "undefined" && localStorage.getItem("osl-theme") === "light") ? LIGHTT : DARKT;
