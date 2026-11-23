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
| `ratelimits`        | `wrangler.jsonc` | Per-minute limits for creating, writing and reading                   |

Point the CLI at your deployment with `GLIMO_URL=https://your-domain.example`.

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
