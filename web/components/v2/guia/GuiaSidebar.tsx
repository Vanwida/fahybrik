'use client';

// GuiaSidebar — the docs index rail. Renders the FULL 19-section index grouped by
// área, straight from the single config (components/v2/guia/config). Active state
// tracks the current route. Built sections show an orange dot; the rest show a
// faint "índice" tag so the coach sees the whole map while only some are written.
//
// This sits to the right of the thin global v2 rail (V2Sidebar), so the coach can
// still jump back to Hoy/Atletas while reading the guide.

import { Link, usePathname } from '@/i18n/navigation';
import {
  GUIA_AREAS,
  guiaHref,
  guiaSectionsForArea,
  type GuiaSection,
} from './config';

function SidebarLink({ section, active }: { section: GuiaSection; active: boolean }) {
  const nn = String(section.num).padStart(2, '0');
  return (
    <Link
      href={guiaHref(section.slug)}
      aria-current={active ? 'page' : undefined}
      className={active ? 'guia-sb-link active' : 'guia-sb-link'}
    >
      <span className="num">{nn}</span>
      <span>{section.title}</span>
      {section.built ? (
        <span className="guia-sb-dot" aria-hidden />
      ) : (
        <span className="guia-sb-soon">índice</span>
      )}
    </Link>
  );
}

export function GuiaSidebar() {
  const pathname = usePathname();

  return (
    <nav className="guia-sidebar" aria-label="Índice de la guía">
      <Link href="/guia" className="guia-sb-brand" aria-label="Guía del entrenador">
        <img src="/brand/fh-icon-300.png" alt="" className="guia-sb-mark" />
        <span className="nm">
          FAHYBRID
          <small>Guía del entrenador</small>
        </span>
      </Link>

      {GUIA_AREAS.map((area) => (
        <div key={area.id}>
          <div className="guia-sb-group">{area.label}</div>
          {guiaSectionsForArea(area.id).map((section) => (
            <SidebarLink
              key={section.slug}
              section={section}
              active={pathname === guiaHref(section.slug)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
