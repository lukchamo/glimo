import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATES } from '@glimo/spec';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EYES, GAZE_AMPLITUDE, Glim, gazeOffset, MAX_GAZE, rhythmFor } from '../src/index.js';

const css = readFileSync(join(import.meta.dirname, '../src/glim.css'), 'utf8');

describe('Glim markup', () => {
  it.each(STATES)('renders %s with its own eyes and an accessible name', (state) => {
    const html = renderToStaticMarkup(<Glim state={state} seed="sales" />);
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(`data-eyes="${EYES[state]}"`);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Glim: [^"]+"/);
  });

  it('the state never depends on colour alone: every state has a distinct eye shape or signal', () => {
    const signature = (state: (typeof STATES)[number]) => {
      const html = renderToStaticMarkup(<Glim state={state} seed="x" />);
      const badge = /glim__badge--(\w+)/.exec(html)?.[1] ?? 'none';
      return `${EYES[state]}+${badge}`;
    };
    expect(new Set(STATES.map(signature)).size).toBe(STATES.length);
  });

  it('hides the signal below 32 px and when badge is off', () => {
    expect(renderToStaticMarkup(<Glim state="waiting" size={24} />)).not.toContain('glim__badge');
    expect(renderToStaticMarkup(<Glim state="waiting" badge={false} />)).not.toContain(
      'glim__badge',
    );
    expect(renderToStaticMarkup(<Glim state="waiting" size={32} />)).toContain('glim__badge--bang');
  });

  it('speaks Spanish when asked and honours a custom alt', () => {
    expect(renderToStaticMarkup(<Glim state="waiting" locale="es" />)).toContain(
      'aria-label="Glim: Te espera"',
    );
    expect(renderToStaticMarkup(<Glim state="idle" alt="o" />)).toContain('aria-label="o"');
  });

  it('is hidden from assistive tech when the text next to it already says it', () => {
    const html = renderToStaticMarkup(<Glim state="waiting" alt="" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it('can be rendered still', () => {
    expect(renderToStaticMarkup(<Glim state="idle" alive={false} />)).not.toContain('data-alive');
  });

  it('server and client agree on the rhythm (deterministic seed)', () => {
    const a = renderToStaticMarkup(<Glim state="working" seed="sales" />);
    const b = renderToStaticMarkup(<Glim state="working" seed="sales" />);
    expect(a).toBe(b);
  });
});

describe('rhythm', () => {
  it('is stable per seed and different between glims', () => {
    expect(rhythmFor('sales')).toEqual(rhythmFor('sales'));
    const blinks = new Set(
      ['sales', 'support', 'legal', 'data', 'mail'].map((s) => rhythmFor(s).blink),
    );
    expect(blinks.size).toBeGreaterThan(3);
  });

  it('stays inside natural ranges', () => {
    for (let i = 0; i < 200; i++) {
      const r = rhythmFor(`agent-${i}`);
      expect(r.blink).toBeGreaterThanOrEqual(3.4);
      expect(r.blink).toBeLessThanOrEqual(6.8);
      expect(r.blinkDelay).toBeLessThanOrEqual(0);
      expect(r.breathe).toBeGreaterThanOrEqual(3.2);
      expect(r.breathe).toBeLessThanOrEqual(4.8);
    }
  });
});

describe('gaze', () => {
  it('looks towards the target and never past the limit', () => {
    const right = gazeOffset(0, 0, 500, 0, 100, 1);
    expect(right.x).toBeCloseTo(100 * MAX_GAZE);
    expect(right.y).toBeCloseTo(0);
    const diagonal = gazeOffset(0, 0, -300, -300, 100, 1);
    expect(diagonal.x).toBeLessThan(0);
    expect(diagonal.y).toBeLessThan(0);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(100 * MAX_GAZE + 1e-9);
  });

  it('moves proportionally when the target is close and not at all when on top', () => {
    expect(gazeOffset(0, 0, 50, 0, 100, 1).x).toBeCloseTo(100 * MAX_GAZE * 0.25);
    expect(gazeOffset(10, 10, 10, 10, 100, 1)).toEqual({ x: 0, y: 0 });
  });

  it('closed or crossed eyes never move', () => {
    expect(GAZE_AMPLITUDE.sleeping).toBe(0);
    expect(GAZE_AMPLITUDE.blocked).toBe(0);
    expect(gazeOffset(0, 0, 500, 0, 100, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('stylesheet contract', () => {
  it('only animates compositor properties', () => {
    const allowed = new Set([
      'translate',
      'scale',
      'rotate',
      'opacity',
      'animation-timing-function',
    ]);
    const offenders: string[] = [];
    for (const block of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      for (const declaration of (block[2] ?? '').matchAll(/([a-z-]+)\s*:/g)) {
        if (!allowed.has(declaration[1] as string))
          offenders.push(`${block[1]}: ${declaration[1]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const transition of css.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of (transition[1] ?? '').split(',')) {
        const property = part.trim().split(/\s+/)[0] as string;
        expect(['scale', 'translate', 'none']).toContain(property);
      }
    }
  });

  it('respects reduced motion and pauses off-screen glims', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-play-state: paused');
  });

  it('has a colour and a rule for every state', () => {
    for (const state of STATES) {
      expect(css).toContain(`--glim-c-${state}:`);
      expect(css).toContain(`.glim[data-state="${state}"]`);
    }
  });
});
