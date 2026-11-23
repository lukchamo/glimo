# @glimo/glim

The glim: a living avatar for AI agents. Its expression is the agent's real status.

```bash
npm install @glimo/glim
```

```tsx
import { Glim } from '@glimo/glim';
import '@glimo/glim/glim.css';

<Glim state="waiting" size={64} seed="sales" />;
```

Eight states (`idle`, `thinking`, `working`, `waiting`, `blocked`, `done`, `tired`,
`sleeping`), each with its own eyes, colour and signal, so the state never depends on
colour alone.

It blinks, breathes, follows the pointer, glances at neighbours that change and reacts to
touch. Only `translate`, `scale`, `rotate` and `opacity` are animated, off-screen glims are
paused, and `prefers-reduced-motion` is respected. `setMotionPaused(true)` pauses every
glim on the page.

| Prop            | Default                 | What it does                                                 |
| --------------- | ----------------------- | ------------------------------------------------------------ |
| `state`         | required                | One of the eight states                                      |
| `size`          | `64`                    | Side of the square in px                                     |
| `badge`         | `true`                  | Shows the state signal (hidden below 32 px)                  |
| `alive`         | `true`                  | Idle motion and reactions                                    |
| `seed`          | React id                | Stable rhythm per glim, usually the agent id                 |
| `body`, `eye`   | state colours           | Custom colours                                               |
| `alt`, `locale` | `"Glim: <state>"`, `en` | Accessible name (pass `""` when the text next to it says it) |

React 18 or newer. How it stays at 60 fps:
<https://github.com/lukchamo/glimo/blob/main/docs/animation-performance.md> · Apache-2.0 © CooWeb
