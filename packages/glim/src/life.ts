// The life engine: one shared, event-driven loop that makes every glim on the page look
// at the pointer, glance around when nobody is there, and notice a neighbour that changed.
//
// Performance contract:
//   · one set of listeners and one rAF loop for the whole document, not one per glim
//   · the loop only runs while something is moving, then stops (no perpetual render loop)
//   · layout is read in one batch, then written in one batch (no layout thrash)
//   · only `translate` is written, so every frame stays on the compositor
//   · off-screen glims are skipped and their CSS animations are paused
//   · nothing runs with prefers-reduced-motion or while the tab is hidden

import type { GlimState } from '@glimo/spec';

/** How much each state lets the eyes wander (0 = eyes never move). */
export const GAZE_AMPLITUDE: Record<GlimState, number> = {
  idle: 1,
  thinking: 0.35,
  working: 0.3,
  waiting: 1,
  blocked: 0,
  done: 0.7,
  tired: 0.4,
  sleeping: 0,
};

/** Eyes travel at most this fraction of the glim size. */
export const MAX_GAZE = 0.05;

/** Resting eye offset of each state, in glim sizes (mirrors --glim-look-x/y in glim.css). */
export const LOOK: Partial<Record<GlimState, readonly [number, number]>> = {
  thinking: [0.05, -0.05],
  working: [0, 0.03],
};

/** Page-wide switch (WCAG 2.2.2 pause/stop/hide): <html data-glim-motion="off">. */
export function motionPaused(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.glimMotion === 'off';
}

/** Pauses or resumes every glim on the page. Persisting the choice is up to the app. */
export function setMotionPaused(paused: boolean): void {
  if (typeof document === 'undefined') return;
  if (paused) document.documentElement.dataset.glimMotion = 'off';
  else delete document.documentElement.dataset.glimMotion;
  if (paused) engine?.rest();
}

/**
 * Where the eyes should point, in px, for a glim centred at (cx, cy) looking at (px, py).
 * Pure function: the heart of the engine, unit-tested without a DOM.
 */
export function gazeOffset(
  cx: number,
  cy: number,
  px: number,
  py: number,
  size: number,
  amplitude: number,
): { x: number; y: number } {
  const dx = px - cx;
  const dy = py - cy;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001 || amplitude <= 0 || size <= 0) return { x: 0, y: 0 };
  // Full deflection once the target is ~2 glims away; proportional when closer.
  const reach = Math.min(1, distance / (size * 2));
  const max = size * MAX_GAZE * amplitude * reach;
  return { x: (dx / distance) * max, y: (dy / distance) * max };
}

interface Entry {
  root: HTMLElement;
  face: HTMLElement;
  cx: number;
  cy: number;
  size: number;
  visible: boolean;
  /** Current eased offset. */
  x: number;
  y: number;
  /** A temporary point of interest that beats the pointer until `glanceUntil`. */
  glanceX: number;
  glanceY: number;
  glanceUntil: number;
}

const EASE_MS = 90;
const SETTLE_PX = 0.04;
const POINTER_IDLE_MS = 2600;

class LifeEngine {
  private entries = new Map<HTMLElement, Entry>();
  private observer: IntersectionObserver | null = null;
  private frame = 0;
  private lastTick = 0;
  private dirty = true;
  private pointerX = 0;
  private pointerY = 0;
  private pointerAt = -Infinity;
  private wanderTimer: ReturnType<typeof setTimeout> | undefined;
  private reduced = false;
  private started = false;

  register(root: HTMLElement, face: HTMLElement): () => void {
    this.start();
    const entry: Entry = {
      root,
      face,
      cx: 0,
      cy: 0,
      size: 0,
      visible: true,
      x: 0,
      y: 0,
      glanceX: 0,
      glanceY: 0,
      glanceUntil: 0,
    };
    this.entries.set(root, entry);
    this.observer?.observe(root);
    this.dirty = true;
    return () => {
      this.entries.delete(root);
      this.observer?.unobserve(root);
      if (this.entries.size === 0) this.stop();
    };
  }

  /** A glim asks its neighbours to look at it (called when its state changes). */
  attention(root: HTMLElement): void {
    if (this.reduced || !this.started || motionPaused()) return;
    const source = this.entries.get(root);
    if (!source) return;
    this.measure();
    const now = performance.now();
    for (const entry of this.entries.values()) {
      if (entry === source || !entry.visible) continue;
      const distance = Math.hypot(entry.cx - source.cx, entry.cy - source.cy);
      if (distance > Math.max(entry.size, source.size) * 7) continue;
      entry.glanceX = source.cx;
      entry.glanceY = source.cy;
      // Farther glims notice a little later and look a little longer: a wave, not a snap.
      entry.glanceUntil = now + 900 + distance * 1.5;
    }
    this.wake();
  }

