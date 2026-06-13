'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MIcon } from '@/components/dashboard/MIcon';
import { NAV_ITEMS, isNavActive } from '@/lib/dashboard/nav';
import { cn } from '@/lib/utils';

interface CoachSidebarProps {
  /** Total pending items in the Hoy inbox — badge on the Hoy nav entry. */
  pending_inbox_count?: number;
  /** Whether this login also holds the admin role — shows the /admin entry. */
  is_admin?: boolean;
}

/**
 * Sidebar permanente del dashboard coach.
 *
 * Colapsado a `w-20` (80px) con solo iconos centrados.
 * Hover sobre el `<aside>` expande a `w-64` (256px) mostrando labels.
 * El contenido principal NO se desplaza al expandir — el sidebar es `fixed`.
 * Spec: stitch_fahybrid_coach_design_system/fahybrid_lista_de_atletas_nav_fix.
 */
export function CoachSidebar({ pending_inbox_count = 0, is_admin = false }: CoachSidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'group/sidebar fixed inset-y-0 left-0 z-20 hidden lg:flex',
        'w-20 hover:w-64 focus-within:w-64',
        'flex-col gap-4 overflow-hidden',
        'border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]',
        'transition-[width] duration-300 ease-out',
      )}
    >
      {/* Logo */}
      <Link
        href="/hoy"
        aria-label="FAHYBRIK"
        title="FAHYBRIK"
        className="flex h-16 shrink-0 items-center gap-3 border-b border-[color:var(--border-subtle)] px-5"
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)]',
            'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
          )}
        >
          <MIcon name="groups" filled size={22} />
        </span>
        <span
          className={cn(
            'whitespace-nowrap font-display text-2xl italic font-black tracking-tight',
            'opacity-0 transition-opacity duration-300',
            'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
          )}
        >
          <span className="text-[color:var(--accent)]">F</span>
          <span className="text-[color:var(--fg)]">AHYBRIK</span>
        </span>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, labelKey, icon, badgeKey }) => {
          const active = isNavActive(pathname, href);
          const label = t(labelKey);
          const badge = badgeKey === 'inbox' ? pending_inbox_count : undefined;

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group/nav relative flex h-11 items-center gap-4 rounded-[var(--r-sm)] px-3 whitespace-nowrap',
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
              <span
                className={cn(
                  'font-label-bold text-[12px]',
                  'opacity-0 transition-opacity duration-300',
                  'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* CTA: Nuevo atleta — abre el modal de alta en el roster (/atletas). */}
      <div className="px-3">
        <Link
          href="/atletas?nuevo=1"
          className={cn(
            'flex h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] px-3 whitespace-nowrap',
            'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
            'transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)]',
          )}
          aria-label={t('new_athlete')}
        >
          <MIcon name="add" size={18} className="shrink-0" />
          <span
            className={cn(
              'font-label-bold text-[12px] uppercase',
              'opacity-0 transition-opacity duration-300',
              'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
            )}
          >
            {t('new_athlete')}
          </span>
        </Link>
      </div>

      {/* Footer: Ajustes / Ayuda */}
      <div className="mt-auto flex flex-col gap-1 border-t border-[color:var(--border-subtle)] px-3 py-3">
        {/* Admin — solo si el login tiene rol admin (dueño de plataforma). */}
        {is_admin ? (
          <Link
            href="/admin"
            aria-label={t('admin')}
            className={cn(
              'flex h-9 items-center gap-3 rounded-[var(--r-sm)] px-3 whitespace-nowrap text-left transition-colors',
              'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
            )}
          >
            <MIcon name="shield_person" size={18} className="shrink-0" />
            <span
              className={cn(
                'font-label-bold text-[12px]',
                'opacity-0 transition-opacity duration-300',
                'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
              )}
            >
              {t('admin')}
            </span>
          </Link>
        ) : null}

        {/* Ajustes — coaches / equipo. */}
        {(() => {
          const active = isNavActive(pathname, '/ajustes');
          return (
            <Link
              href="/ajustes"
              aria-label={t('settings')}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-3 rounded-[var(--r-sm)] px-3 whitespace-nowrap text-left transition-colors',
                active
                  ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                  : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
              )}
            >
              <MIcon name="settings" filled={active} size={18} className="shrink-0" />
              <span
                className={cn(
                  'font-label-bold text-[12px]',
                  'opacity-0 transition-opacity duration-300',
                  'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
                )}
              >
                {t('settings')}
              </span>
            </Link>
          );
        })()}

        {/* Ayuda — aún sin destino. */}
        <button
          type="button"
          disabled
          aria-label={t('help')}
          title={t('help')}
          className={cn(
            'flex h-9 items-center gap-3 rounded-[var(--r-sm)] px-3 whitespace-nowrap text-left',
            'text-[color:var(--text-muted)]',
            'cursor-not-allowed opacity-60',
          )}
        >
          <MIcon name="help" size={18} className="shrink-0" />
          <span
            className={cn(
              'font-label-bold text-[12px]',
              'opacity-0 transition-opacity duration-300',
              'group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100',
            )}
          >
            {t('help')}
          </span>
        </button>
      </div>
    </aside>
  );
}
