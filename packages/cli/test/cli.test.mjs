import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildStatus, loadConfig, main, parseAction, parseArgs, VERSION } from '../bin/glimo.mjs';

describe('arguments', () => {
  it('splits positionals and flags, repeated flags become lists', () => {
    expect(
      parseArgs([
        'status',
        'sales',
        'waiting',
        'Wants',
        'approval',
        '--name',
        'Sales',
        '--action',
        'a:A',
        '--action=b:B',
        '--no-open',
      ]),
    ).toEqual({
      positional: ['status', 'sales', 'waiting', 'Wants', 'approval'],
      flags: { name: 'Sales', action: ['a:A', 'b:B'], 'no-open': true },
    });
  });

  it('parses actions: first is primary, "sensitive" is a suffix, labels may contain colons', () => {
    expect(parseAction('approve:Approve sending:sensitive', 0)).toEqual({
      id: 'approve',
      label: 'Approve sending',
      kind: 'primary',
      sensitive: true,
    });
    expect(parseAction('open:See 12:30 slot', 1)).toEqual({
      id: 'open',
      label: 'See 12:30 slot',
      kind: 'secondary',
    });
    expect(parseAction('retry')).toMatchObject({ id: 'retry', label: 'retry' });
  });

  it('builds a status and refuses unknown states', () => {
    expect(
      buildStatus('sales', 'waiting', 'Wants to send 12 emails', {
        name: 'Sales',
        action: 'approve:Approve:sensitive',
      }),
    ).toEqual({
      agent: { id: 'sales', name: 'Sales' },
      state: 'waiting',
      say: 'Wants to send 12 emails',
      actions: [{ id: 'approve', label: 'Approve', kind: 'primary', sensitive: true }],
    });
    expect(() => buildStatus('sales', 'dancing')).toThrow(/not a state/);
  });
});

describe('against a server', () => {
  const requests = [];
  let server;
  let url;
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'glimo-cli-'));

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push({
          method: request.method,
          url: request.url,
          auth: request.headers.authorization,
          body: body ? JSON.parse(body) : null,
        });
        response.setHeader('content-type', 'application/json');
        if (request.url === '/api/vitrinas') {
          response.statusCode = 201;
          response.end(
            JSON.stringify({
              id: 'vtest',
              key: 'gk_test',
              url: `${url}/v/vtest`,
              mcp: `${url}/mcp/vtest`,
            }),
          );
        } else if (request.url.includes('/actions')) {
          response.end(
            JSON.stringify({
              actions: [{ id: '1', agentId: 'sales', actionId: 'approve', at: 'now' }],
            }),
          );
        } else if (request.url.endsWith('/status') && body.includes('"bad"')) {
          response.statusCode = 422;
          response.end(
            JSON.stringify({
              error: {
                message: 'That is not a valid Glimo Spec status.',
                issues: [{ path: 'agent.id', message: 'Invalid' }],
              },
            }),
          );
        } else {
          response.end(JSON.stringify({ ok: true, seq: 1 }));
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
    process.chdir(dir);
  });

  afterAll(() => {
    process.chdir(cwd);
    server.close();
  });

  it('init creates a vitrina and saves it where git will not see it', async () => {
    const lines = [];
    await main(['init', '--url', url, '--no-open'], (line) => lines.push(line));
    expect(lines.join('\n')).toContain(`${url}/v/vtest#k=gk_test`);
    expect(JSON.parse(readFileSync(join(dir, '.glimo/config.json'), 'utf8'))).toEqual({
      url,
      id: 'vtest',
      key: 'gk_test',
    });
    expect(readFileSync(join(dir, '.glimo/.gitignore'), 'utf8')).toBe('*\n');
    expect(loadConfig({}, dir)).toMatchObject({ id: 'vtest' });
  });

  it('status sends the key as a header, never in the URL', async () => {
    const lines = [];
    await main(
      ['status', 'sales', 'waiting', 'Wants', 'approval', '--action', 'approve:Approve:sensitive'],
      (line) => lines.push(line),
    );
    const sent = requests.at(-1);
    expect(sent).toMatchObject({
      method: 'POST',
      url: '/api/vitrinas/vtest/status',
      auth: 'Bearer gk_test',
    });
    expect(sent.url).not.toContain('gk_');
    expect(sent.body).toMatchObject({
      state: 'waiting',
      say: 'Wants approval',
      actions: [{ id: 'approve', sensitive: true }],
    });
    expect(lines[0]).toBe('sales: waiting — Wants approval');
  });

  it('wait prints the decision and reports it through the exit code', async () => {
    const lines = [];
    const code = await main(['wait', 'sales', '--seconds', '1'], (line) => lines.push(line));
    expect(code).toBe(0);
    expect(JSON.parse(lines[0])).toMatchObject([{ actionId: 'approve' }]);
    expect(requests.at(-1).url).toBe('/api/vitrinas/vtest/actions?agent=sales&wait=1');
  });

  it('explains what the server rejected', async () => {
    await expect(main(['status', 'bad', 'idle'], () => {})).rejects.toThrow(/agent\.id: Invalid/);
  });

  it('prints help and version without a vitrina', async () => {
    const lines = [];
    await main(['--version'], (line) => lines.push(line));
    await main([], (line) => lines.push(line));
    expect(lines[0]).toBe(VERSION);
    expect(lines[1]).toContain('glimo init');
  });
});
