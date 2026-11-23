// The glim: Glimo's avatar. Its expression is the agent's real status.
// Usage: <Glim state="waiting" size={64} />  (remember to import '@glimo/glim/glim.css')
//
// Every gesture is data: eyes, colour and signal only change when the agent's state
// changes. Blinking, breathing and looking around are neutral signs of life and never
// alter the shape that carries the state.

import { type GlimState, type Locale, STATE_LABEL } from '@glimo/spec';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { life, motionPaused } from './life.js';
import { rhythmFor } from './seed.js';

export type EyeKind = 'dot' | 'line' | 'focus' | 'big' | 'happy' | 'x' | 'droop';

export const EYES: Record<GlimState, EyeKind> = {
  idle: 'dot',
  thinking: 'dot',
  working: 'focus',
  waiting: 'big',
  blocked: 'x',
  done: 'happy',
  tired: 'droop',
  sleeping: 'line',
};

export interface GlimProps {
  state: GlimState;
  /** Side of the square in px. Default 64. */
  size?: number;
  /** Body colour. Defaults to the state colour. */
  body?: string;
  /** Eye colour. */
  eye?: string;
  /** Shows the state signal (!, zz, check…). Hidden below 32 px. */
  badge?: boolean;
  /** Blinks, breathes, looks around and reacts to touch. Default true. */
  alive?: boolean;
  /** Stable seed for this glim's rhythm (usually the agent id). */
  seed?: string;
  /** Accessible name. Defaults to "Glim: <state>". Pass "" when the text next to it already says it. */
  alt?: string;
  /** Language of the default accessible name. */
  locale?: Locale;
  className?: string;
  style?: CSSProperties;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SWAP_MS = 240;
const POP_MS = 700;
const SPRING =
  'linear(0, 0.027 2.1%, 0.097 4.3%, 0.237 7.1%, 0.741 15.7%, 0.913 19.3%, 1.039 22.9%, 1.119 26.4%, 1.157 30%, 1.16 34.3%, 1.106 41.4%, 1.007 52.9%, 0.976 61.4%, 0.988 77.1%, 1.004 99.3%, 1)';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function animate(
  element: Element | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (!element || typeof element.animate !== 'function') return;
  try {
    element.animate(keyframes, options);
  } catch {
    // Older engines without linear() easing: play it with a standard curve instead.
    element.animate(keyframes, { ...options, easing: 'ease-out' });
  }
}

export function Glim({
  state,
  size = 64,
  body,
  eye,
  badge = true,
  alive = true,
  seed,
  alt,
  locale = 'en',
  className,
  style,
}: GlimProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const actorRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);

  // `shown` trails `state` by a blink: the eyes close, change shape, and open again.
  const [shown, setShown] = useState(state);
  const [fade, setFade] = useState<{ from: GlimState; key: number } | null>(null);

  useEffect(() => {
    if (state === shown) return;
    if (!alive || prefersReducedMotion() || motionPaused()) {
      setShown(state);
      return;
    }
    const root = rootRef.current;
    // The eyes close, change shape while closed, and open again.
    animate(
      faceRef.current,
      [
        { scale: '1 1' },
        { scale: '1.04 0.06', offset: 0.42 },
        { scale: '1.04 0.06', offset: 0.58 },
        { scale: '1 1' },
      ],
      { duration: SWAP_MS, easing: 'ease-in-out' },
    );
    const timer = setTimeout(() => {
      setFade((previous) => ({ from: shown, key: (previous?.key ?? 0) + 1 }));
      setShown(state);
      // Squash and stretch: the body lands into its new state.
      animate(
        actorRef.current,
        [{ scale: '1.12 0.88' }, { scale: '0.95 1.06', offset: 0.3 }, { scale: '1 1' }],
        { duration: POP_MS, easing: SPRING },
      );
      if (root) life().attention(root);
    }, SWAP_MS * 0.45);
    return () => clearTimeout(timer);
  }, [state, shown, alive]);

  // Eyes follow the pointer and glance around (shared engine, see life.ts).
  useIsomorphicLayoutEffect(() => {
    if (!alive || !rootRef.current || !faceRef.current) return;
    return life().register(rootRef.current, faceRef.current);
  }, [alive]);

  const rhythm = rhythmFor(seed ?? id);
  const showBadge = badge && size >= 32;
  const vars: Record<string, string | number> = {
    fontSize: Math.max(16, size),
    '--glim-blink': `${rhythm.blink}s`,
    '--glim-blink-delay': `${rhythm.blinkDelay}s`,
    '--glim-breathe': `${rhythm.breathe}s`,
    '--glim-breathe-delay': `${rhythm.breatheDelay}s`,
  };
  if (body) vars['--glim-body'] = body;
  if (eye) vars['--glim-eye'] = eye;

  return (
    <span
      ref={rootRef}
      {...(alt === ''
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': alt ?? `Glim: ${STATE_LABEL[locale][shown]}` })}
      className={className ? `glim ${className}` : 'glim'}
      data-state={shown}
      data-alive={alive ? '' : undefined}
      data-custom-body={body ? '' : undefined}
      data-blink={rhythm.doubleBlink ? 'double' : undefined}
      style={{ ...(vars as CSSProperties), ...style }}
    >
      <span ref={actorRef} className="glim__actor">
        <span className="glim__body">
          {fade && !body && (
            <span key={fade.key} className="glim__fade" data-from={fade.from} aria-hidden="true" />
          )}
          <span ref={faceRef} className="glim__face" data-eyes={EYES[shown]}>
            <span className="glim__eye" />
            <span className="glim__eye" />
          </span>
        </span>
        {showBadge && <Badge key={shown} state={shown} />}
      </span>
    </span>
  );
}

function Badge({ state }: { state: GlimState }): ReactNode {
  switch (state) {
    case 'waiting':
      return <span className="glim__badge glim__badge--bang" aria-hidden="true" />;
    case 'sleeping':
      return (
        <span className="glim__badge glim__badge--zz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
        </span>
      );
    case 'thinking':
      return (
        <span className="glim__badge glim__badge--think" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      );
    case 'working':
      return <span className="glim__badge glim__badge--ring" aria-hidden="true" />;
    case 'done':
      return (
        <span className="glim__badge glim__badge--check" aria-hidden="true">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="5 12.5 10 17 19 7" />
          </svg>
        </span>
      );
    case 'tired':
      return (
        <span className="glim__badge glim__badge--battery" aria-hidden="true">
          <span />
        </span>
      );
    default:
      return null;
  }
}

export default Glim;
