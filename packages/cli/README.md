# glimo

Your agents, at a glance. Show any AI agent as a living avatar (a glim) whose expression is its real status.

```bash
npx glimo@latest init
```

That creates a vitrina, saves its address and key in `.glimo/config.json` (ignored by git) and opens it.

```bash
npx glimo status sales waiting "Wants to send 12 emails" --action approve:"Approve sending":sensitive
npx glimo wait sales          # prints the person's decision as JSON
npx glimo demo                # a sample team, alive
npx glimo mcp                 # stdio MCP server for clients without HTTP transport
```

States: `idle`, `thinking`, `working`, `waiting`, `blocked`, `done`, `tired`, `sleeping`.

Zero dependencies, Node 20+. Self-hosting: set `GLIMO_URL`. Docs and source: <https://github.com/lukchamo/glimo>.

Apache-2.0 © CooWeb
