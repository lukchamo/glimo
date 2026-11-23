# AGENTS.md

Instructions for AI coding agents working in this repository.

## What Glimo is

An open source engine that shows AI agents as living avatars (glims) whose expression is
their real status. Agents report a small JSON (Glimo Spec) over MCP or REST; people watch
a vitrina and decide from it. English first, Spanish second.

## Project map

- `spec/` — Glimo Spec JSON Schema and examples. Source of truth. Changes need an RFC issue.
- `packages/spec` — `@glimo/spec`: types, Zod validator, ASP mapping, urgency, live reducer.
- `packages/glim` — `@glimo/glim`: the React component, `glim.css` and the life engine.
- `packages/cli` — `glimo`: zero-dependency CLI, stdio MCP bridge and Claude Code hooks (`bin/hooks.mjs` installs them, `bin/claude-hook.mjs` is the runner copied to `.glimo/hook.mjs`). Plain `.mjs`, no build.
- `apps/web` — glimo.dev: landing (`/`, `/es/`), `/playground`, live page `/v/:id`, and `public/sw.js` for notifications. React + Vite, prerendered.
- `workers/edge` — Cloudflare Worker: REST API (Hono), MCP endpoint, Durable Object `Vitrina`, Web Push (`src/push.ts`), D1 schema (Drizzle) and migrations.
- `skills/` — starter skills (Agent Skills format) and `catalog.json`.
- `scripts/` — `smoke.mjs`, `pentest.mjs`, `gen-vapid.mjs`, `gen-skills-seed.mjs`, `check-version.mjs`, `release-notes.mjs`.
- `.github/workflows` — `ci.yml` (every PR and `main`), `release.yml` (on a `v*` tag: GitHub release, npm when `NPM_TOKEN` exists).
- `docs/` — English docs; `docs/es/` product documents in Spanish (PRD, brand, privacy).
- `design/` — design sources. Read-only reference: copy structure, text, sizes and colours from `design/canvas/*.dc.html`, never the format.

## Commands

- Install `pnpm install`
- Test everything `pnpm test` · only packages `pnpm test:unit` · one package `pnpm --filter @glimo/glim test`
- Types `pnpm typecheck` · Lint `pnpm lint` · Fix `pnpm format`
- Run locally `pnpm dev` (http://localhost:8787) · browser tests `pnpm e2e`
- Check a deployment `pnpm smoke <url>` · `pnpm pentest <url>`
- New D1 migration: edit `workers/edge/src/db/schema.ts`, then `pnpm db:generate`
- Notifications locally: `node scripts/gen-vapid.mjs`, then put its two lines in `workers/edge/.dev.vars`
- Release: see "Releasing" in `CONTRIBUTING.md`. Never tag or publish without being asked.

## Rules

- Run the focused tests for the code you touched before opening a PR.
- Never edit generated files: `workers/edge/migrations/*` (use `pnpm db:generate`), `packages/spec/schema.json` (run `pnpm --filter @glimo/spec sync`), `dist/`.
- Never edit an applied migration; add a new one.
- Do not add dependencies without an accepted issue. `packages/cli` stays at zero dependencies.
- Keep public APIs and Glimo Spec backward compatible; breaking changes need a spec version bump.
- New integrations, skills and worlds go into a plugin, not into core.
- A Worker's entry module (`workers/edge/src/index.ts`) may only export handlers and classes.
- No secrets in the repository. Keys go in headers, never in URLs or logs.
- The Worker posts only to the browser push services listed in `workers/edge/src/push.ts`. A push endpoint and its keys are never logged and never returned by a read.
- The service worker only shows notifications: no `fetch` handler, no caching.
- The Claude Code hook runner never gets in the way: it exits 0, prints nothing but a permission decision, and gives up on the network after 1.5 seconds.

## Product rules

- The state never depends on colour alone: eye shape, signal and name always.
- Every gesture is data: idle motion (blink, breathe, gaze) must never change the shape that carries a state.
- Never invent actions an agent did not declare. Sensitive actions always ask for confirmation.
- `pov` and `thoughts` are sensitive: never stored in clear text, never logged, never public.
- Hooks send a state and a phrase from a fixed list. Prompts, answers and file contents never leave the machine; commands and file names only with `--detail`.
- A notification is sent when a glim starts to need the person (`waiting`, `blocked`), never while it works.
- Animate only `translate`, `scale`, `rotate` and `opacity`. No perpetual JavaScript loops. Respect `prefers-reduced-motion` and `data-glim-motion="off"`. A test enforces the first one.
- Interface text: a teammate who lets you know ("Sales is waiting for you: it wants to send 12 emails"), no emojis, no sustained capitals, no arrows in buttons. Every string exists in English and Spanish (`apps/web/src/lib/i18n.tsx`).
- Accessibility: WCAG 2.1 AA, 44 px touch targets, real buttons and links.

## Pull requests

- Link the issue, follow the PR template, explain why and not only what.
- Conventional Commits in the title. Sign off with `git commit -s`.
- Visual changes: before and after screenshots, plus one with reduced motion.

## Useful skills for this repo

Optional, for interface and motion work: `npx skills@latest add emilkowalski/skills`,
`npx skills add vercel-labs/agent-skills --skill web-design-guidelines`,
`npx skills add ibelick/ui-skills`. What we took from them is in
`docs/animation-performance.md`.
