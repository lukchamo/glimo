// "Notify me when a glim needs me": the opt-in that lets a vitrina call the person back
// when the page is closed. Nothing is registered until they ask; the browser's own
// subscription is the truth, and what this device remembers only makes the first paint right.

import { useEffect, useRef, useState } from 'react';
import { pushFor, pushKey, rememberPush, subscribePush, unsubscribePush } from '../lib/api';
import { useCopy, useLocale } from '../lib/i18n';
import {
  currentSubscription,
  pushEnvironment,
  readPublicKey,
  subscribeDevice,
  thisDevice,
  usedElsewhere,
} from '../lib/push';
import { Icon } from './ui';

type Phase =
  /** Still finding out: the row keeps its place so nothing jumps when the answer comes. */
  | 'checking'
  /** This browser or this deployment cannot notify: nothing is shown. */
  | 'hidden'
  /** iPhone or iPad in a browser tab: it works from the Home Screen. */
  | 'home-screen'
  | 'off'
  | 'asking'
  /** The person, or their browser, said no for this site. */
  | 'denied'
  | 'on'
  | 'stopping';

function firstPhase(id: string): Phase {
  const device = thisDevice();
  const environment = device ? pushEnvironment(device) : 'none';
  if (environment === 'none') return 'hidden';
  const remembered = environment === 'ready' && Notification.permission === 'granted';
  return remembered && pushFor(id) ? 'on' : 'checking';
}

/** Is another vitrina followed from this device still using this subscription? */
function sharedHere(endpoint: string, id: string): boolean {
  try {
    return usedElsewhere(localStorage, endpoint, id);
  } catch {
    return false;
  }
}

export function NotifyControl({ id }: { id: string }) {
  const copy = useCopy().notify;
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>(() => firstPhase(id));
  const [failed, setFailed] = useState<'on' | 'off' | null>(null);
  const key = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  /** The person has pressed the button: what they did wins over what the check finds. */
  const touched = useRef(false);
  /** The browser just answered a request made from here. */
  const answered = useRef(false);

  useEffect(() => {
    const device = thisDevice();
    const environment = device ? pushEnvironment(device) : 'none';
    if (environment === 'none') return;
    let stale = false;
    const check = async () => {
      const [server, subscription] = await Promise.all([
        pushKey(),
        environment === 'ready' ? currentSubscription().catch(() => null) : null,
      ]);
      if (stale) return;
      key.current = server.publicKey === null ? null : readPublicKey(server.publicKey);
      if (touched.current) return;
      const granted = environment === 'ready' && Notification.permission === 'granted';
      const mine = granted && subscription !== null && subscription.endpoint === pushFor(id);
      if (!mine) rememberPush(id, null);

      if (server.publicKey === null) {
        // Offline is no reason to hide what is already on. A deployment without push is.
        setPhase(mine && server.reason === 'unreachable' ? 'on' : 'hidden');
      } else if (!key.current) {
        setPhase('hidden');
      } else if (environment === 'home-screen') {
        setPhase('home-screen');
      } else if (Notification.permission === 'denied') {
        setPhase('denied');
      } else {
        setPhase(mine ? 'on' : 'off');
      }
    };
    void check();
    return () => {
      stale = true;
    };
  }, [id]);

  // When the answer takes the button away, the explanation takes the focus.
  useEffect(() => {
    if (phase === 'denied' && answered.current) status.current?.focus();
    answered.current = false;
  }, [phase]);

  const turnOn = async () => {
    touched.current = true;
    setFailed(null);
    setPhase('asking');
    try {
      // The key is normally here since the page opened, which makes asking the browser the
      // first thing after the tap: some browsers only ask when it comes straight from it.
      if (!key.current) {
        const server = await pushKey();
        key.current = server.publicKey === null ? null : readPublicKey(server.publicKey);
        if (!key.current) throw new Error('no server key');
      }
      await Notification.requestPermission();
      if (Notification.permission !== 'granted') {
        answered.current = true;
        setPhase(Notification.permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const subscription = await subscribeDevice(key.current);
      await subscribePush(id, subscription.toJSON(), locale);
      rememberPush(id, subscription.endpoint);
      setPhase('on');
    } catch {
      setFailed('on');
      setPhase('off');
    }
  };

  const turnOff = async () => {
    touched.current = true;
    setFailed(null);
    setPhase('stopping');
    try {
      const subscription = await currentSubscription();
      const endpoint = subscription?.endpoint ?? pushFor(id);
      // The server stops sending to this device for this vitrina...
      const told = endpoint
        ? await unsubscribePush(id, endpoint).then(
            () => true,
            () => false,
          )
        : true;
      // ...and the browser lets go of its subscription, unless another vitrina followed
      // from this device still uses it. If neither happened, it is still on.
      if (subscription && !sharedHere(subscription.endpoint, id)) await subscription.unsubscribe();
      else if (subscription && !told) throw new Error('still subscribed');
      rememberPush(id, null);
      setPhase('off');
    } catch {
      setFailed('off');
      setPhase('on');
    }
  };

  if (phase === 'hidden') return null;
  if (phase === 'checking') return <div className="notify" />;

  const busy = phase === 'asking' || phase === 'stopping';
  const on = phase === 'on' || phase === 'stopping';
  let text = '';
  if (phase === 'home-screen') text = copy.homeScreen;
  else if (phase === 'denied') text = copy.denied;
  else if (failed) text = failed === 'on' ? copy.failed : copy.failedOff;
  else if (on) text = copy.on;

  // No button where it could not work: on the Home Screen hint and when the site is blocked.
  const label = {
    off: copy.cta,
    asking: copy.asking,
    on: copy.off,
    stopping: copy.stopping,
    denied: null,
    'home-screen': null,
  }[phase];

  return (
    <div className="notify">
      <p ref={status} className="notify__status" aria-live="polite" tabIndex={-1}>
        {text}
      </p>
      {/* One button all the way, so the focus stays on it from "off" to "on". While it
          works it stays focusable and says it is disabled, instead of dropping the focus. */}
      {label && (
        <button
          type="button"
          className="icon-btn"
          aria-disabled={busy || undefined}
          aria-label={phase === 'on' ? copy.offLabel : undefined}
          onClick={busy ? undefined : on ? turnOff : turnOn}
        >
          {!on && <Icon name="bell" size={18} />}
          {label}
        </button>
      )}
    </div>
  );
}