  private start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = media.matches;
    media.addEventListener('change', this.onMotionPreference);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onPointer, { passive: true });
    window.addEventListener('scroll', this.invalidate, { passive: true, capture: true });
    window.addEventListener('resize', this.invalidate, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(this.onIntersect, { rootMargin: '64px' });
    }
    this.scheduleWander();
  }

  private stop(): void {
    if (!this.started) return;
    this.started = false;
    window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .removeEventListener('change', this.onMotionPreference);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('scroll', this.invalidate, { capture: true });
    window.removeEventListener('resize', this.invalidate);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.observer?.disconnect();
    this.observer = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    clearTimeout(this.wanderTimer);
  }

  private onMotionPreference = (event: MediaQueryListEvent): void => {
    this.reduced = event.matches;
    if (this.reduced) this.rest();
  };

  /** Eyes back to their resting place, loop stopped. */
  rest(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const entry of this.entries.values()) {
      entry.x = entry.y = 0;
      entry.glanceUntil = 0;
      entry.face.style.translate = '';
    }
  }

  private onPointer = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerAt = performance.now();
    this.wake();
  };

  private invalidate = (): void => {
    this.dirty = true;
    if (performance.now() - this.pointerAt < POINTER_IDLE_MS) this.wake();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      clearTimeout(this.wanderTimer);
    } else {
      this.dirty = true;
      this.scheduleWander();
    }
  };

  private onIntersect = (changes: IntersectionObserverEntry[]): void => {
    for (const change of changes) {
      const entry = this.entries.get(change.target as HTMLElement);
      if (!entry) continue;
      entry.visible = change.isIntersecting;
      // Pauses every CSS animation of an off-screen glim (see glim.css).
      entry.root.toggleAttribute('data-offscreen', !change.isIntersecting);
    }
    this.dirty = true;
  };

  private wake(): void {
    if (this.frame || this.reduced || document.hidden || motionPaused()) return;
    this.lastTick = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Read phase: one batch of layout reads, only when something moved. */
  private measure(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const entry of this.entries.values()) {
      if (!entry.visible) continue;
      const rect = entry.root.getBoundingClientRect();
      entry.cx = rect.left + rect.width / 2;
      entry.cy = rect.top + rect.height * 0.55;
      entry.size = rect.width;
    }
  }

  private tick = (now: number): void => {
    this.frame = 0;
    this.measure();
    // Frame-rate independent easing: identical feel at 60 Hz and 120 Hz.
    const alpha = 1 - Math.exp(-Math.min(64, now - this.lastTick) / EASE_MS);
    this.lastTick = now;
    const pointerLive = now - this.pointerAt < POINTER_IDLE_MS;
    let moving = false;

    // Write phase: `translate` only.
    for (const entry of this.entries.values()) {
      if (!entry.visible) continue;
      const amplitude = GAZE_AMPLITUDE[entry.root.dataset.state as GlimState] ?? 1;
      let target = { x: 0, y: 0 };
      if (now < entry.glanceUntil) {
        target = gazeOffset(
          entry.cx,
          entry.cy,
          entry.glanceX,
          entry.glanceY,
          entry.size,
          Math.max(amplitude, 0.5) * Math.sign(amplitude),
        );
        moving = true;
      } else if (pointerLive) {
        target = gazeOffset(
          entry.cx,
          entry.cy,
          this.pointerX,
          this.pointerY,
          entry.size,
          amplitude,
        );
      }
      const dx = target.x - entry.x;
      const dy = target.y - entry.y;
      if (Math.abs(dx) < SETTLE_PX && Math.abs(dy) < SETTLE_PX) {
        if (entry.x !== target.x || entry.y !== target.y) {
          entry.x = target.x;
          entry.y = target.y;
          this.write(entry);
        }
        continue;
      }
      entry.x += dx * alpha;
      entry.y += dy * alpha;
      this.write(entry);
      moving = true;
    }

    // Keep ticking only while something is still travelling (or will relax soon).
    if (moving || pointerLive) this.frame = requestAnimationFrame(this.tick);
  };

  /** Plain px values, no custom properties: the write stays composite-only. */
  private write(entry: Entry): void {
    if (entry.x === 0 && entry.y === 0) {
      // Back to the stylesheet's resting value.
      entry.face.style.translate = '';
      return;
    }
    const base = LOOK[entry.root.dataset.state as GlimState];
    const x = entry.x + (base ? base[0] * entry.size : 0);
    const y = entry.y + (base ? base[1] * entry.size : 0);
    entry.face.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  }

  /** With no pointer around (touch screens, idle desks) glims glance about on their own. */
  private scheduleWander(): void {
    clearTimeout(this.wanderTimer);
    if (!this.started || this.reduced) return;
    this.wanderTimer = setTimeout(
      () => {
        this.wander();
        this.scheduleWander();
      },
      1400 + Math.random() * 2600,
    );
  }

  private wander(): void {
    if (document.hidden || this.reduced || motionPaused()) return;
    const now = performance.now();
    if (now - this.pointerAt < POINTER_IDLE_MS) return;
    const visible = [...this.entries.values()].filter(
      (e) => e.visible && (GAZE_AMPLITUDE[e.root.dataset.state as GlimState] ?? 1) > 0,
    );
    if (visible.length === 0) return;
    this.measure();
    const entry = visible[Math.floor(Math.random() * visible.length)] as Entry;
    const other = visible[Math.floor(Math.random() * visible.length)] as Entry;
    if (other !== entry && Math.random() < 0.6) {
      // Look at a neighbour.
      entry.glanceX = other.cx;
      entry.glanceY = other.cy;
    } else {
      // Look somewhere nearby, mostly sideways.
      const angle = Math.random() * Math.PI * 2;
      entry.glanceX = entry.cx + Math.cos(angle) * entry.size * 3;
      entry.glanceY = entry.cy + Math.sin(angle) * entry.size * 1.2;
    }
    entry.glanceUntil = now + 700 + Math.random() * 900;
    this.wake();
  }
}

let engine: LifeEngine | undefined;

/** The page-wide life engine (created on first use, browser only). */
export function life(): LifeEngine {
  engine ??= new LifeEngine();
  return engine;
}
