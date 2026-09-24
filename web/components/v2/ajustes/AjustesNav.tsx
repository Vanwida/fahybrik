'use client';

// Sub-navegación de Ajustes. Escritorio: columna a la izquierda del panel.
// Móvil: la misma lista a pantalla entera en /ajustes, y cada panel lleva un
// «‹ Ajustes» para volver (se entra y se sale, como en los ajustes del teléfono).

import { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { AJUSTES_SECTIONS, ajustesHref } from './nav';

export function AjustesNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Ajustes" className="flex flex-col gap-0.5">
      <p className="mb-2 px-2.5 t-title text-v2-fg">Ajustes</p>
      {AJUSTES_SECTIONS.map(({ slug, label, icon: Icon }) => {
        const href = ajustesHref(slug);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-8 items-center gap-2.5 rounded-ctl px-2.5 t-body outline-none',
              'transition-colors duration-[var(--v2-dur-fast)] focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
              active ? 'bg-v2-select font-medium text-v2-fg' : 'text-v2-muted hover:bg-v2-hover hover:text-v2-fg',
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * /ajustes en el móvil: la lista para entrar en cada panel. En escritorio la
 * sub-navegación ya está al lado, así que se salta directamente a «Tu perfil».
 */
export function AjustesIndex() {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) router.replace(ajustesHref('perfil'));
  }, [router]);
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <h1 className="t-title text-v2-fg">Ajustes</h1>
      <div role="list" className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
        {AJUSTES_SECTIONS.map(({ slug, label, detail, icon: Icon }) => (
          <div role="listitem" key={slug} className="border-b border-v2-border last:border-b-0">
            <Link
              href={ajustesHref(slug)}
              className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-v2-hover focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]"
            >
              <Icon aria-hidden className="size-5 shrink-0 text-v2-muted" strokeWidth={1.75} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-body font-medium text-v2-fg">{label}</span>
                <span className="truncate t-body-sm text-v2-muted">{detail}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-v2-faint" strokeWidth={1.75} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
