# CLAUDE.md

@AGENTS.md

## Notes for Claude Code

- Read `docs/es/PRD.md` and `docs/spec.md` before changing product behaviour.
- After touching the Worker, run `pnpm --filter @glimo/edge test` and then `pnpm dev` once:
  the test runtime is more forgiving than the real one about what an entry module exports.
- After touching the glim or the site, look at it: `pnpm dev`, then `pnpm e2e`.
- Deploying (`pnpm deploy`) changes production at glimo.dev. Ask first.
