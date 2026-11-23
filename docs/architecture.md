# Architecture

```
  Any agent                                  Any screen
  (MCP client, script, CLI)                  (phone, laptop, wall)
        │  glimo_status / POST status              ▲  one WebSocket,
        ▼                                          │  incremental messages
┌──────────────────────────── glimo.dev (one Cloudflare Worker) ─────────────────────────┐
│  Static site (Workers Static Assets)      prerendered HTML, fingerprinted assets       │
│  /api/*  REST (Hono)                      validation with @glimo/spec, rate limits     │
│  /mcp/:id  MCP over Streamable HTTP       three tools                                  │
│  /v/:id  live vitrina page                app shell, noindex, no-referrer              │
│                                                                                        │
│  Durable Object "Vitrina" (one per vitrina)        D1 through Drizzle ORM              │
│    current status of every agent (SQLite)            skills catalog (cached at edge)   │
│    WebSocket Hibernation fan-out                     index of vitrinas                 │
│    pending decisions, expiry alarm                   audit log of decisions            │
│    notification subscriptions (Web Push)                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## Repository map

| Path               | What it is                                                                      |
| ------------------ | ------------------------------------------------------------------------------- |
| `spec/`            | Glimo Spec: JSON Schema and examples. Source of truth of the protocol           |
| `packages/spec`    | `@glimo/spec`: types, Zod validator, ASP mapping, urgency, live-channel reducer |
| `packages/glim`    | `@glimo/glim`: the React component and its life engine                          |
| `packages/cli`     | `glimo`: zero-dependency CLI, stdio MCP bridge and Claude Code hooks            |
| `apps/web`         | glimo.dev: landing (English and Spanish), playground, live vitrina page         |
| `workers/edge`     | The Worker: API, MCP endpoint, Durable Object, Web Push, D1 schema, migrations  |
| `skills/`          | Starter skills (Agent Skills format) and the catalog                            |
| `scripts/`         | `smoke.mjs` and `pentest.mjs`: check any deployment in seconds                  |
| `docs/`, `design/` | Documentation and design sources                                                |

## Where state lives

| State                                             | Where                              | Why                                                             |
| ------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| Live status of a vitrina                          | Durable Object (SQLite storage)    | One writer, strongly consistent, co-located with its WebSockets |
| Pending decisions                                 | Durable Object                     | Delivered exactly once to the agent                             |
| Notification subscriptions                        | Durable Object                     | Deleted with the vitrina, never returned by any read            |
| Skills catalog, vitrina index, audit log          | D1 (Drizzle)                       | Shared, queryable, cheap to cache                               |
| What an agent sees and thinks (`pov`, `thoughts`) | Nowhere on the server              | Dropped at the edge until end-to-end encryption ships           |
| The write key                                     | The person's browser and the agent | The server only keeps its SHA-256                               |

## The path of a status

1. An agent calls `glimo_status` (MCP) or `POST /api/vitrinas/{id}/status`.
2. The Worker checks the signed id (no storage touched for made-up ids), the rate limit,
   the body size, and validates the status with the same code the browser uses.
3. The Durable Object stores it, bumps `seq` and sends one `upsert` message to every
   connected screen. Measured in production: about 75 ms from the request leaving the
   agent to the change arriving on a screen.
4. If that moved the agent into `waiting` or `blocked`, every device that asked for it gets
   a Web Push, encrypted for that browser. The write does not wait for it.
5. The screen applies it with a pure reducer; only the glim that changed renders again,
   and its neighbours glance at it.
6. If the person decides, the action goes back through the API, is checked against what
   the agent declared, logged in D1 and delivered once to the agent.

## Why it is fast

| Layer        | What we do                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First paint  | Home is prerendered to static HTML; fonts are self-hosted and preloaded; no third-party requests at all                                                                         |
| Assets       | Fingerprinted and `immutable` for a year; HTML revalidates with an ETag                                                                                                         |
| Catalog      | D1 answer cached at the edge, fresh for 5 minutes and then served stale while it revalidates; the page paints from the catalog bundled at build time and refreshes in idle time |
| Live vitrina | Paints from the last snapshot stored in the browser, then one WebSocket with incremental messages; falls back to conditional polling when sockets are blocked                   |
| Server       | Signed ids are verified with one HMAC before any Durable Object or D1 call; Durable Objects hibernate while idle                                                                |
| Rendering    | Memoised cells; animations on the compositor only (see [animation-performance.md](animation-performance.md))                                                                    |

## What is not built yet

The original product vision (see [`es/PRD.md`](es/PRD.md)) goes further. Not in this
release: the local engine that runs agents and brains, end-to-end encryption with a
12-word phrase, the living world and the immersive view, world templates, the public
skills store with signing, the MCP App and the mobile app.
