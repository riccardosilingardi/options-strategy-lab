# Options Strategy Lab

Paper-trading platform for multi-leg options strategies on commodity ETFs.
An agent that cannot execute a trade it cannot justify.

- `PRD.md` — full product spec. Read this first.
- `CLAUDE.md` — short project memory for coding sessions.
- `.claude/skills/` — domain skills, loaded automatically in Claude Code.
- `.mcp.json.example` — Alpaca MCP config. Copy to `.mcp.json` and fill in
  paper credentials. `.mcp.json` is gitignored and must never be committed.

## Local development

```
npm install
npm run dev
```

Deployment is automatic: every push to `main` publishes via Netlify.
