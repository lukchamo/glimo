# Changelog

All notable changes to this project are documented here. Releases follow
[Semantic Versioning](https://semver.org/); the spec has its own version (`glimo/0.1`).

## Unreleased

### Added

- **Claude Code reports on its own.** `glimo hooks install` registers Claude Code hooks, so
  every session shows up as a glim without the model calling anything. Private by default:
  prompts, commands and file names stay on the machine. `--detail` adds what a tool is
  doing, `--approve` lets you answer permission prompts from the vitrina, `--global` covers
  every project. See [docs/claude-code.md](docs/claude-code.md).
- **Notifications.** A vitrina calls you back with a Web Push when an agent starts waiting
  or gets blocked, with the page closed. VAPID and RFC 8291 encryption on WebCrypto, no new
  dependency. The server only posts to browser push services, a vitrina notifies 20 devices
  and 12 times a minute at most, and the feature is off until the deployment has a key pair
  (`node scripts/gen-vapid.mjs`).
- **Waiting time.** The panel says for how long a glim has needed you ("for 12 min"), and
  the tab title counts who needs you.
- A web manifest for vitrinas, so one added to a phone's Home Screen opens on that vitrina.
- `scripts/smoke.mjs` and `scripts/pentest.mjs` check notifications too.

## 0.1.0 (2026-11-23)

First public release.

### Added

- **Glimo Spec v0.1**: JSON Schema, examples and `@glimo/spec` (types, validator, Agent
  Status Protocol mapping, derived urgency, live-channel reducer).
- **`@glimo/glim`**: the glim as a React component. Eight states, each with its own eyes,
  colour and signal. It blinks, breathes, follows the pointer, glances at neighbours that
  change, and reacts to touch, animating only composited properties.
- **Hosted vitrinas** on Cloudflare: REST API, one Durable Object per vitrina with a
  WebSocket live channel and incremental messages, D1 through Drizzle for the skills
  catalog and the audit log.
- **MCP endpoint** (Streamable HTTP) with `glimo_status`, `glimo_action` and `glimo_vitrina`.
- **`glimo` CLI**: `init`, `status`, `wait`, `demo`, `open` and a stdio MCP bridge.
- **glimo.dev**: landing in English and Spanish, live vitrina page, and a playground with
  a glim lab, a spec editor, a live vitrina and a stress test.
- **Seven starter skills** in Agent Skills format.
- `scripts/smoke.mjs` and `scripts/pentest.mjs` to check any deployment in seconds.
