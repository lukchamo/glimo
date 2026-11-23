# Self-hosting

Glimo runs on a single Cloudflare Worker with a D1 database and Durable Objects. The free
plan is enough to start.

## Deploy your own

```bash
git clone https://github.com/lukchamo/glimo && cd glimo
pnpm install

# 1. Create your database and put its id in workers/edge/wrangler.jsonc ("database_id")
pnpm --filter @glimo/edge exec wrangler d1 create glimo

# 2. Point the Worker at your domain: edit "routes" in workers/edge/wrangler.jsonc
#    (or delete "routes" and set "workers_dev": true to use a workers.dev address)

# 3. Create the tables and the catalog
pnpm db:migrate:remote

# 4. Build the site and deploy
pnpm deploy

# 5. Set the secret that signs vitrina ids (any long random string)
openssl rand -base64 48 | pnpm --filter @glimo/edge exec wrangler secret put ID_SECRET

# 6. Optional: turn notifications on (see "Notifications" below)
node scripts/gen-vapid.mjs
```

Then check it:

```bash
node scripts/smoke.mjs https://your-domain.example
node scripts/pentest.mjs https://your-domain.example
```

## Configuration

| Name                | Where            | What                                                                  |
| ------------------- | ---------------- | --------------------------------------------------------------------- |
| `ID_SECRET`         | secret           | Signs vitrina ids. Rotating it invalidates every existing vitrina     |
| `VITRINA_TTL_HOURS` | `vars`           | Hours without activity before a vitrina is deleted (default 168)      |
| `ALLOWED_ORIGINS`   | `vars`           | Extra origins allowed to call the API from a browser, comma separated |
| `VAPID_PUBLIC_KEY`  | secret           | Web Push public key. Without both keys, notifications are off         |
| `VAPID_PRIVATE_KEY` | secret           | Web Push private key. Never in `wrangler.jsonc`, never in git         |
| `VAPID_SUBJECT`     | `vars`           | Contact for push services (default: the deployment's own address)     |
| `ratelimits`        | `wrangler.jsonc` | Per-minute limits for creating, writing and reading                   |

Point the CLI at your deployment with `GLIMO_URL=https://your-domain.example`.

## Notifications

Glimo can call the person back with a Web Push notification when an agent starts waiting
or gets blocked. It is off until the deployment has a VAPID key pair. Make one:

```bash
node scripts/gen-vapid.mjs
```

It prints a new pair and the exact lines to use: two lines for `workers/edge/.dev.vars`
when you develop locally, and for production these two commands with the values filled in:

```bash
echo '<public key>' | pnpm --filter @glimo/edge exec wrangler secret put VAPID_PUBLIC_KEY
echo '<private key>' | pnpm --filter @glimo/edge exec wrangler secret put VAPID_PRIVATE_KEY
```

A secret is live as soon as its command finishes. Then check:

```bash
curl https://your-domain.example/api/push/key        # {"publicKey":"B…"} once it is on
node scripts/smoke.mjs https://your-domain.example   # "notifications (optional) … configured"
node scripts/pentest.mjs https://your-domain.example # probes where notifications can be sent
```

What to know:

- **Format.** The public key is the base64url of the 65-byte uncompressed P-256 point (what
  browsers take as `applicationServerKey`); the private key is the base64url of the 32-byte
  scalar. A pair from `npx web-push generate-vapid-keys` has the same format and works too.
- **Both or nothing.** Without both keys, or with two keys that do not belong together,
  `GET /api/push/key` answers `503 push_not_configured`, nobody can subscribe, and
  everything else works exactly the same. The Worker logs that the pair is not valid, never
  the keys.
- **Keep the pair.** Browsers subscribe with the public key. If you change it, every device
  has to turn notifications on again.
- **`VAPID_SUBJECT`** tells push services who to contact about your deployment: an https URL
  or a `mailto:` address. When it is missing, the https address of the deployment is used.
- **Where it sends.** Only to browser push services (`fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`), never to
  an address chosen by whoever subscribes. Messages are encrypted for each browser; push
  services cannot read them.
- **What is stored.** Up to 20 subscriptions per vitrina, inside its Durable Object. They
  are deleted with the vitrina and when a push service says the device is gone.

## Zone settings worth turning on

- Always Use HTTPS: on.
- Minimum TLS version: 1.2.
- A redirect rule from `www` to the apex.

## Local development

```bash
cp workers/edge/.dev.vars.example workers/edge/.dev.vars
pnpm dev          # builds the site, applies local migrations, serves everything on :8787
pnpm dev:web      # Vite with hot reload on :5173, proxying the API to :8787
```
