#!/usr/bin/env node
// Makes the key pair a Glimo deployment needs to send notifications (Web Push, VAPID).
// Zero dependencies (Node 22+). Nothing is saved: the keys are printed once, here.
//
//   node scripts/gen-vapid.mjs
//   node scripts/gen-vapid.mjs >> workers/edge/.dev.vars    the output is a valid .dev.vars
//
// Public key: base64url of the 65-byte uncompressed P-256 point, which is what a browser
// takes as applicationServerKey. Private key: base64url of the 32-byte scalar. This is
// the format of `npx web-push generate-vapid-keys`, so a pair made there works too.

import { generateKeyPairSync } from 'node:crypto';

const { x, y, d } = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
  format: 'jwk',
});
// A JWK already carries each number as 32 bytes in base64url.
const part = (value) => Buffer.from(value, 'base64url');
const publicKey = Buffer.concat([Buffer.from([4]), part(x), part(y)]).toString('base64url');
const privateKey = d;
const put = (name, value) =>
  `#   echo '${value}' | pnpm --filter @glimo/edge exec wrangler secret put ${name}`;

console.log(`# Web Push keys for Glimo (VAPID, P-256), made ${new Date().toISOString().slice(0, 10)}.
# Keep the private key secret. Changing the pair later means every device has to
# turn notifications on again.
#
# Local development: put these two lines in workers/edge/.dev.vars
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
#
# Production: store both as secrets (never in wrangler.jsonc, never in git)
${put('VAPID_PUBLIC_KEY', publicKey)}
${put('VAPID_PRIVATE_KEY', privateKey)}
#
# Optional: who push services can contact about your deployment. Without it, the
# address of the deployment itself is used.
# VAPID_SUBJECT=mailto:you@example.com`);
