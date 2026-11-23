# @glimo/spec

Glimo Spec v0.1: the status contract between any AI agent and a Glimo interface. Types, a
validator, the Agent Status Protocol mapping and the live-channel reducer.

```bash
npm install @glimo/spec
```

```ts
import { createStatus, fromASP, parseGlimoStatus, sortByUrgency } from '@glimo/spec';

const status = createStatus({
  agent: { id: 'sales', name: 'Sales' },
  ...fromASP(['awaiting-approval']), // → { state: 'waiting', reason: 'awaiting-approval' }
  say: 'Wants to send 12 follow-up emails',
  actions: [{ id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true }],
});

const result = parseGlimoStatus(status); // { ok: true, status } or { ok: false, issues }
```

Also exported: `STATES`, `STATE_LABEL` (English and Spanish), `STATE_COLOR`, `deriveUrgency`,
`summarize`, `redactSensitive`, `applyLiveEvent`, and the JSON Schema at
`@glimo/spec/schema.json`.

Spec: <https://github.com/lukchamo/glimo/blob/main/docs/spec.md> · Apache-2.0 © CooWeb
