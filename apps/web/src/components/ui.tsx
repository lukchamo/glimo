import { Glim, setMotionPaused } from '@glimo/glim';
import { type AnchorHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { localePath, useCopy, useLocale } from '../lib/i18n';
import { onLinkClick } from '../lib/router';

/** Internal link: a real <a>, navigated in place when JavaScript is running. */
export function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a {...rest} href={href} onClick={onLinkClick}>
      {children}
    </a>
  );
}

/** The logotype: "glim" and a glim that is the o. It blinks and looks around too. */
export function Logo({ size = 30, tone }: { size?: number; tone: 'on-ultramar' | 'on-light' }) {
  const copy = useCopy();
  const locale = useLocale();
  const ultramar = '#2B34D6';
  return (
    <Link
      href={localePath(locale, '/')}
      className="logo"
      aria-label={copy.nav.home}
      style={{ ['--logo-size' as string]: `${size}px` }}
    >
      <span className="logo__word" aria-hidden="true">
        glim
      </span>
      <span className="logo__o" aria-hidden="true">
        <Glim
          state="idle"
          size={Math.round(size * 0.73)}
          body={tone === 'on-ultramar' ? '#FFFFFF' : ultramar}
          eye={tone === 'on-ultramar' ? ultramar : '#FFFFFF'}
          badge={false}
          seed="logo"
          alt="o"
        />
      </span>
    </Link>
  );
}

export function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (text: string) => {
    const done = () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => undefined);
    }
  };
  return [copied, copy];
}

export function CopyButton({
  text,
  className = 'btn btn--yellow',
  label,
  done,
}: {
  text: string;
  className?: string;
  label?: string;
  done?: string;
}) {
  const copy = useCopy();
  const [copied, doCopy] = useCopied();
  return (
    <button type="button" className={className} onClick={() => doCopy(text)}>
      <span aria-live="polite">
        {copied ? (done ?? copy.hero.copied) : (label ?? copy.hero.copy)}
      </span>
    </button>
  );
}

/** A command the person can copy with one tap. */
export function Command({ command, tone }: { command: string; tone?: 'ink' }) {
  const copy = useCopy();
  return (
    <div
      className={tone === 'ink' ? 'cmd cmd--ink' : 'cmd'}
      role="group"
      aria-label={copy.hero.commandLabel}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      <code tabIndex={0}>{command}</code>
      <CopyButton text={command} />
    </div>
  );
}

/** Code with its own copy button. */
export function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <figure className="snippet">
      <div className="snippet__bar">
        <figcaption className="snippet__title">{title}</figcaption>
        <CopyButton text={code} className="btn btn--line" />
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

const ICONS: Record<string, ReactNode> = {
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 17l5-5 4 4 7-8" />
      <path d="M15 8h5v5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
};

export function Icon({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name] ?? ICONS.pulse}
    </svg>
  );
}

const MOTION_KEY = 'glimo:motion';

/**
 * Pause / play for everything that moves by itself (WCAG 2.2.2). The choice is remembered.
 */
export function MotionToggle({ className }: { className?: string }) {
  const copy = useCopy();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(MOTION_KEY) === 'off') {
        setPaused(true);
        setMotionPaused(true);
      }
    } catch {
      // No storage: nothing to restore.
    }
  }, []);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    setMotionPaused(next);
    try {
      localStorage.setItem(MOTION_KEY, next ? 'off' : 'on');
    } catch {
      // Not remembered, still applied.
    }
  };
  return (
    <button type="button" className={className} aria-pressed={paused} onClick={toggle}>
      {paused ? copy.nav.playMotion : copy.nav.pauseMotion}
    </button>
  );
}
