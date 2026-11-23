// Deterministic per-glim variance. Same seed, same rhythm, on the server and in the browser,
// so many glims never blink or breathe in sync and hydration never mismatches.

/** FNV-1a 32-bit hash. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rhythm {
  /** Blink cycle length in seconds (humans blink every 3 to 7 s). */
  blink: number;
  /** Negative delay so each glim starts at a different point of its blink cycle. */
  blinkDelay: number;
  /** Breathing cycle length in seconds. */
  breathe: number;
  breatheDelay: number;
  /** One glim in three blinks twice in a row. */
  doubleBlink: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function rhythmFor(seed: string): Rhythm {
  const next = prng(hash(seed));
  const blink = 3.4 + next() * 3.4;
  const breathe = 3.2 + next() * 1.6;
  return {
    blink: round(blink),
    blinkDelay: round(-next() * blink),
    breathe: round(breathe),
    breatheDelay: round(-next() * breathe),
    doubleBlink: next() < 0.34,
  };
}
