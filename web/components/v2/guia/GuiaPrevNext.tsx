// GuiaPrevNext — the prev/next footer at the bottom of every section, derived from
// the single config order. Rendered by the route pages (which already know the
// slug), so section content files stay pure. Server-safe.

import { Link } from '@/i18n/navigation';
import { GUIA_SECTIONS, guiaHref } from './config';

export function GuiaPrevNext({ slug }: { slug: string }) {
  const i = GUIA_SECTIONS.findIndex((s) => s.slug === slug);
  if (i === -1) return null;
  const prev = i > 0 ? GUIA_SECTIONS[i - 1] : null;
  const next = i < GUIA_SECTIONS.length - 1 ? GUIA_SECTIONS[i + 1] : null;

  return (
    <div className="guia-foot">
      {prev ? (
        <Link href={guiaHref(prev.slug)} className="prev">
          <div className="dir">← Anterior</div>
          <div className="ttl">{prev.title}</div>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={guiaHref(next.slug)} className="next">
          <div className="dir">Siguiente →</div>
          <div className="ttl">{next.title}</div>
        </Link>
      ) : null}
    </div>
  );
}
