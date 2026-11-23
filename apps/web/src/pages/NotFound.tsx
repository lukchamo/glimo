import { Glim } from '@glimo/glim';
import { Link } from '../components/ui';
import { localePath, useCopy, useLocale } from '../lib/i18n';

export default function NotFound() {
  const copy = useCopy();
  const locale = useLocale();
  return (
    <main id="main" tabIndex={-1}>
      <div className="wrap page-head" style={{ paddingBottom: 96 }}>
        <Glim state="thinking" size={96} seed="not-found" alt="" />
        <h1 style={{ marginTop: 20 }}>{copy.notFound.title}</h1>
        <p>{copy.notFound.body}</p>
        <p style={{ marginTop: 24 }}>
          <Link className="btn btn--primary" href={localePath(locale, '/')}>
            {copy.notFound.home}
          </Link>
        </p>
      </div>
    </main>
  );
}
