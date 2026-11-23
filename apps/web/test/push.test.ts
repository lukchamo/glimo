import { describe, expect, it } from 'vitest';
import {
  type Device,
  isIos,
  isPublicKey,
  keyToBytes,
  pushEnvironment,
  readPublicKey,
  sameBytes,
  usedElsewhere,
} from '../src/lib/push';

// The example key of the Web Push codelabs: a real uncompressed P-256 point.
const KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

describe('server key', () => {
  it('base64url becomes the 65 bytes the browser asks for', () => {
    const bytes = keyToBytes(KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
    expect(isPublicKey(bytes)).toBe(true);
    // Round trip: nothing was lost on the way.
    expect(Buffer.from(bytes).toString('base64url')).toBe(KEY);
  });

  it('reads the URL-safe alphabet, with or without padding', () => {
    // 0xfb 0xff 0xfe is "+//+" in base64 and "-__-" in base64url.
    expect([...keyToBytes('-__-')]).toEqual([0xfb, 0xff, 0xfe]);
    expect([...keyToBytes('+//+')]).toEqual([0xfb, 0xff, 0xfe]);
    expect([...keyToBytes('_w')]).toEqual([0xff]);
    expect([...keyToBytes('_w==')]).toEqual([0xff]);
    expect([...keyToBytes('__8')]).toEqual([0xff, 0xff]);
    expect([...keyToBytes(` ${KEY}\n`)]).toEqual([...keyToBytes(KEY)]);
    expect(keyToBytes('')).toHaveLength(0);
  });

  it('throws on what is not base64url, and readPublicKey says null instead', () => {
    expect(() => keyToBytes('not base64!')).toThrow();
    expect(readPublicKey('not base64!')).toBeNull();
    // Valid base64url, but not a P-256 point: too short, or the wrong first byte.
    expect(readPublicKey('_w')).toBeNull();
    expect(readPublicKey(Buffer.alloc(65, 1).toString('base64url'))).toBeNull();
    expect(readPublicKey(KEY)).toEqual(keyToBytes(KEY));
  });

  it('compares the key a subscription was made with, byte by byte', () => {
    const bytes = keyToBytes(KEY);
    expect(sameBytes(bytes.buffer, bytes)).toBe(true);
    expect(sameBytes(new Uint8Array(bytes), bytes)).toBe(true);
    const other = new Uint8Array(bytes);
    other[64] = (other[64] as number) ^ 1;
    expect(sameBytes(other.buffer, bytes)).toBe(false);
    expect(sameBytes(bytes.slice(0, 64).buffer, bytes)).toBe(false);
    // A view into a larger buffer only counts its own bytes.
    const padded = new Uint8Array(70);
    padded.set(bytes, 3);
    expect(sameBytes(new Uint8Array(padded.buffer, 3, 65), bytes)).toBe(true);
  });
});

describe('what this device can do', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD_AS_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const device = (over: Partial<Device>): Device => ({
    userAgent: CHROME,
    platform: 'Win32',
    maxTouchPoints: 0,
    standalone: undefined,
    displayStandalone: false,
    push: true,
    ...over,
  });
  const iphone = (over: Partial<Device> = {}) =>
    device({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5, ...over });

  it('a browser with service workers, push and notifications is ready', () => {
    expect(pushEnvironment(device({}))).toBe('ready');
  });

  it('a browser without them gets nothing', () => {
    expect(pushEnvironment(device({ push: false }))).toBe('none');
    // A real Mac has no touch screen: it is not an iPad.
    expect(
      pushEnvironment(device({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', push: false })),
    ).toBe('none');
  });

  it('an iPhone or iPad in a browser tab is told about the Home Screen', () => {
    expect(pushEnvironment(iphone({ push: false, standalone: false }))).toBe('home-screen');
    // Other browsers on iOS do not have navigator.standalone: the display mode decides.
    expect(pushEnvironment(iphone({ push: false }))).toBe('home-screen');
    expect(
      pushEnvironment(
        device({
          userAgent: IPAD_AS_MAC,
          platform: 'MacIntel',
          maxTouchPoints: 5,
          push: false,
          standalone: false,
        }),
      ),
    ).toBe('home-screen');
  });

  it('once on the Home Screen it is a browser like any other', () => {
    expect(pushEnvironment(iphone({ standalone: true, displayStandalone: true }))).toBe('ready');
    // Installed, but on an iOS without Web Push: nothing to offer, and no hint either.
    expect(pushEnvironment(iphone({ push: false, standalone: true }))).toBe('none');
    expect(pushEnvironment(iphone({ push: false, displayStandalone: true }))).toBe('none');
  });

  it('before iOS 16.4 the Home Screen would not help, so it is not suggested', () => {
    const old = (version: string) =>
      iphone({
        userAgent: IPHONE.replace('17_5', version),
        push: false,
        standalone: false,
      });
    expect(pushEnvironment(old('15_8'))).toBe('none');
    expect(pushEnvironment(old('16_3'))).toBe('none');
    expect(pushEnvironment(old('16_4'))).toBe('home-screen');
    expect(pushEnvironment(old('18_6'))).toBe('home-screen');
  });

  it('recognises iOS by its user agent, and an iPad in desktop mode by its touch screen', () => {
    expect(isIos({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: CHROME, platform: 'Win32', maxTouchPoints: 10 })).toBe(false);
  });
});

describe('one subscription, several vitrinas', () => {
  const storage = (entries: Record<string, string>) => {
    const names = Object.keys(entries);
    return {
      length: names.length,
      key: (index: number) => names[index] ?? null,
      getItem: (name: string) => entries[name] ?? null,
    };
  };
  const ENDPOINT = 'https://push.example/send/abc';

  it('knows when another vitrina on this device still uses it', () => {
    const remembered = storage({
      'glimo:push:va': ENDPOINT,
      'glimo:push:vb': ENDPOINT,
      'glimo:key:vb': ENDPOINT,
      'glimo:locale': 'en',
    });
    expect(usedElsewhere(remembered, ENDPOINT, 'va')).toBe(true);
    expect(usedElsewhere(remembered, ENDPOINT, 'vb')).toBe(true);
  });

  it('does not count itself, other endpoints or anything else this browser remembers', () => {
    const remembered = storage({
      'glimo:push:va': ENDPOINT,
      'glimo:push:vb': 'https://push.example/send/old',
      'glimo:key:vc': ENDPOINT,
    });
    expect(usedElsewhere(remembered, ENDPOINT, 'va')).toBe(false);
    expect(usedElsewhere(storage({}), ENDPOINT, 'va')).toBe(false);
  });
});
