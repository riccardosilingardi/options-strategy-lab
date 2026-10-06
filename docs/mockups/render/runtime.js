// Minimal static renderer for .dc.html artboards: runs the board's logic class, expands sc-for / sc-if / {{holes}} / dc-import.
window.renderBoard = function (files, name, propsOverride) {
  const src = files[name + ".dc.html"];
  const m = src.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
  const decl = m ? JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'")) : {};
  const props = {};
  for (const [k, d] of Object.entries(decl)) if (!k.startsWith("$") && d && "default" in d) props[k] = d.default;
  Object.assign(props, propsOverride || {});
  class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(u) { this.state = Object.assign({}, this.state, typeof u === "function" ? u(this.state) : u); } }
  let vals = {};
  if (m) { const C = new Function("DCLogic", m[2] + "\nreturn Component;")(DCLogic); const c = new C(props); vals = c.renderVals(); }
  const body = src.split("<x-dc>")[1].split("</x-dc>")[0];
  const helmet = (body.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ""])[1];
  const tpl = body.replace(/<helmet>[\s\S]*?<\/helmet>/, "");
  const holder = document.createElement("div");
  holder.innerHTML = tpl;
  const look = (scope, path) => {
    const p = path.trim();
    if (p === "true") return true; if (p === "false") return false;
    let v = scope; for (const k of p.split(".")) { if (v == null) return undefined; v = v[k]; } return v;
  };
  const one = (s) => { const mm = String(s).match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/); return mm ? mm[1] : null; };
  const fill = (s, scope) => String(s).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => { const v = look(scope, p); return v == null || v === false ? "" : v === true ? "true" : String(v); });
  const walk = (node, scope) => {
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 3) { if (ch.nodeValue.includes("{{")) ch.nodeValue = fill(ch.nodeValue, scope); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.localName;
      if (tag === "sc-for") {
        const list = look(scope, one(ch.getAttribute("list")) || "") || [];
        const as = ch.getAttribute("as") || "item";
        const frag = document.createDocumentFragment();
        list.forEach((item, i) => {
          const wrap = ch.cloneNode(true);
          walk(wrap, Object.assign(Object.create(scope), { [as]: item, $index: i }));
          while (wrap.firstChild) frag.appendChild(wrap.firstChild);
        });
        ch.replaceWith(frag); continue;
      }
      if (tag === "sc-if") {
        const v = look(scope, one(ch.getAttribute("value")) || "false");
        if (!v) { ch.remove(); continue; }
        walk(ch, scope); const frag = document.createDocumentFragment(); while (ch.firstChild) frag.appendChild(ch.firstChild); ch.replaceWith(frag); continue;
      }
      if (tag === "dc-import") {
        const nm = ch.getAttribute("name");
        const sub = window.renderBoard(files, nm, { dark: props.dark });
        ch.replaceWith(sub.root); continue;
      }
      for (const a of Array.from(ch.attributes)) {
        if (!a.value.includes("{{")) continue;
        if (/^on[A-Z]/.test(a.name) || /^on[a-z]/.test(a.name)) { ch.removeAttribute(a.name); continue; }
        const p = one(a.value);
        if (p) {
          const v = look(scope, p);
          if (["disabled", "checked", "hidden", "selected"].includes(a.name)) { if (v) ch.setAttribute(a.name, ""); else ch.removeAttribute(a.name); continue; }
          if (typeof v === "function") { ch.removeAttribute(a.name); continue; }
          ch.setAttribute(a.name, v == null ? "" : String(v)); continue;
        }
        ch.setAttribute(a.name, fill(a.value, scope));
      }
      for (const a of Array.from(ch.attributes)) if (/^on/i.test(a.name)) ch.removeAttribute(a.name);
      walk(ch, scope);
    }
  };
  walk(holder, vals);
  const style = document.createElement("style"); style.textContent = (helmet.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const root = holder.firstElementChild;
  const box = document.createElement("div"); box.appendChild(style); while (holder.firstChild) box.appendChild(holder.firstChild);
  return { root: box };
};
