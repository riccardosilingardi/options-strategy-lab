# Options Strategy Lab

Paper-trading platform for multi-leg options strategies on commodity ETFs.
An agent that cannot execute a trade it cannot justify.

- `PRD.md` — full product spec. Read this first.
- `CLAUDE.md` — short project memory for coding sessions.
- `.claude/skills/` — domain skills, loaded automatically in Claude Code.
- `.mcp.json.example` — Alpaca MCP config. Copy to `.mcp.json` and fill in
  paper credentials. `.mcp.json` is gitignored and must never be committed.
  The valid `ALPACA_TOOLSETS` values are `account`, `trading`, `watchlists`,
  `assets`, `stock-data`, `crypto-data`, `options-data`, `corporate-actions`,
  `news`, `fixed-income-data` and `index-data`; the example enables the subset
  this project uses.

## Local development

```
npm install
npm run dev
```

```
npm test     # signals, risk gate, theme contrast, wizard and visuals
npm run build
```

Deployment is automatic: every push to `main` publishes via Netlify.

## Public demo

`https://<site>/?demo=<DEMO_TOKEN>` opens the site without the password. The
token is checked on the edge against the `DEMO_TOKEN` environment variable and
never reaches the browser bundle; a cookie keeps the session in demo mode for a
day so the token only has to be given once.

A demo session is read-only **at the broker**: everything is visible and
navigable, three didactic example positions are preloaded from live prices, and
every button that would send an order to Alpaca is disabled with the tooltip
"Demo mode: read only". Demo state stays in the visitor's own browser and is
never written to the shared `/api/state` blob. See PRD §7b.

Optional environment variable: `ANTHROPIC_WORKSPACE_ID`. Set it only when the
Anthropic key is identity-linked — the API then requires an
`anthropic-workspace-id` header, and `netlify/functions/ai.mjs` sends it only
when the variable is present.
