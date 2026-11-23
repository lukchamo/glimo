import { readFileSync } from 'node:fs';
import { parseGlimoStatus, STATES } from '@glimo/spec';
import { describe, expect, it } from 'vitest';
import catalog from '../../../skills/catalog.json';
import { matchRoute, metaFor } from '../src/App';
import { DEMO_AFTER, DEMO_AGENTS, DEMO_EPOCH, DEMO_SCRIPT, toStatus } from '../src/lib/demo';
import { COPY, localeOf, localePath, sentence } from '../src/lib/i18n';

describe('routes', () => {
  it.each([
    ['/', 'home', 'en', '/'],
    ['/es/', 'home', 'es', '/'],
    ['/es', 'home', 'es', '/'],
    ['/playground', 'playground', 'en', '/playground'],
    ['/playground/', 'playground', 'en', '/playground'],
    ['/es/playground', 'playground', 'es', '/playground'],
    ['/v/v3nmprazy14gdexmewkpzmkgg', 'vitrina', 'en', '/v/v3nmprazy14gdexmewkpzmkgg'],
    ['/v/', 'vitrina', 'en', '/v'],
    ['/esperanza', 'notfound', 'en', '/esperanza'],
    ['/nope', 'notfound', 'en', '/nope'],
  ])('%s → %s (%s)', (pathname, kind, locale, path) => {
    expect(matchRoute(pathname)).toEqual({ kind, locale, path });
  });

  it('moves between languages without losing the page', () => {
    expect(localePath('es', '/')).toBe('/es/');
    expect(localePath('es', '/playground')).toBe('/es/playground');
    expect(localePath('en', '/es/playground')).toBe('/playground');
    expect(localePath('en', '/es/')).toBe('/');
    expect(localeOf('/es/playground')).toBe('es');
    expect(localeOf('/esperanza')).toBe('en');
  });

  it('only public pages are indexable, vitrinas never', () => {
    expect(metaFor(matchRoute('/'))).toMatchObject({
      index: true,
      canonical: 'https://glimo.dev/',
    });
    expect(metaFor(matchRoute('/es/'))).toMatchObject({ canonical: 'https://glimo.dev/es/' });
    expect(metaFor(matchRoute('/v/abc'))).toMatchObject({ index: false, canonical: null });
    expect(metaFor(matchRoute('/nope'))).toMatchObject({ index: false });
  });
});

describe('copy', () => {
  const paths = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => paths(child, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];

  it('every string exists in English and Spanish', () => {
    expect(paths(COPY.es)).toEqual(paths(COPY.en));
  });

  it('follows the voice: no emojis, no shouting capitals, no arrows in labels', () => {
    for (const locale of ['en', 'es'] as const) {
      const strings: string[] = [];
      const collect = (value: unknown) => {
        if (typeof value === 'string') strings.push(value);
        else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
      };
      collect(COPY[locale]);
      for (const text of strings) {
        expect(text, text).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(text, text).not.toMatch(/[→←»]/);
        expect(text, text).not.toMatch(/\b[A-ZÁÉÍÓÚÑ]{6,}\b/);
      }
    }
  });

  it('says first the agent, then what is going on', () => {
    for (const state of STATES) {
      expect(sentence('en', 'Sales', state).startsWith('Sales ')).toBe(true);
      expect(sentence('es', 'Ventas', state).startsWith('Ventas ')).toBe(true);
    }
  });
});

describe('demo data', () => {
  const statuses = [
    ...DEMO_AGENTS.map((agent) => [agent.id, agent.initial] as const),
    ...DEMO_SCRIPT.map(([, id, status]) => [id, status] as const),
    ...Object.entries(DEMO_AFTER).flatMap(([key, pair]) =>
      pair.map((status) => [key.split(':')[0] as string, status] as const),
    ),
  ];

  it('every example status is valid Glimo Spec in both languages', () => {
    for (const [id, status] of statuses) {
      const agent = DEMO_AGENTS.find((a) => a.id === id);
      expect(agent, id).toBeDefined();
      for (const locale of ['en', 'es'] as const) {
        const result = parseGlimoStatus(
          toStatus(agent as (typeof DEMO_AGENTS)[number], status, locale, DEMO_EPOCH),
        );
        expect(result.ok ? [] : result.issues, `${id} (${locale})`).toEqual([]);
      }
    }
  });

  it('the script ends where it started, so the loop is seamless', () => {
    const last = new Map<string, unknown>();
    for (const [, id, status] of DEMO_SCRIPT) last.set(id, status.state);
    for (const [id, state] of last) {
      expect(state, id).toBe(DEMO_AGENTS.find((agent) => agent.id === id)?.initial.state);
    }
  });

  it('anything that sends or renews access is marked sensitive', () => {
    for (const [, status] of statuses) {
      for (const action of status.actions ?? []) {
        if (['approve', 'renew-access'].includes(action.id)) expect(action.sensitive).toBe(true);
      }
    }
  });
});

describe('web app manifests', () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')) as Record<
      string,
      unknown
    >;

  it('a vitrina added to the Home Screen opens on itself, the site on its home page', () => {
    const { start_url: siteStart, ...site } = read('site.webmanifest');
    const { scope, ...vitrina } = read('vitrina.webmanifest');
    expect(siteStart).toBe('/');
    // No start_url: the page it was added from. The whole site stays inside the app.
    expect(vitrina).not.toHaveProperty('start_url');
    expect(scope).toBe('/');
    expect(vitrina).toEqual(site);
    // Installed like an app: on iOS that is what makes notifications available.
    expect(vitrina.display).toBe('standalone');
  });
});

describe('skills catalog', () => {
  it('every skill is complete, bilingual and points to a folder in the repo', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(7);
    for (const skill of catalog) {
      for (const field of [
        'slug',
        'name',
        'nameEs',
        'summary',
        'summaryEs',
        'needs',
        'needsEs',
        'icon',
      ] as const) {
        expect(skill[field], `${skill.slug}.${field}`).toBeTruthy();
      }
      expect(skill.path).toBe(`skills/${skill.slug}`);
      for (const state of skill.states) expect(STATES).toContain(state);
    }
  });
});
