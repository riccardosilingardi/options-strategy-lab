// ============================================================================
// scripts/dump-tree.mjs — PRINT A SCREEN'S ELEMENTS WITH THEIR COMPUTED STYLES, BOARD OR APP (redesign PR 3, TASK 0a).
//
// A helper for writing audit-screen's maps: one line per element (path, height, size/weight, mono, colour, background,
// border, radius, padding, min-height, gap, its own text), so a board's box and the app's element can be paired by eye.
//   node scripts/dump-tree.mjs board Positions [dark]
//   node scripts/dump-tree.mjs app "app+all" "tap:button:UNG" … [--root=[data-build]] [--theme=light]
// ============================================================================
import { mountMockup } from "../docs/mockups/render/render.mjs";
import { openHarness, loadChromium, tap } from "./app-harness.mjs";

export const TREE_FN = (rootSel) => {
  const lines = [];
  const walk = (el, d, path) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    const r = el.getBoundingClientRect();
    if (!["svg", "path", "circle", "rect", "line", "polyline", "g", "text", "polygon"].includes(el.tagName.toLowerCase())) {
      const bits = [`${cs.fontSize}/${cs.fontWeight}${/mono|menlo/i.test(cs.fontFamily) ? "m" : ""}`, `c=${cs.color}`];
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") bits.push(`bg=${cs.backgroundColor}`);
      if (cs.borderTopWidth !== "0px" || cs.borderLeftWidth !== "0px" || cs.borderBottomWidth !== "0px") bits.push(`b=${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}|L${cs.borderLeftWidth}|B${cs.borderBottomWidth} ${cs.borderBottomColor}`);
      if (cs.borderTopLeftRadius !== "0px") bits.push(`r=${cs.borderTopLeftRadius}`);
      if (cs.padding !== "0px") bits.push(`p=${cs.padding}`);
      if (cs.margin !== "0px") bits.push(`m=${cs.margin}`);
      if (cs.minHeight !== "auto" && cs.minHeight !== "0px") bits.push(`mh=${cs.minHeight}`);
      if (cs.rowGap !== "normal" && cs.rowGap !== "0px") bits.push(`gap=${cs.rowGap}/${cs.columnGap}`);
      if (cs.boxShadow !== "none") bits.push(`sh=${cs.boxShadow}`);
      if (cs.letterSpacing !== "normal") bits.push(`ls=${cs.letterSpacing}`);
      const da = Array.from(el.attributes).filter((a) => a.name.startsWith("data-") || a.name === "aria-label").map((a) => `${a.name}${a.value ? "=" + a.value.slice(0, 20) : ""}`).join(",");
      lines.push(`${"  ".repeat(d)}${path}${da ? "{" + da + "}" : ""} ${Math.round(r.height)}h ${bits.join(" ")}${own ? `  «${own.slice(0, 70)}»` : ""}`);
    }
    Array.from(el.children).forEach((c, i) => walk(c, d + 1, `${c.tagName.toLowerCase()}${c.className && typeof c.className === "string" ? "." + c.className.split(" ").join(".") : ""}[${i + 1}]`));
  };
  const root = document.querySelector(rootSel);
  if (root) walk(root, 0, "root");
  return lines.join("\n");
};

const [kind, name, ...rest] = process.argv.slice(2);
const opt = (k, d) => (rest.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const theme = opt("theme", "dark");
if (kind === "board") {
  const chromium = loadChromium();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  await mountMockup(page, name, rest[0] && !rest[0].startsWith("--") ? rest[0] : theme);
  console.log(await page.evaluate(TREE_FN, "#mount > *"));
  await browser.close();
} else {
  const h = await openHarness();
  const { page } = await h.open(name, theme);
  for (const step of rest.filter((a) => !a.startsWith("--"))) {
    const [op, sel, ...t] = step.split(":");
    if (op === "tap") await tap(page, sel, t.length ? t.join(":") : null, 900);
    if (op === "wait") await page.waitForTimeout(+sel);
    if (op === "sel") await page.waitForSelector(sel, { timeout: 15000 });
  }
  console.log(await page.evaluate(TREE_FN, opt("root", "#root")));
  await h.close();
}
