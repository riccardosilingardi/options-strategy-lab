# The owner's mockups — the reference every redesign PR is checked against

Drawn in Claude Design on 4 Oct 2026 and approved by the owner the same day (Find version B chosen over version A).
This folder is the canvas itself, so a session can look at it instead of reading a description of it.

| Folder | What it holds |
|---|---|
| `png/` | Every board rendered at 390 px wide, 2× pixels: `<Board>.png` (dark, the app's default) and `<Board>-light.png`. |
| `src/` | The boards' sources (`*.dc.html`): the exact CSS — sizes, weights, colours, borders, radii, paddings — and the words. `canvas.json` gives each board's size and title. |
| `render/` | `render.mjs` + `runtime.js`: renders a board into plain DOM in Chromium. `node docs/mockups/render/render.mjs [Board,…|all] [dark,light]` rewrites the PNGs; `mountMockup(page, "Positions", "dark")` mounts a board in a Playwright page so its computed styles can be read next to the app's. |

## Which board is which screen

| Board | App screen | Redesign PR |
|---|---|---|
| `FindB` | Find (the chosen version) | 1 — shipped (#51) |
| `Main` | Find, version A — **not chosen**, kept for the record | — |
| `FindLoading`, `FindStale`, `FindEmpty`, `FindSaved`, `FindFilters`, `Define` | Find's states, the Saved segment, a chip sheet, "How the numbers connect" | 1 — shipped |
| `MarketStrategies`, `MarketOverview`, `Market` (the Chain tab), `MarketSwitch` | The market page and its ticker switcher | 1 — shipped |
| `Build`, `BuildReview`, `BuildLoading`, `BuildNoData`, `BuildEmpty` | Build, the review sheet before Send, Build's three states | 2 — shipped (#53) |
| `Positions`, `PositionDetail` | Positions (account strip, segment, position cards) and one position's detail | 3 |
| `Orders` | The Orders segment | 3 |
| `Journal` | The Journal | 3 |
| `Settings` | Settings | 3 |

## How to check a screen against its board

1. Render the board (`png/` is already rendered) and photograph the app's screen on fixtures at 390×844, same theme.
2. Put the two side by side and list every visible difference: order of sections, sizes, weights, colours, borders,
   spacing, words.
3. For the values, measure — do not eyeball: mount the board with `mountMockup()` and the app's screen in the same
   browser, read `getComputedStyle` on matching elements, and print one line per value (mockup → app, ✓ or ✗).
4. Fix the differences, re-shoot, and put the before/after pairs in the PR.

## Where the app's rules win over the drawing

The boards use sample data (CORN 18/17 bull put spread, chance 73%, future avg +$4, $307 at risk of $2,500…).
**Never copy a number from a board.** Every figure on screen comes from its function. Where a board and a rule
disagree, the rule wins and the words follow the rule:

- **Entry floor:** expiries under `RULES.minEntryDTE` (30 days) cannot be built from. The boards say "<21" and
  "Outside the 21-day exit"; 21 days is the *exit* rule (`RULES.exitDTE`), not the entry one.
- **Times** are printed in the user's time, with ET and the source behind an ⓘ. The boards print ET.
- **IV rank** reads "collecting N of 20 days" until 20 days of history exist. The board shows "38".
- **Expected move** to 20 Nov at $18.42 and 24.2% IV is ±$1.60 by the formula; the board says ±$1.59.
- **Events** come only from `src/events.js` (dates read on the publishers' pages). The FOMC line has no time: the
  Fed's page gives days only.
- **No function is dropped.** Where the app has a control the board does not draw (Find's Horizon and Liquidity
  chips, the ↻ refresh, Paper in the status line, Build's "More on this trade ▾"), it stays, in the board's style.
- **Touch targets** are at least 44 px (`TAP`); a few board chips are 40 px.
- **The ☆ saves a trade** everywhere, never a market.
- **Settings:** the board says "Alpha Vantage · 10-year price history"; the app reads the whole history since PR #49.
