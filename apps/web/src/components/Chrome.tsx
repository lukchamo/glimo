import { localePath, useCopy, useLocale } from '../lib/i18n';
import { SITE } from '../lib/site';
import { Link, Logo, MotionToggle } from './ui';

export function Header({ tone, path }: { tone: 'ultramar' | 'light'; path: string }) {
  const copy = useCopy();
  const locale = useLocale();
  const other = locale === 'en' ? 'es' : 'en';
  const home = localePath(locale, '/');
  return (
    <header
      className={tone === 'ultramar' ? 'site-header on-dark' : 'site-header site-header--light'}
    >
      <a className="skip" href="#main">
        {copy.nav.skip}
      </a>
      <div className="wrap site-header__row">
        <Logo tone={tone === 'ultramar' ? 'on-ultramar' : 'on-light'} />
        <nav className="site-nav" aria-label={copy.nav.main}>
          <Link href={localePath(locale, '/playground')}>{copy.nav.playground}</Link>
          <Link href={`${home}#skills`}>{copy.nav.skills}</Link>
          <Link href={`${home}#spec`}>{copy.nav.spec}</Link>
          <a href={SITE.repoUrl}>{copy.nav.github}</a>
          <Link
            href={localePath(other, path)}
            hrefLang={other}
            lang={other}
            aria-label={copy.nav.otherLanguageLabel}
          >
            {copy.nav.otherLanguage}
          </Link>
          <Link
            href={localePath(locale, '/playground#live')}
            className={tone === 'ultramar' ? 'btn btn--white' : 'btn btn--primary'}
          >
            {copy.nav.start}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const copy = useCopy();
  const locale = useLocale();
  const home = localePath(locale, '/');
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__row">
        <Logo tone="on-light" size={24} />
        <nav aria-label={copy.nav.footer}>
          <Link href={localePath(locale, '/playground')}>{copy.nav.playground}</Link>
          <Link href={`${home}#skills`}>{copy.nav.skills}</Link>
          <Link href={`${home}#spec`}>{copy.nav.spec}</Link>
          <a href={SITE.repoUrl}>{copy.nav.github}</a>
          <MotionToggle />
        </nav>
        <p className="site-footer__by">{copy.footer.by}</p>
      </div>
    </footer>
  );
}
