# Animation and performance

A glim has to feel alive and never cost a frame. This is how, and how we checked.

## The rules

1. **Every gesture is data.** Eyes, colour and signal only change when the agent's state
   changes. Blinking, breathing and looking around are neutral signs of life and never
   alter the shape that carries the state.
2. **Only `translate`, `scale`, `rotate` and `opacity` are animated.** They are composited:
   no layout, no paint. A unit test parses the stylesheet and fails on anything else.
3. **One element, one property, one kind of motion**, so animations never fight:

   | Element        | Property                       | Motion                                            |
   | -------------- | ------------------------------ | ------------------------------------------------- |
   | `.glim`        | `scale`, `translate`           | pointer reactions: lift on hover, squish on press |
   | `.glim__actor` | `translate`, `scale`, `rotate` | the state's own motion: hop, shake, bob, sag      |
   | `.glim__body`  | `scale`                        | breathing                                         |
   | `.glim__face`  | `translate`                    | gaze (written by the life engine)                 |
   | `.glim__face`  | `scale`                        | blinking (both eyes share one layer)              |
   | `.glim__badge` | `scale`, `opacity`, `rotate`   | signal entrance and idle motion                   |

4. **No perpetual JavaScript loop.** The life engine has one set of listeners and one
   `requestAnimationFrame` loop for the whole page. It runs while something is moving and
   then stops. Layout is read in one batch and written in one batch.
5. **Colour changes cross-fade with `opacity`**, not by animating `background-color`.
6. **Eyes change shape during a blink.** They close, swap, and open: the oldest trick in
   character animation, and it hides the shape change completely.
7. **Nobody is in sync.** Each glim gets its own blink and breathing rhythm from a
   deterministic seed (the agent id), with a negative delay so loops start mid-cycle. The
   server and the browser compute the same values, so hydration never mismatches.
8. **Squash and stretch keep the volume**: `scaleX × scaleY` stays close to 1.
9. **Off-screen glims are paused** (IntersectionObserver sets `animation-play-state: paused`).
10. **Motion is optional.** `prefers-reduced-motion` removes it, and
    `<html data-glim-motion="off">` pauses every glim: the "Pause motion" control required
    by WCAG 2.2.2 for anything that moves by itself for more than five seconds. The state
    stays fully readable without motion.

## Numbers we used

| What            | Value                                                          | Source                                                                           |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Blink interval  | 3.4 to 6.8 s per glim                                          | Humans blink every 2 to 10 s[^blink]                                             |
| Blink duration  | about 60 ms closing, 100 ms opening                            | 100 to 150 ms, closing faster than opening[^blink]                               |
| Breathing cycle | 3.2 to 4.8 s, 1.5 to 3 % scale                                 | 12 to 15 breaths per minute at rest[^breath]; amplitude is our choice            |
| Eye travel      | at most 5 % of the glim size, eased with a 90 ms time constant | Saccades last 20 to 200 ms[^saccade]                                             |
| Springs         | damping ratio 0.5 (700 ms) and 0.7 (450 ms), as CSS `linear()` | Bounce 0.1 to 0.3 for playful UI[^emil], Apple's "brisk" to "noticeable"[^apple] |
| Press feedback  | 110 ms                                                         | Interaction feedback under 200 ms[^uiskills]                                     |
| Signal entrance | from `scale(0.4)` with opacity, never from 0                   | "Never animate from scale(0)"[^emil]                                             |

## What we learned from the research

Before writing the component we reviewed the public agent skills for interface motion and
the current browser facts. What changed our design:

- **Custom properties inside `transform` are not composited.** Changing a variable always
  triggers at least a style recalculation, and inherited variables recalculate the whole
  subtree[^tier][^bramus]. The life engine therefore writes plain pixel values to
  `element.style.translate`, never a `calc(var(--x) …)`.
- **Individual transform properties** (`translate`, `scale`, `rotate`) are widely available
  and composited like `transform`[^individual]. They let one element carry several
  independent motions without wrapper elements.
