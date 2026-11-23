#!/usr/bin/env node
// Static prerender: every public route becomes an HTML file that paints before any
// JavaScript runs. Fonts are preloaded, metadata is per page and per language.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'production';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const { render, matchRoute, metaFor, SITE } = await import(
  pathToFileURL(join(root, 'dist-ssr/entry-server.js')).href
);

const template = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
// Only the two Latin subsets are preloaded: they cover English and Spanish.
const fonts = assets.filter((file) => /-(latin)-wght-normal-[\w-]+\.woff2$/.test(file));

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

// [route, output file, hydrate in place?]
const pages = [
  ['/', 'index.html', true],
  ['/es/', 'es/index.html', true],
  ['/playground', 'playground.html', false],
  ['/es/playground', 'es/playground.html', false],
  ['/v/', 'v/index.html', false],
  ['/404', '404.html', false],
];

for (const [path, file, full] of pages) {
  const route = matchRoute(path);
  const meta = metaFor(route);
  const alternate = (locale) =>
    `${SITE.origin}${locale === 'es' ? '/es' : ''}${route.path === '/' ? '/' : route.path}`;
  const head = [
    `<title>${escapeHtml(meta.title)}</title>`,
    meta.description && `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    !meta.index && '<meta name="robots" content="noindex, nofollow" />',
    meta.canonical && `<link rel="canonical" href="${meta.canonical}" />`,
    meta.canonical && `<link rel="alternate" hreflang="en" href="${alternate('en')}" />`,
    meta.canonical && `<link rel="alternate" hreflang="es" href="${alternate('es')}" />`,
    meta.canonical && `<link rel="alternate" hreflang="x-default" href="${alternate('en')}" />`,
    meta.canonical && '<meta property="og:type" content="website" />',
    meta.canonical && `<meta property="og:site_name" content="${SITE.name}" />`,
    meta.canonical && `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    meta.canonical &&
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    meta.canonical && `<meta property="og:url" content="${meta.canonical}" />`,
    meta.canonical && `<meta property="og:image" content="${SITE.origin}/og.png" />`,
    meta.canonical && '<meta property="og:image:width" content="1200" />',
    meta.canonical && '<meta property="og:image:height" content="630" />',
    meta.canonical &&
      `<meta property="og:locale" content="${route.locale === 'es' ? 'es_ES' : 'en_US'}" />`,
    meta.canonical && '<meta name="twitter:card" content="summary_large_image" />',
    ...fonts.map(
      (font) =>
        `<link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />`,
    ),
  ]
    .filter(Boolean)
    .join('\n    ');

  const html = template
    .replace('<html lang="en">', `<html lang="${route.locale}">`)
    .replace('<!--head-->', head)
    // A vitrina added to the Home Screen opens on that vitrina, not on the landing page:
    // its manifest has no start_url. On an iPhone that is where notifications work.
    .replace(
      'href="/site.webmanifest"',
      route.kind === 'vitrina' ? 'href="/vitrina.webmanifest"' : 'href="/site.webmanifest"',
    )
    .replace(
      '<div id="root"><!--app--></div>',
      `<div id="root" data-prerender="${full ? 'full' : 'shell'}" data-path="${path}">${render(path)}</div>`,
    );
  const target = join(dist, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

// The published spec: the JSON Schema and its examples, straight from the repo.
mkdirSync(join(dist, 'spec/v0.1'), { recursive: true });
cpSync(
  join(root, '../../spec/glimo-spec.schema.json'),
  join(dist, 'spec/v0.1/glimo-spec.schema.json'),
);
cpSync(join(root, '../../spec/examples'), join(dist, 'spec/v0.1/examples'), { recursive: true });

const urls = ['/', '/es/', '/playground', '/es/playground'];
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${SITE.origin}${url}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);

rmSync(join(root, 'dist-ssr'), { recursive: true, force: true });
console.log(`Prerendered ${pages.length} pages, preloading ${fonts.length} fonts.`);
