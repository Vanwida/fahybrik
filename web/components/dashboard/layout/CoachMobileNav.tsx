'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MIcon } from '@/components/ui/MIcon';
import { NAV_ITEMS, isNavActive } from '@/lib/dashboard/nav';
import { cn } from '@/lib/utils';

interface CoachMobileNavProps {
  /** Total pending items in the Hoy inbox — badge on the Hoy nav entry. */
  pending_inbox_count?: number;
  /** Whether this login also holds the admin role — shows the /admin entry. */
  is_admin?: boolean;
}

/**
 * Navegación móvil del dashboard coach (<lg).
 *
 * Top-bar fija con logo + botón hamburguesa que abre un drawer lateral con
 * los mismos items que el `CoachSidebar` (Hoy, Atletas, Programar) + Nuevo
 * atleta + Ajustes/Ayuda. La campana de notificaciones desapareció: todo lo
 * accionable vive en el inbox de Hoy (UX redesign §0).
 *
 * En `lg+` el componente entero se oculta y el sidebar fijo toma el relevo.
 */
export function CoachMobileNav({ pending_inbox_count = 0, is_admin = false }: CoachMobileNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Cerrar el drawer al navegar a otra ruta: sincronización legítima al cambio de
  // `pathname`, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape para cerrar + bloqueo de scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Capturar el botón que abrió el drawer AHORA: en el cleanup el ref podría
    // apuntar ya a otro nodo (regla react-hooks/exhaustive-deps sobre refs).
    const trigger = triggerRef.current;
    // Mover el foco al panel para que el contenido sea navegable por teclado.
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Devolver el foco al botón que abrió el drawer.
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Top-bar móvil — solo <lg, el sidebar la sustituye en lg+. */}
      <header
        className={cn(
          'sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 lg:hidden',
          'border-b border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-4',
        )}
      >
        <Link href="/hoy" aria-label="FAHYBRID" className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)]',
              'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
            )}
          >
            <MIcon name="groups" filled size={20} />
          </span>
          <span className="font-display text-xl italic font-black tracking-tight">
            <span className="text-[color:var(--accent)]">F</span>
            <span className="text-[color:var(--fg)]">AHYBRIK</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('mobile_aria')}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-[var(--r-sm)]',
              'text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-high)]',
              'focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]',
            )}
          >
            <MIcon name="menu" size={24} />
          </button>
        </div>
      </header>

      {/* Drawer */}
      {open ? (
        <div role="dialog" aria-modal aria-label={t('mobile_aria')} className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar navegación"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70"
          />

          {/* Panel lateral */}
          <div
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              'absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col outline-none',
              'border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]',
            )}
          >
            {/* Header del panel */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--border-subtle)] px-4">
              <span className="font-display text-xl italic font-black tracking-tight">
                <span className="text-[color:var(--accent)]">F</span>
                <span className="text-[color:var(--fg)]">AHYBRIK</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar navegación"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)]',
                  'text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
                  'focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]',
                )}
              >
                <MIcon name="close" size={22} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label={t('main_aria')}>
              {NAV_ITEMS.map(({ href, labelKey, icon, badgeKey }) => {
                const active = isNavActive(pathname, href);
                const label = t(labelKey);
                const badge = badgeKey === 'inbox' ? pending_inbox_count : undefined;

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-4 rounded-[var(--r-sm)] px-3',
                      'transition-colors',
                      active
                        ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                        : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
                    )}
                  >
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      <MIcon name={icon} filled={active} size={22} />
                      {badge != null && badge > 0 ? (
                        <span className="badge-dot absolute -right-2 -top-1.5 h-[14px] min-w-[14px] text-[8px]">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-label-bold text-[13px]">{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* CTA: Nuevo atleta — abre el modal de alta en el roster (/atletas). */}
            <div className="px-3 pb-2">
              <Link
                href="/atletas?nuevo=1"
                aria-label={t('new_athlete')}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] px-3',
                  'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
                  'transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)]',
                )}
              >
                <MIcon name="add" size={18} className="shrink-0" />
                <span className="font-label-bold text-[12px] uppercase">{t('new_athlete')}</span>
              </Link>
            </div>

            {/* Footer: Admin / Ajustes / Ayuda */}
            <div className="flex flex-col gap-1 border-t border-[color:var(--border-subtle)] px-3 py-3">
              {/* Admin — solo si el login tiene rol admin. */}
              {is_admin ? (
                <Link
                  href="/admin"
                  aria-label={t('admin')}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-[var(--r-sm)] px-3 text-left transition-colors',
                    'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
                  )}
                >
                  <MIcon name="shield_person" size={18} className="shrink-0" />
                  <span className="font-label-bold text-[12px]">{t('admin')}</span>
                </Link>
              ) : null}

              {/* Ajustes — coaches / equipo. */}
              <Link
                href="/ajustes"
                aria-label={t('settings')}
                aria-current={isNavActive(pathname, '/ajustes') ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-[var(--r-sm)] px-3 text-left transition-colors',
                  isNavActive(pathname, '/ajustes')
                    ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                    : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
                )}
              >
                <MIcon name="settings" filled={isNavActive(pathname, '/ajustes')} size={18} className="shrink-0" />
                <span className="font-label-bold text-[12px]">{t('settings')}</span>
              </Link>

              {/* Ayuda — aún sin destino. */}
              <button
                type="button"
                disabled
                aria-label={t('help')}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-[var(--r-sm)] px-3 text-left',
                  'text-[color:var(--text-muted)]',
                  'cursor-not-allowed opacity-60',
                )}
              >
                <MIcon name="help" size={18} className="shrink-0" />
                <span className="font-label-bold text-[12px]">{t('help')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
