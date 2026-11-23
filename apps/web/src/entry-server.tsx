// Used at build time only (scripts/prerender.mjs): renders each route to static HTML.
import { renderToString } from 'react-dom/server';
import { App, matchRoute, metaFor } from './App';
import { SITE } from './lib/site';

export function render(path: string): string {
  return renderToString(<App initialPath={path} />);
}

export { matchRoute, metaFor, SITE };
