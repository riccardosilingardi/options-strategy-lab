// Tema unico e condiviso (chiaro/scuro) — un solo punto di verità per evitare
// conflitti di inizializzazione tra i moduli che lo importano.
//
// `onAccent` è il colore del TESTO da usare sopra un accento pieno (bottone
// ambra, chip colorata). Senza di lui ogni componente scriveva "#14181d" a
// mano, e su fondo chiaro quel nero su ambra chiara non si leggeva.
//
// Palette chiara: pannelli bianchi puri su una pagina neutra molto chiara.
// Ogni accento è scelto per stare sopra 4.5:1 sia sul bianco sia sulla pagina.
// Il contrasto è simmetrico, quindi lo stesso colore regge sia come testo sul
// bianco sia come sfondo di un bottone con testo bianco.
const DARKT = {
  bg: "#14181d", panel: "#1a1f26", line: "#2a2f36", ink: "#f5f0e6",
  mut: "#8b95a1", dim: "#6b7280", amber: "#e8b545", green: "#7fb85c",
  red: "#d66a5a", blue: "#5aa7d6", violet: "#a78bda", body: "#c9d1d9",
  greenDeep: "#4a9e3f", redDeep: "#c0392b", onAccent: "#14181d", dark: true,
};
const LIGHTT = {
  bg: "#f5f6f7", panel: "#ffffff", line: "#dcdfe3", ink: "#1c2128",
  mut: "#5a6472", dim: "#616b78", amber: "#8a6300", green: "#2f6f45",
  red: "#b23a2b", blue: "#1f6391", violet: "#5d47a8", body: "#2a3038",
  greenDeep: "#20603a", redDeep: "#8f2d20", onAccent: "#ffffff", dark: false,
};

/** Il tema scelto dall'utente. Il chiaro è il default: si sceglie il buio. */
export const THEME_KEY = "osl-theme";
export const themeName = () => {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
};
/** Cambia tema e ricarica: T è una costante di modulo, letta a import time. */
export const setTheme = (name) => {
  try { localStorage.setItem(THEME_KEY, name === "dark" ? "dark" : "light"); } catch { /* private mode */ }
  if (typeof location !== "undefined") location.reload();
};

/** Both palettes, so the contrast test can check them without a browser. */
export const PALETTES = { light: LIGHTT, dark: DARKT };

export const T = themeName() === "dark" ? DARKT : LIGHTT;
