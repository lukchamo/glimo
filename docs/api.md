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

## Notifications

A device can ask to be told when an agent needs the person. When a status moves an agent
into `waiting` or `blocked` (from any other state, or because it arrives in that state),
every device subscribed to that vitrina gets a Web Push message, with the page open or
closed. Writing the same state again does not notify, and a vitrina notifies 12 times a
minute at most, so an agent that keeps changing state cannot flood a phone.

Watching is a read capability and so is being told: these calls take the vitrina id, not
the key. Like every `POST` and `DELETE`, they are refused from other websites, and
subscribing and unsubscribing count as writes of that vitrina for the rate limit.

### `GET /api/push/key`

```json
{ "publicKey": "BN2D…JJXg" }
```

The deployment's VAPID public key: base64url of the 65-byte uncompressed P-256 point.
Decode it and pass it as `applicationServerKey` to `pushManager.subscribe()`.

Answers `503 push_not_configured` when the deployment has no VAPID keys (see
[self-hosting](self-hosting.md#notifications)). Everything else works the same without them.

### `POST /api/vitrinas/{id}/push`

Body: what `PushSubscription.toJSON()` gives, plus an optional `locale` (`"en"` by default,
or `"es"`) for the text of the notification.

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/…",
  "keys": { "p256dh": "<base64url, 65 bytes>", "auth": "<base64url, 16 bytes>" },
  "locale": "en"
}
```

Answers `201 { "ok": true }`. Subscribing again with the same endpoint updates it.

| Status | Code                     | When                                                         |
| ------ | ------------------------ | ------------------------------------------------------------ |
| 400    | `invalid_endpoint`       | Not an https URL, an IP address, a port or credentials in it |
| 403    | `endpoint_not_allowed`   | The host is not a browser push service                       |
| 403    | `forbidden_origin`       | Called from another website                                  |
| 404    | `not_found`              | Unknown or expired vitrina                                   |
| 409    | `too_many_subscriptions` | The vitrina already notifies 20 devices                      |
| 413    | `invalid_body`           | Body over 2 KB                                               |
| 422    | `invalid_subscription`   | Missing or mistyped fields, wrong key sizes, unknown locale  |
| 503    | `push_not_configured`    | The deployment has no VAPID keys                             |

The server sends to browser push services and nowhere else: `fcm.googleapis.com`,
`updates.push.services.mozilla.com`, `*.push.apple.com` and `*.notify.windows.com`, over
https on the default port, without following redirects. A subscription lives in the
vitrina, is deleted with it, and is never returned by any endpoint. It is forgotten as soon
as its push service answers that it no longer exists (404 or 410).

### `DELETE /api/vitrinas/{id}/push`

Body: `{ "endpoint": "https://…" }`. Answers `200 { "ok": true }`, also when that endpoint
was not subscribed.

### What the device receives

The message is encrypted for that browser (RFC 8291, `aes128gcm`) and signed with VAPID
(RFC 8292). Once decrypted it is JSON:

```json
{
  "title": "Sales is waiting for you",
  "body": "Wants to send 12 emails",
  "url": "/v/v3nmprazy14gdexmewkpzmkgg",
  "tag": "sales",
  "state": "waiting"
}
```

| Field   | What                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| `title` | Who needs the person, in the language of the subscription (see below)          |
| `body`  | The `say` of the status, or an empty string                                    |
| `url`   | Path of the vitrina, to open when the notification is tapped                   |
| `tag`   | The agent id: a newer notification about the same agent replaces the older one |
| `state` | `waiting` or `blocked`                                                         |

| Locale | `waiting`                   | `blocked`               |
| ------ | --------------------------- | ----------------------- |
| `en`   | `{name} is waiting for you` | `{name} is blocked`     |
| `es`   | `{name} te espera`          | `{name} está bloqueado` |

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
| Devices notified per vitrina  | 20                         |
| Notifications per vitrina     | 12 per minute              |

Rate limits are approximate and counted per Cloudflare location.
