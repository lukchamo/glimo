# API

Everything lives on one origin (`https://glimo.dev` for the hosted playground, your own
domain when you self-host).

- A **vitrina id** (`v…`, 25 characters) is a capability: whoever has it can watch.
- A **key** (`gk_…`) is needed to write, decide and read the audit log. Send it as
  `Authorization: Bearer gk_…`. Keys are never accepted in the URL.
- Errors are JSON: `{ "error": { "code": "…", "message": "…" } }`.

## Vitrinas

### `POST /api/vitrinas`

Creates a vitrina. No body.

```json
{
  "id": "v3nmprazy14gdexmewkpzmkgg",
  "key": "gk_…",
  "url": "https://glimo.dev/v/v3nmprazy14gdexmewkpzmkgg",
  "api": "https://glimo.dev/api/vitrinas/v3nmprazy14gdexmewkpzmkgg",
  "mcp": "https://glimo.dev/mcp/v3nmprazy14gdexmewkpzmkgg",
  "expiresAt": "2026-11-30T12:00:00.000Z"
}
```

The key is shown once; only its SHA-256 is stored. Hosted vitrinas are deleted after
7 days without activity.

### `GET /api/vitrinas/{id}`

Snapshot: `{ id, seq, agents, expiresAt }`. Agents come in arrival order (each glim keeps
its place on the shelf); sort with `sortByUrgency()` from `@glimo/spec` for lists.
Supports `If-None-Match`.

### `POST /api/vitrinas/{id}/status` 🔑

Body: a [Glimo Spec](spec.md) status. `spec` and `updatedAt` are filled in when missing,
so this is enough:

```bash
curl -X POST https://glimo.dev/api/vitrinas/$ID/status \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"agent":{"id":"sales","name":"Sales"},"state":"working","say":"On ticket 18 of 40"}'
```

Answers `{ "ok": true, "seq": 12 }`. `pov` and `thoughts` are dropped and reported:
`{ "dropped": ["pov", "thoughts"] }`. Up to 50 agents per vitrina, 16 KB per status.

### `DELETE /api/vitrinas/{id}/agents/{agentId}` 🔑

Takes an agent off the vitrina.

## Decisions

### `POST /api/vitrinas/{id}/actions` 🔑

The person decides. Body: `{ "agentId", "actionId", "confirm"?, "note"? }`.

- Only an action the agent declared in its current status is accepted (`409 unknown_action`).
- A sensitive action needs `"confirm": true` (`400 confirmation_required`).
- Every decision is written to the audit log (what, on which agent, when; never the note).

### `GET /api/vitrinas/{id}/actions?agent={agentId}&wait={seconds}` 🔑

The agent collects the decisions addressed to it. Each one is delivered once. `wait`
(0 to 20) keeps the request open until a decision arrives.

### `GET /api/vitrinas/{id}/log` 🔑

Last 50 decisions: `{ "log": [{ agentId, actionId, label, sensitive, at }] }`.

## Live channel

`GET /api/vitrinas/{id}/live` as a WebSocket. Read-only, same origin.

```jsonc
{ "t": "snapshot", "seq": 12, "agents": [ /* statuses */ ] }   // on connect
{ "t": "upsert",   "seq": 13, "agent": { /* status */ } }      // one agent changed
{ "t": "remove",   "seq": 14, "id": "sales" }
{ "t": "action",   "seq": 15, "action": { "agentId": "sales", "actionId": "approve", "at": "…" } }
```

Send the text `ping` to keep the connection alive; the answer is `pong`. Anything else
closes the socket. `applyLiveEvent()` in `@glimo/spec` is the reference reducer.

## Skills catalog

`GET /api/skills?q={text}` returns `{ "skills": [...] }` from D1, cached at the edge
(`x-glimo-cache: HIT|STALE|MISS`, `ETag`). An answer is fresh for 5 minutes; after that
the stale one is served at once while a new one is fetched in the background.

## MCP endpoint

`POST /mcp/{id}` 🔑 speaks MCP over Streamable HTTP (stateless, JSON responses).

```bash
claude mcp add --transport http glimo https://glimo.dev/mcp/$ID \
  --header "Authorization: Bearer $KEY"
```

```json
{
  "mcpServers": {
    "glimo": {
      "type": "http",
      "url": "https://glimo.dev/mcp/<id>",
      "headers": { "Authorization": "Bearer gk_…" }
    }
  }
}
```

Clients without HTTP transport can use the stdio bridge: `npx glimo mcp`.

| Tool            | What it does                                                           |
| --------------- | ---------------------------------------------------------------------- |
| `glimo_status`  | Show the agent's current status (`agent`, `state`, `say`, `actions`…)  |
| `glimo_action`  | Collect the person's decisions for the agent (`wait_seconds` up to 20) |
| `glimo_vitrina` | Read every agent's status, most urgent first                           |

## Limits

| What                          | Limit                      |
| ----------------------------- | -------------------------- |
| Creating vitrinas             | 10 per minute per address  |
| Writes (status, actions, MCP) | 300 per minute per vitrina |
| Reads                         | 600 per minute per address |
| Screens per vitrina           | 64                         |

Rate limits are approximate and counted per Cloudflare location.
