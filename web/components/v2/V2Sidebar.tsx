'use client';

// V2Sidebar — the new IA rail. Collapsed icon rail (w-20) that expands on hover/
// focus to reveal labels (w-64), mirroring the v1 sidebar interaction but fully
// scoped to v2 tokens. Active state fills with the accent. Mensajes carries the
// unread badge. Ajustes pins to the bottom.

import { Link, usePathname } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { V2_NAV_ITEMS, V2_NAV_SETTINGS, isV2NavActive } from '@/components/v2/nav';
import { cn } from '@/lib/utils';

/**
 * FAHYBRID brand mark — a pointy-top hexagon glyph carrying an italic "F" cut from
 * the fill (the Fabrik black-on-orange wordmark relationship). Pure inline SVG so
 * it scales crisply and reads as a real brand mark, not a generic icon tile. The
 * hexagon nods to the modular/HYROX grid; the orange is the one brand constant.
 */
function HexMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-hidden
      className={className}
      fill="none"
    >
      {/* Pointy-top hexagon filled with brand orange (regular, centered, rounded
          vertices). Width 26 across, inset 3px each side. */}
      <path
        d="M16 2.31l11.85 6.84a1.6 1.6 0 0 1 .8 1.39v13.68a1.6 1.6 0 0 1-.8 1.39L16 29.69a1.6 1.6 0 0 1-1.6 0L2.55 23.61a1.6 1.6 0 0 1-.8-1.39V8.54a1.6 1.6 0 0 1 .8-1.39L14.4 2.31a1.6 1.6 0 0 1 1.6 0Z"
        fill="var(--v2-accent)"
      />
      {/* Italic "F" cut in accent-foreground (black-on-orange wordmark relationship). */}
      <path
        d="M21.4 9.6l-.55 2.62h-6.06l-.62 2.96h5.2l-.52 2.5h-5.2l-1.13 5.42h-3.1L11.9 9.6h9.5Z"
        fill="var(--v2-accent-fg)"
      />
    </svg>
  );
}

export function V2Sidebar({ unread_messages = 0 }: { unread_messages?: number }) {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    cn(
      'group/nav relative flex h-11 items-center gap-4 rounded-[var(--v2-r-s)] px-3 whitespace-nowrap transition-colors v2-focus',
      active
        ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
        : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-elevated)] hover:text-[color:var(--v2-fg)]',
    );
  const labelClass =
    'font-bold text-[12px] uppercase tracking-wide opacity-0 transition-opacity duration-300 group-hover/v2sidebar:opacity-100 group-focus-within/v2sidebar:opacity-100';

  return (
    <aside
      className={cn(
        'group/v2sidebar fixed inset-y-0 left-0 z-20 hidden lg:flex',
        'w-20 hover:w-64 focus-within:w-64',
        'flex-col gap-4 overflow-hidden',
        'border-r border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
        'transition-[width] duration-300 ease-out',
      )}
    >
      {/* Logo / brand — hexagon mark + italic-bold FAHYBRID wordmark */}
      <Link
        href="/v2/hoy"
        aria-label="FAHYBRID"
        title="FAHYBRID"
        className="flex h-16 shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] px-5 v2-focus"
      >
        <HexMark className="h-9 w-9 shrink-0" />
        <span className="v2-display whitespace-nowrap text-[1.6rem] tracking-[-0.02em] opacity-0 transition-opacity duration-300 group-hover/v2sidebar:opacity-100 group-focus-within/v2sidebar:opacity-100">
          <span className="text-[color:var(--v2-fg)]">FA</span>
          <span className="text-[color:var(--v2-accent)]">HYBRID</span>
        </span>
      </Link>

      {/* Primary nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {V2_NAV_ITEMS.map(({ href, label, icon, badge }) => {
          const active = isV2NavActive(pathname, href);
          const showBadge = badge === 'mensajes' && unread_messages > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={linkClass(active)}
            >
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <MIcon name={icon} filled={active} size={22} />
                {showBadge ? (
                  <span
                    className="absolute -right-2 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[8px] font-bold"
                    style={{ background: 'var(--v2-accent)', color: 'var(--v2-accent-fg)' }}
                  >
                    {unread_messages > 9 ? '9+' : unread_messages}
                  </span>
                ) : null}
              </span>
              <span className={labelClass}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Ajustes — pinned bottom */}
      <div className="mt-auto border-t border-[color:var(--v2-border)] px-3 py-3">
        {(() => {
          const active = isV2NavActive(pathname, V2_NAV_SETTINGS.href);
          return (
            <Link
              href={V2_NAV_SETTINGS.href}
              aria-label={V2_NAV_SETTINGS.label}
              aria-current={active ? 'page' : undefined}
              className={linkClass(active)}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <MIcon name={V2_NAV_SETTINGS.icon} filled={active} size={22} />
              </span>
              <span className={labelClass}>{V2_NAV_SETTINGS.label}</span>
            </Link>
          );
        })()}
      </div>
    </aside>
  );
}