- **`linear()` easing** is widely available since mid 2026[^linear]. Our springs are a
  damped oscillator sampled into `linear()`, with a `cubic-bezier` fallback.
- **A CSS animation on transform or opacity promotes its element by itself**, so
  `will-change` is unnecessary and costs memory when left on[^willchange].
- **Infinite compositor animations are not free**: the compositor still produces
  frames[^webkit-power]. Hence one layer for both eyes, pausing off-screen, and a global
  pause control.
- **WCAG 2.2.2** requires a pause mechanism for idle loops[^wcag222].

Skills reviewed (worth loading in your coding agent when you work on motion):

| Skill                                | Install                                                                 | What we took from it                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Emil Kowalski, `emilkowalski/skills` | `npx skills@latest add emilkowalski/skills`                             | ease-out by default, never `transition: all`, never from `scale(0)`, stagger 30 to 80 ms                  |
| Vercel `web-design-guidelines`       | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` | transform and opacity only, correct `transform-origin`, pause control for auto-playing motion             |
| `ibelick/ui-skills`                  | `npx skills add ibelick/ui-skills`                                      | no rAF loop without a stop condition, no `will-change` outside an animation, do not animate CSS variables |
| Motion AI Kit                        | `npx motion-ai`                                                         | CSS keyframes for simple infinite loops, springs as `linear()`                                            |
| Anthropic `frontend-design`          | `/plugin marketplace add anthropics/skills`                             | motion that is not user-triggered is used sparingly                                                       |

## Measurements

Measured on 23 November 2026 with Chromium (Playwright, headless, **no GPU**: software
rendering, so real devices do better) against the production build.

| Scenario                                                | Result                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| Home page, 28 glims, pointer moving                     | 16.7 ms median frame, 16.7 ms p95, 16.8 ms worst: a steady 60 fps |
| Long tasks during 4 s of animation                      | 0                                                                 |
| Animated properties found by `document.getAnimations()` | `scale`, `translate`, `rotate`, `opacity` only                    |
| Running animations with 28 glims on the page            | 42 of 116 (the rest are off-screen and paused)                    |
| Running glim animations after "Pause motion"            | 0                                                                 |
| Stress test, 200 glims changing state                   | 32 fps, slowest frame 50 ms (software rendering)                  |

Reproduce it: open <https://glimo.dev/playground#stress>, or run `pnpm e2e`.

## Checklist for changes to the glim

- [ ] Only `translate`, `scale`, `rotate`, `opacity` in keyframes and transitions.
- [ ] The new motion owns its element and property (see the table above).
- [ ] It stops under `prefers-reduced-motion` and `data-glim-motion="off"`.
- [ ] It does not change the eye shape or the signal of a state.
- [ ] `pnpm --filter @glimo/glim test` passes, and the playground stress test does not regress.

[^blink]: <https://en.wikipedia.org/wiki/Blinking>, <https://pmc.ncbi.nlm.nih.gov/articles/PMC4043155/>
[^breath]: <https://en.wikipedia.org/wiki/Respiratory_rate>
[^saccade]: <https://en.wikipedia.org/wiki/Saccade>
[^emil]: <https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md>
[^apple]: <https://developer.apple.com/videos/play/wwdc2023/10158/>
[^uiskills]: <https://github.com/ibelick/ui-skills>
[^tier]: <https://motion.dev/blog/web-animation-performance-tier-list>
[^bramus]: <https://www.bram.us/2023/02/01/the-gotcha-with-animating-custom-properties/>
[^individual]: <https://web.dev/articles/css-individual-transform-properties>
[^linear]: <https://www.joshwcomeau.com/animation/linear-timing-function/>
[^willchange]: <https://developer.mozilla.org/en-US/docs/Web/CSS/will-change>
[^webkit-power]: <https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/>
[^wcag222]: <https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html>
