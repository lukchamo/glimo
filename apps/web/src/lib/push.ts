// Web Push in this browser: what the device can do, the key the server signs with and the
// subscription itself. The service worker (/sw.js) is registered in one place only,
// subscribeDevice, which runs when a person asks for notifications.

import { PUSH_PREFIX } from './api';

export const SERVICE_WORKER = '/sw.js';

// ---------- the key ----------

/** base64url (RFC 4648 §5, padding optional) to bytes: `applicationServerKey` takes a buffer. */
export function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.trim().replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** An uncompressed P-256 point: 0x04, then X and Y, 32 bytes each. */
export function isPublicKey(bytes: Uint8Array): boolean {
  return bytes.length === 65 && bytes[0] === 4;
}

/** The server key as bytes, or null when it is not one a browser would accept. */
export function readPublicKey(base64url: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bytes = keyToBytes(base64url);
    return isPublicKey(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export function sameBytes(a: ArrayBuffer | ArrayBufferView, b: Uint8Array): boolean {
  const left = ArrayBuffer.isView(a)
    ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    : new Uint8Array(a);
  return left.length === b.length && left.every((byte, index) => byte === b[index]);
}

// ---------- the device ----------

export interface Device {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.standalone`: only iOS has it, and it is false in a browser tab. */
  standalone: boolean | undefined;
  /** `(display-mode: standalone)` matches: opened as an installed app. */
  displayStandalone: boolean;
  /** Service workers, the Push API and notifications all exist here. */
  push: boolean;
}

/**
 * - `ready`: notifications can be offered.
 * - `home-screen`: an iPhone or iPad in a browser tab, where the Push API only exists once
 *   the site is added to the Home Screen.
 * - `none`: this browser cannot do it; nothing is offered.
 */
export type PushEnvironment = 'ready' | 'home-screen' | 'none';

export function isIos(device: Pick<Device, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPad|iPhone|iPod/.test(device.userAgent)) return true;
  // An iPad asking for the desktop site says it is a Mac, but a Mac has no touch screen.
  return device.platform === 'MacIntel' && device.maxTouchPoints > 1;
}

/** [major, minor] of iOS or iPadOS when the user agent says it. */
function iosVersion(userAgent: string): [number, number] | null {
  const match =
    /CPU (?:iPhone )?OS (\d+)_(\d+)/.exec(userAgent) ?? /Version\/(\d+)\.(\d+)/.exec(userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function pushEnvironment(device: Device): PushEnvironment {
  if (device.push) return 'ready';
  if (!isIos(device)) return 'none';
  if (device.standalone === true || device.displayStandalone) return 'none';
  // Web Push arrived in iOS 16.4: on anything older the Home Screen would not help.
  const version = iosVersion(device.userAgent);
  if (version && (version[0] < 16 || (version[0] === 16 && version[1] < 4))) return 'none';
  return 'home-screen';
}

export function thisDevice(): Device | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    push: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  };
}

// ---------- the subscription ----------

/** The subscription this browser holds, if any. It never registers anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

/**
 * Registers the service worker and subscribes this device. Call it once the person has
 * asked for notifications and the browser has said yes.
 */
export async function subscribeDevice(key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  await navigator.serviceWorker.register(SERVICE_WORKER, { scope: '/', updateViaCache: 'none' });
  // `ready` waits for an active worker, which is what subscribing needs.
  const registration = await within(navigator.serviceWorker.ready, 15_000);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const signedWith = existing.options?.applicationServerKey;
    if (!signedWith || sameBytes(signedWith, key)) return existing;
    // Made for another server key: the server could not send to it. Start again.
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * One browser holds one subscription for the whole site, shared by every vitrina it
 * follows. Is another vitrina on this device still using this one?
 */
export function usedElsewhere(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
  endpoint: string,
  id: string,
): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const name = storage.key(index);
    if (!name?.startsWith(PUSH_PREFIX) || name === `${PUSH_PREFIX}${id}`) continue;
    if (storage.getItem(name) === endpoint) return true;
  }
  return false;
}
