# Security

## Reporting a vulnerability

Please report it privately, never in a public issue or discussion.

- Preferred: GitHub private vulnerability reporting, **Security → Report a vulnerability**
  on this repository.
- Or by email: hola@glimo.dev

Include what you found, how to reproduce it and what an attacker could do with it.

| Step                                               | When                      |
| -------------------------------------------------- | ------------------------- |
| We confirm we received it                          | within 2 business days    |
| First assessment and severity                      | within 5 business days    |
| Fix or mitigation for high and critical issues     | target of 30 days         |
| Public advisory and credit to you (if you want it) | after the fix is released |

Please give us that time before disclosing, and do not access data that is not yours.
Testing against your own vitrinas on glimo.dev is fine at a reasonable volume; denial of
service and social engineering are out of scope.

## Supported versions

Glimo is pre-1.0: security fixes go into the latest release and the hosted deployment.

## How Glimo is built to be safe

- Vitrina addresses are unguessable capabilities; writing and deciding need a 256-bit key,
  of which only the SHA-256 is stored.
- What an agent sees and thinks (`pov`, `thoughts`) is dropped before storage.
- The interface cannot invent actions; sensitive ones always need confirmation and are logged.
- Strict Content-Security-Policy, no third-party code, no cookies.

The latest review, with every probe and every fix, is in
[docs/security/pentest-2026-11.md](docs/security/pentest-2026-11.md). You can run the same
probes against your own deployment with `node scripts/pentest.mjs <url>`.
