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

## Claude Code, on its own

```bash
npx glimo hooks install
```

Registers Claude Code hooks, so every session in this project shows up as a glim without the model having to remember anything: idle when it starts, thinking when it gets a task, working while it uses tools, waiting when it needs your permission, done when it finishes, gone when the session ends.

It sends the name of the project folder, the state and a generic phrase such as "Editing files". Never your prompt, a command, a path or the content of a file.

| Flag            | What it does                                                           |
| --------------- | ---------------------------------------------------------------------- |
| `--global`      | Every project on this machine, not only this one                       |
| `--detail`      | Also send the tool name and up to 80 characters about what it is doing |
| `--approve`     | Answer permission prompts from the vitrina, with Allow or Deny         |
| `--name <name>` | Display name of the glim (or set `GLIMO_AGENT_NAME`)                   |

```bash
npx glimo hooks status       # installed or not, and for which vitrina
npx glimo hooks uninstall    # removes the hooks and their runner, nothing else
```

The install copies one dependency-free file to `.glimo/hook.mjs` and merges the hooks into `.claude/settings.local.json`; every other setting and hook stays as it was. Needs Claude Code 2.1.139 or later. What is sent, the event table and the risks of `--approve`: [docs/claude-code.md](https://github.com/lukchamo/glimo/blob/main/docs/claude-code.md).

Zero dependencies, Node 20+. Self-hosting: set `GLIMO_URL`. Docs and source: <https://github.com/lukchamo/glimo>.

Apache-2.0 © CooWeb
