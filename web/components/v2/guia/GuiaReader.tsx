'use client';

// La guía como lector: una barra fina con «Guía › área» y el botón «Índice»,
// y el artículo en una columna de lectura. El índice es un panel que se abre
// (con buscador), no una segunda barra lateral junto a la del panel, y en el
// móvil no empuja el artículo 2.000 px hacia abajo.

import { useMemo, useState, type ReactNode } from 'react';
import { List as ListIcon, Search } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Button, Input, Sheet } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { GUIA_AREAS, GUIA_SECTIONS, guiaAreaLabel, guiaHref } from './config';

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function GuiaReader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = GUIA_SECTIONS.find((s) => guiaHref(s.slug) === pathname) ?? GUIA_SECTIONS[0]!;

  const groups = useMemo(() => {
    const needle = norm(q.trim());
    return GUIA_AREAS.map((a) => ({
      area: a,
      sections: GUIA_SECTIONS.filter(
        (s) => s.area === a.id && (!needle || norm(`${s.title} ${s.blurb}`).includes(needle)),
      ),
    })).filter((g) => g.sections.length > 0);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-[5] -mx-4 flex items-center justify-between gap-3 border-b border-v2-border bg-v2-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <nav aria-label="Estás en" className="flex min-w-0 items-center gap-1.5 t-body-sm text-v2-muted">
          <Link href="/guia" className="shrink-0 hover:text-v2-fg">
            Guía
          </Link>
          <span aria-hidden>›</span>
          <span className="truncate">{guiaAreaLabel(current.area)}</span>
        </nav>
        <Button size="sm" icon={ListIcon} onClick={() => setOpen(true)}>
          Índice
        </Button>
      </div>

      <article className="guia-doc w-full pb-16">{children}</article>

      <Sheet open={open} onOpenChange={setOpen} title="Índice de la guía" size="md">
        <div className="flex flex-col gap-4">
          <Input
            type="search"
            icon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en la guía"
            aria-label="Buscar en la guía"
          />
          {groups.length === 0 ? <p className="t-body-sm text-v2-faint">Nada con «{q}».</p> : null}
          {groups.map(({ area, sections }) => (
            <div key={area.id} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 t-label text-v2-faint">{area.label}</p>
              {sections.map((s) => {
                const active = s.slug === current.slug;
                return (
                  <Link
                    key={s.slug}
                    href={guiaHref(s.slug)}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-9 items-baseline gap-2.5 rounded-ctl px-2 py-1.5 t-body outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
                      active ? 'bg-v2-select font-medium text-v2-fg' : 'text-v2-muted hover:bg-v2-hover hover:text-v2-fg',
                    )}
                  >
                    <span className="w-5 shrink-0 text-right t-meta text-v2-faint t-tnum">{s.num}</span>
                    {s.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
