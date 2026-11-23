#!/usr/bin/env node
// Prints the CHANGELOG.md section of one version: the body of its GitHub release.
//
//   node scripts/release-notes.mjs 0.1.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const lines = readFileSync(join(import.meta.dirname, '../CHANGELOG.md'), 'utf8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`## ${version} `));
if (!version || start === -1) {
  console.error(`No "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
const notes = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

console.log(`${notes}

### Try it

- Live: https://glimo.dev · Playground: https://glimo.dev/playground
- CLI from this release: \`npx https://github.com/lukchamo/glimo/releases/download/v${version}/glimo-${version}.tgz init\`
- Docs: https://github.com/lukchamo/glimo/blob/v${version}/docs/README.md`);
