# Glimo Spec v0.1 (draft)

The contract between any agent and a Glimo interface. One small JSON says how the agent
is, what it needs and what the person can do about it.

- JSON Schema: [`spec/glimo-spec.schema.json`](../spec/glimo-spec.schema.json), published at
  <https://glimo.dev/spec/v0.1/glimo-spec.schema.json>
- Examples: [`spec/examples/`](../spec/examples/)
- TypeScript types and validator: [`@glimo/spec`](../packages/spec)

## Principles

1. **Small.** Only `spec`, `agent`, `state` and `updatedAt` are required.
2. **Compatible with Agent Status Protocol.** `state` is the visual layer; `reason` carries
   the ASP value that caused it. Glimo does not invent another status vocabulary.
3. **Actionable.** A status can declare actions. The interface never invents actions.
4. **Private.** `pov` and `thoughts` are sensitive. They are stored and synced encrypted
   and never reach public surfaces. Hosted vitrinas drop them.

## Example

```json
{
  "spec": "glimo/0.1",
  "agent": { "id": "sales", "name": "Sales" },
  "state": "waiting",
  "reason": "awaiting-approval",
  "say": "Wants to send 12 follow-up emails",
  "actions": [
    { "id": "approve", "label": "Approve sending", "kind": "primary", "sensitive": true },
    { "id": "open", "label": "Edit drafts", "kind": "secondary" }
  ],
  "updatedAt": "2026-11-23T10:30:00Z"
}
```

## Fields

| Field       | Type                   | Required | Description                                                    |
| ----------- | ---------------------- | -------- | -------------------------------------------------------------- |
| `spec`      | `"glimo/0.1"`          | yes      | Version                                                        |
| `agent`     | `{ id, name }`         | yes      | `id`: `^[a-z0-9][a-z0-9-]{0,63}$`. `name`: up to 40 characters |
| `state`     | enum (8)               | yes      | Visual state                                                   |
| `reason`    | string ≤ 64            | no       | ASP value behind the state, e.g. `awaiting-approval`           |
| `say`       | string ≤ 120           | no       | One short line for the vitrina                                 |
| `urgency`   | `high` / `mid` / `low` | no       | Derived from the state when missing                            |
| `actions`   | list ≤ 4               | no       | What the person can do                                         |
| `pov`       | object                 | no       | What the agent sees: `app`, `focus`, `items[]`. **Sensitive**  |
| `thoughts`  | list ≤ 50              | no       | `{ at, text }`, the last one is current. **Sensitive**         |
| `tools`     | list of strings        | no       | MCP servers in use                                             |
| `skills`    | list of strings        | no       | Skills in use                                                  |
| `world`     | object                 | no       | `{ id, spot, activity }` for living worlds                     |
| `talkingTo` | list of agent ids      | no       | Agents it is collaborating with right now                      |
| `updatedAt` | ISO 8601 date-time     | yes      | When this status was produced                                  |

Clients ignore fields they do not know. One serialized status is at most 16 KB.

## States and Agent Status Protocol mapping

| `state`    | Reads as        | Eyes            | Signal          | ASP values that produce it                                                                                                                   |
| ---------- | --------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`     | Ready           | dots            | none            | lifecycle `online`, `idle`                                                                                                                   |
| `thinking` | Thinking        | dots looking up | thought bubbles | task `submitted`, `queued`                                                                                                                   |
| `working`  | Working         | focused         | progress ring   | task `working`, `delegated`, `retrying` · lifecycle `busy`                                                                                   |
| `waiting`  | Waiting for you | big, open       | `!`             | task `input-required`, `auth-required`, `awaiting-approval`                                                                                  |
| `blocked`  | Blocked         | crosses         | none            | task `failed`, `rejected`, `timed-out` · health `unhealthy`, `auth-error`, `dependency-down`, `stalled` · lifecycle `crashed`, `unreachable` |
| `done`     | Done            | happy arcs      | check           | task `completed`                                                                                                                             |
| `tired`    | Out of energy   | drooping        | low battery     | health `rate-limited`, `quota-exhausted`, `overloaded` · lifecycle `at-capacity`                                                             |
| `sleeping` | Sleeping        | closed lines    | `z z`           | lifecycle `paused`, `offline`, `draining`, `stopping`                                                                                        |

The state is never communicated by colour alone: it always has its own eye shape and
signal, and its name when there is room.

When several ASP values apply at once the highest priority wins:
`blocked` > `waiting` > `tired` > `working` > `thinking` > `done` > `idle` > `sleeping`
(`fromASP()` in `@glimo/spec`).

## Derived urgency

| Urgency | States                                    | In the interface                                  |
| ------- | ----------------------------------------- | ------------------------------------------------- |
| `high`  | `waiting`, `blocked`                      | First in "Right now", the panel opens on it       |
| `mid`   | `done`, `tired`                           | Visible without interrupting                      |
| `low`   | `idle`, `thinking`, `working`, `sleeping` | Background: "It needs nothing from you right now" |

## Actions

Base vocabulary: `approve`, `respond`, `open`, `pause`, `resume`, `retry`, `wake`, `undo`,
`renew-access`, `raise-limit`. You can add your own (`^[a-z0-9][a-z0-9-]{0,31}$`).

```json
{ "id": "approve", "label": "Approve sending", "kind": "primary", "sensitive": true }
```

- `kind`: `primary` or `secondary`.
- `sensitive: true` requires explicit confirmation from the person and is always logged.
  Anything that sends, pays, publishes or deletes must be sensitive.

## Transport

| Transport              | How                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| MCP tools              | `glimo_status` to show a status, `glimo_action` to collect decisions, `glimo_vitrina` to read everything |
| REST                   | `POST /api/vitrinas/{id}/status`, see [api.md](api.md)                                                   |
| Live channel           | One WebSocket per screen with incremental messages: `snapshot`, `upsert`, `remove`, `action`             |
| MCP resource (planned) | `glimo://status/{agentId}` with `notifications/resources/updated`                                        |
| MCP App (planned)      | The vitrina as `ui://glimo/vitrina`                                                                      |

## Versioning

- Adding fields is a minor version. Breaking changes are a major version and a new
  `spec` value.
- Changes to this document or the schema need an RFC issue first (see
  [CONTRIBUTING.md](../CONTRIBUTING.md)).
