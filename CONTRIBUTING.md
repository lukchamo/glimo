# Contributing to Glimo

Thanks for helping. This takes 3 minutes to read before your first PR.

## Ways to contribute

- Report a bug with the "Bug" issue form.
- Propose a feature: open an issue first and wait for the `accepted` label.
- Publish a skill or a world with the "Skill" form. Skills live in their own repository and
  get listed in the catalog.
- Verify Glimo with your MCP client and tell us (client and version): it updates the
  "Works with" table.
- Improve docs or translations. English is the main language, Spanish comes with it.

## Before you start

- Search existing issues and discussions.
- Small fixes (typos, docs, one-line bugs) can go straight to a PR.
- Anything bigger needs an accepted issue. PRs without one may be closed.
- Changes to the protocol (`spec/`, `docs/spec.md`) need an RFC issue: they affect every
  agent that emits Glimo Spec.

## Development setup

```bash
git clone https://github.com/lukchamo/glimo && cd glimo
pnpm install
pnpm test          # unit and Worker tests, a few seconds
pnpm dev           # site, API and live channel on http://localhost:8787
```

Node 22 and pnpm 10. No Cloudflare account is needed for development or tests.

| Command                     | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| `pnpm test`                 | All unit and Worker tests (Turborepo caches what did not change) |
| `pnpm test:unit`            | Only the packages, under two seconds                             |
| `pnpm e2e`                  | Browser tests against the local server                           |
| `pnpm lint` / `pnpm format` | Biome check / fix                                                |
| `pnpm typecheck`            | TypeScript in every package                                      |
| `pnpm smoke [url]`          | Is a deployment alive end to end?                                |
| `pnpm pentest [url]`        | Security probes, only against a deployment you own               |

## Pull request rules

- One change per PR. Keep it small.
- Title in Conventional Commits: `feat:`, `fix:`, `docs:`, `perf:`, `refactor:`, `test:`, `chore:`.
- Add or update tests. CI must be green.
- Visual changes need before and after screenshots, and a check with reduced motion.
- New integrations, skills and worlds go into a plugin or their own repository, not into core.
- Interface text follows the voice in `docs/es/02-marca.md`: a teammate who lets you know,
  first the agent and then what is going on, no emojis, no shouting capitals.

## Product rules that reviewers check

- The state never depends on colour alone: eyes, signal and name always.
- The interface never invents actions the agent did not declare.
- Sensitive actions (send, pay, publish, delete) always ask for confirmation.
- `pov` and `thoughts` are sensitive: never logged, never sent to public surfaces.
- Only `translate`, `scale`, `rotate` and `opacity` are animated
  ([why](docs/animation-performance.md)).
- Accessibility: WCAG 2.1 AA, 44 px touch targets, reduced motion respected.

## AI-assisted contributions

AI tools are welcome. You own every line: you must understand it and be able to explain
it without the AI. Write the PR description in your own words. Load `AGENTS.md` into your
agent's context. Tell us if an AI did a meaningful part of the work; it helps us review.
Non-trivial work by an agent still needs an accepted issue first.

## Review

A maintainer replies within 5 business days.

## Conduct, security and license

By participating you accept the [Code of Conduct](CODE_OF_CONDUCT.md). Report
vulnerabilities privately (see [SECURITY.md](SECURITY.md)), never in a public issue.
Contributions are licensed under Apache-2.0. Sign your commits with `git commit -s`
([DCO](https://developercertificate.org/)).
