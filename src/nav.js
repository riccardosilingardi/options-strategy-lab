// ============================================================================
// src/nav.js — WHAT THE BACK BUTTON DOES. Plain JS, no React, no `window`.
//
// PR #44, TASK 3. Measured: no code used the History API, so Android's back
// button left the app from anywhere — from a Details sheet, from Build, from
// Positions. The app is one page whose screens are state, so "back" has to be
// made out of that state.
//
// A SCREEN, FOR THIS FILE, IS ONE `nav` OBJECT: which shell (Home or the desk),
// which place (Build, Positions, Watching, Journal), which step of the path,
// whether Settings is up, and which sheet is open over it (evidence, Why,
// Details, the numbers, the order). Moving to a different one pushes a history
// entry; the browser's popstate hands the entry back and the app restores it.
//
// TWO RULES MAKE IT FEEL RIGHT.
//   1. Closing a sheet from the sheet's own button is a BACK, not a new entry:
//      the entry under it is the screen it covered, so the app steps back to
//      it. Otherwise "Close" would leave a screen behind that Back re-opens.
//   2. Home is the first entry and is never intercepted: Back on Home leaves
//      the app, exactly as before.
// ============================================================================

// `seg` is Positions | Orders (PR #47, TASK 1): a segment is a screen, so Back steps from Orders to Positions.
export const NAV_FIELDS = ["view", "tab", "step", "settings", "ev", "whyTk", "detailsId", "sheet", "seg"];

/** The one object a history entry carries. Anything not in NAV_FIELDS is not navigation. */
export const navOf = ({ view = "wizard", tab = "build", step = "find", showSettings = false, ev = null, whyTk = null,
  detailsId = null, deskSheet = null, posSeg = "positions" } = {}) => ({
  view, tab, step, settings: !!showSettings, ev: ev ?? null, whyTk: whyTk ?? null,
  detailsId: detailsId ?? null, sheet: deskSheet ?? null, seg: posSeg === "orders" ? "orders" : "positions",
});

export const sameNav = (a, b) => !!a && !!b && NAV_FIELDS.every((k) => a[k] === b[k]);

/** Is any sheet open over the screen? */
export const sheetOpen = (n) => !!n && !!(n.ev || n.detailsId != null || n.sheet);

/**
 * WHAT THE HISTORY SHOULD DO NOW THAT THE SCREEN IS `nav`.
 *
 * @param stack the screens the history holds, by index (entry i carries stack[i])
 * @param idx   the entry the browser is on
 * @returns {{ type: "none" | "push" | "back" }}
 *          none  the entry already is this screen (nothing moved, or a pop just restored it)
 *          back  a sheet was closed from its own button and the entry below is the screen under it
 *          push  anything else that moved
 */
export function planNav(stack, idx, nav) {
  const cur = stack[idx];
  if (cur && sameNav(cur, nav)) return { type: "none" };
  if (cur && sheetOpen(cur) && !sheetOpen(nav) && idx > 0 && sameNav(stack[idx - 1], nav)) return { type: "back" };
  return { type: "push" };
}

/**
 * A history driver over the real thing (`window.history` and `popstate`), written so a test can hand it a fake.
 * `get()` reads the screen now; `apply(nav)` puts a screen back.
 */
export function createNavHistory({ history, addPopListener, get, apply }) {
  const stack = [get()];
  let idx = 0;
  try { history.replaceState({ osl: stack[0], id: 0 }, ""); } catch { /* a locked-down browser: no history, no harm */ }
  const unlisten = addPopListener((e) => {
    const st = e && e.state;
    if (!st || !st.osl || !Number.isInteger(st.id)) return;   // not one of ours: leave it alone
    stack[st.id] = st.osl;
    idx = st.id;
    apply(st.osl);
  });
  return {
    /** Call after every render in which the screen may have moved. */
    sync() {
      const nav = get();
      const plan = planNav(stack, idx, nav);
      // `idx` steps down NOW, not when the pop arrives: a render in between must not ask for a second back.
      if (plan.type === "back") { idx -= 1; try { history.back(); } catch { /* ignore */ } return plan; }
      if (plan.type === "push") {
        stack.length = idx + 1;                 // a push drops whatever was forward of it
        stack.push(nav); idx = stack.length - 1;
        try { history.pushState({ osl: nav, id: idx }, ""); } catch { /* ignore */ }
      }
      return plan;
    },
    stop: unlisten,
    state: () => ({ stack: stack.slice(), idx }),
  };
}
