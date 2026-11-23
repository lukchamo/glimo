# Governance

Glimo is an open project started and stewarded by CooWeb. This document says who decides
what today and how that opens up as the project grows. Status belongs to people, not to
companies.

## Roles

| Role                   | Can do                                                                                         | How you get there                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Contributor            | Open issues and PRs, publish skills and worlds                                                 | Anyone                                                           |
| Committer / area owner | Review and merge in one area (`packages/glim`, `workers/edge`, `skills/`, docs, a translation) | 5 merged PRs in the area and a nomination by a maintainer        |
| Maintainer             | Merge anywhere, cut releases, triage security reports                                          | 3 months as an active committer and consensus of the maintainers |
| Lead                   | Breaks ties, owns the roadmap and the trademark policy                                         | Chosen by the maintainers                                        |

Area owners are listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## How decisions are made

- **Lazy consensus.** A proposal with no objection from a maintainer after 5 business days
  is accepted.
- **RFC for big changes.** Anything that changes Glimo Spec, the public API, the security
  model or the license needs an RFC issue open for at least 10 days.
- **Who merges.** One approval from an owner of the area. Changes to `spec/` need two.
- **Disagreement.** Maintainers vote, simple majority. The lead breaks ties.

## The spec

Glimo Spec is meant to outlive this implementation. Once at least one external project
implements it, the plan is to move the spec to its own repository with its own maintainers,
and later propose it to a neutral foundation.

## Business and the open core

The engine, the spec, the glim, the CLI and the starter skills stay Apache-2.0. Anything
CooWeb sells around Glimo (managed hosting, support, premium templates) lives outside this
repository and never removes features from it.
