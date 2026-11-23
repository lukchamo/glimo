#!/usr/bin/env node
// Every package, the Worker and the CLI must agree on one version, and a release tag
// must match it.
//
//   node scripts/check-version.mjs            prints the version
//   node scripts/check-version.mjs v0.1.0     fails unless everything is 0.1.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const pkg = (path) => JSON.parse(read(path)).version;
const constant = (path) => /VERSION = '([^']+)'/.exec(read(path))?.[1];

const versions = {
  'packages/spec/package.json': pkg('packages/spec/package.json'),
  'packages/glim/package.json': pkg('packages/glim/package.json'),
  'packages/cli/package.json': pkg('packages/cli/package.json'),
  'packages/cli/bin/glimo.mjs': constant('packages/cli/bin/glimo.mjs'),
  'apps/web/package.json': pkg('apps/web/package.json'),
  'workers/edge/package.json': pkg('workers/edge/package.json'),
  'workers/edge/src/version.ts': constant('workers/edge/src/version.ts'),
};

const expected = (process.argv[2] ?? versions['packages/cli/package.json']).replace(/^v/, '');
const wrong = Object.entries(versions).filter(([, version]) => version !== expected);
if (wrong.length > 0) {
  console.error(`Expected ${expected} everywhere, but:`);
  for (const [file, version] of wrong) console.error(`  ${file} is ${version}`);
  process.exit(1);
}
if (!read('CHANGELOG.md').includes(`## ${expected} `)) {
  console.error(`CHANGELOG.md has no "## ${expected}" section.`);
  process.exit(1);
}
console.log(expected);
