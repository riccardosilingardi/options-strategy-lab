// ============================================================================
// scripts/shoot-pr71.mjs — PHOTOGRAPHS OF PR 71 (the Journal on the server; owner 19 Oct 2026).
//
//   node scripts/shoot-pr71.mjs [dir]      (default docs/screens/pr71)
//
// The whole app on fixtures (scripts/app-harness.mjs, "+book"), 390×844, dark and light: the Journal's one new line under
// its title — "Saved on the server · updated hh:mm" when the stub /api/state answers, and amber "Only on this device: the
// server did not answer" with "+offline" (the stub refuses every /api/state call).
// ============================================================================
import { mkdirSync } from "node:fs";
import { openHarness, tap } from "./app-harness.mjs";

const OUT = process.argv[2] || "docs/screens/pr71";
mkdirSync(OUT, { recursive: true });
const journal = async (p) => { await p.waitForTimeout(1500); await tap(p, "nav button", "Journal", 1200); };
const SHOTS = [
  ["journal-saved-on-server", "dark", "app+all+book"],
  ["journal-only-this-device", "dark", "app+all+book+offline"],
  ["journal-saved-on-server-light", "light", "app+all+book"],
  ["journal-only-this-device-light", "light", "app+all+book+offline"],
];
const h = await openHarness();
try {
  for (const [name, theme, mode] of SHOTS) {
    const { page, ctx, errors } = await h.open(mode, theme, { scale: 2 });
    try {
      await journal(page);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const line = await page.evaluate(() => document.querySelector("[data-journal-sync]")?.textContent || null);
      console.log(`${name} (${theme}) — ${line || "no line"}${errors.length ? ` — errors: ${errors.join(" | ")}` : ""}`);
    } catch (e) { console.log(`${name}: ${e.message}`); }
    await ctx.close();
  }
} finally { await h.close(); }
