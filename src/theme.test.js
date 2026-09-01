// Contrast is not a matter of taste: small grey text on a white panel either
// clears WCAG AA or it does not. This locks the light palette to 4.5:1 against
// both surfaces it is ever drawn on, so "muted" can never quietly become
// "unreadable" in a later tweak.
import { PALETTES } from "./theme.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
};

const luminance = (hex) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

console.log("\nTHEME — the light palette is the default, so it has to be readable\n");

const L = PALETTES.light;
ok("panels are pure white", L.panel === "#ffffff", L.panel);
ok("the page sits on a very light neutral, distinct from the panels",
  L.bg !== L.panel && luminance(L.bg) > 0.85, `${L.bg} luminance ${luminance(L.bg).toFixed(3)}`);

// Every colour that ever carries text, on both surfaces it is drawn on.
for (const key of ["mut", "dim", "ink", "body", "amber", "green", "red", "blue", "violet", "greenDeep", "redDeep"]) {
  for (const [surface, bg] of [["white panels", L.panel], ["the page", L.bg]]) {
    const r = contrast(L[key], bg);
    ok(`${key} on ${surface} clears 4.5:1`, r >= 4.5, `${L[key]} → ${r.toFixed(2)}:1`);
  }
}

// Accents double as button backgrounds. Contrast is symmetric, so a colour that
// reads on white also carries white text — but only if onAccent really is white.
ok("onAccent is white in the light theme, so text on an amber button reads",
  L.onAccent === "#ffffff", L.onAccent);
for (const key of ["amber", "green", "red", "blue", "violet"]) {
  const r = contrast(L[key], L.onAccent);
  ok(`white text on a filled ${key} button clears 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1`);
}

const D = PALETTES.dark;
ok("dark stays reachable and keeps its own dark text-on-accent", D.onAccent === "#14181d", D.onAccent);
for (const key of ["mut", "ink", "body", "amber", "green", "red", "blue", "violet"]) {
  const r = contrast(D[key], D.panel);
  ok(`dark ${key} on its panel clears 4.5:1`, r >= 4.5, `${D[key]} → ${r.toFixed(2)}:1`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
