import type { Locale } from '@glimo/spec';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Footer, Header } from './components/Chrome';
import { COPY, LocaleContext, localeOf } from './lib/i18n';
import { usePath } from './lib/router';
import { SITE } from './lib/site';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// The home page is the first paint: it ships in the main bundle and is prerendered.
// Everything else loads on demand.
const loadPlayground = () => import('./pages/Playground');
const Playground = lazy(loadPlayground);
const VitrinaPage = lazy(() => import('./pages/VitrinaPage'));

export type RouteKind = 'home' | 'playground' | 'vitrina' | 'notfound';
export interface Route {
  kind: RouteKind;
  locale: Locale;
  /** Path without the locale prefix. */
  path: string;
}

export function matchRoute(pathname: string): Route {
  const locale = localeOf(pathname);
  const bare = pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  const path = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
  if (path === '/') return { kind: 'home', locale, path };
  if (path === '/playground') return { kind: 'playground', locale, path };
  if (path === '/v' || path.startsWith('/v/')) return { kind: 'vitrina', locale, path };
  return { kind: 'notfound', locale, path };
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string | null;
  index: boolean;
}

export function metaFor(route: Route): PageMeta {
  const copy = COPY[route.locale].meta;
  const prefix = route.locale === 'es' ? '/es' : '';
  switch (route.kind) {
    case 'home':
      return {
        title: copy.homeTitle,
        description: copy.homeDescription,
        canonical: `${SITE.origin}${prefix}/`,
        index: true,
      };
    case 'playground':
      return {
        title: copy.playgroundTitle,
        description: copy.playgroundDescription,
        canonical: `${SITE.origin}${prefix}/playground`,
        index: true,
      };
    case 'vitrina':
      return { title: copy.vitrinaTitle, description: '', canonical: null, index: false };
    default:
      return { title: copy.notFoundTitle, description: '', canonical: null, index: false };
  }
}

function Loading({ label }: { label: string }) {
  return (
    <main id="main" aria-busy="true">
      <div className="wrap page-head">
        <p className="sr-only">{label}</p>
      </div>
    </main>
  );
}

export function App({ initialPath }: { initialPath: string }) {
  const pathname = usePath(initialPath);
  const route = matchRoute(pathname);
  // A vitrina address has no language in it: follow the reader's.
  const [preferred, setPreferred] = useState<Locale | null>(null);
  const locale = route.kind === 'vitrina' && preferred ? preferred : route.locale;
  const first = useRef(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('glimo:locale');
      if (saved === 'en' || saved === 'es') setPreferred(saved);
      else if (navigator.language.toLowerCase().startsWith('es')) setPreferred('es');
    } catch {
      // No storage: the address decides.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (route.kind !== 'vitrina') {
      try {
        localStorage.setItem('glimo:locale', route.locale);
      } catch {
        // Not remembered.
      }
    }
    if (first.current) {
      first.current = false;
      return;
    }
    // After an in-page navigation: new title, focus on the new content.
    document.title = metaFor({ ...route, locale }).title;
    if (!location.hash) document.getElementById('main')?.focus({ preventScroll: true });
  }, [route.kind, route.locale, locale, route]);

  // Warm the playground while the visitor reads the home page.
  useEffect(() => {
    if (route.kind !== 'home') return;
    const idle = window.requestIdleCallback?.(() => void loadPlayground(), { timeout: 4000 });
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [route.kind]);

  const loading = COPY[locale].vitrina.loading;
  return (
    <LocaleContext value={locale}>
      {route.kind === 'vitrina' ? (
        <Suspense fallback={<Loading label={loading} />}>
          <VitrinaPage path={route.path} />
        </Suspense>
      ) : (
        <>
          <Header tone={route.kind === 'home' ? 'ultramar' : 'light'} path={route.path} />
          {route.kind === 'home' && <Home />}
          {route.kind === 'playground' && (
            <Suspense fallback={<Loading label={COPY[locale].playground.title} />}>
              <Playground />
            </Suspense>
          )}
          {route.kind === 'notfound' && <NotFound />}
          <Footer />
        </>
      )}
    </LocaleContext>
  );
}
