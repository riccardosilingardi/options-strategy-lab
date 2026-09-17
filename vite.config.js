import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/* ============================================================================
   STAMP THE BUILD INTO THE SERVICE WORKER.

   `public/sw.js` is hand-written and ships with the placeholder "__OSL_BUILD__"
   in it. The browser only reinstalls a service worker when the SCRIPT ITSELF
   changes, byte for byte — so a worker carrying a constant version would keep
   serving the shell it was installed with, for ever, across every deploy. That
   is the single most common way a PWA gets stuck on an old build.

   The stamp is the hash of the emitted asset filenames, which are themselves
   content hashes. So: same build, same stamp, nothing reinstalls; changed
   build, changed stamp, the worker updates and `activate` drops the old cache.

   It runs at `closeBundle`, after vite has copied `public/` into `dist/`.
============================================================================ */
const stampServiceWorker = () => ({
  name: "osl-stamp-service-worker",
  apply: "build",
  closeBundle() {
    const dist = join(process.cwd(), "dist");
    const sw = join(dist, "sw.js");
    if (!existsSync(sw)) return;
    const assets = join(dist, "assets");
    const names = existsSync(assets) ? readdirSync(assets).sort() : [];
    const build = createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 12);
    const src = readFileSync(sw, "utf8");
    if (!src.includes("__OSL_BUILD__") || !src.includes('"__OSL_ASSETS__"')) {
      // Loud, not silent: a worker that quietly kept its placeholders would look
      // fine, never update again, and precache no bundle.
      this.warn("sw.js is missing a placeholder — the cache version will not change between deploys and the bundle will not be precached");
      return;
    }
    // AND THE BUNDLE ITSELF, BY NAME. The worker has to precache the hashed
    // files at install, because the visit that installs it is never a visit it
    // controls — so nothing it merely intercepts is in the cache yet. Without
    // this, an app installed and taken straight offline has a cached
    // index.html naming a bundle that is in no cache of ours.
    const builtFiles = names.map((n) => `/assets/${n}`);
    writeFileSync(sw, src
      .replace(/__OSL_BUILD__/g, build)
      .replace(/"__OSL_ASSETS__"/g, JSON.stringify(builtFiles)));
    console.log(`  sw.js stamped osl-shell-${build}, precaching ${builtFiles.length} built file${builtFiles.length === 1 ? "" : "s"}`);
  },
});

export default defineConfig({ plugins: [react(), stampServiceWorker()] });
