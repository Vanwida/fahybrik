'use client';

// VersionSwitch — a small "v1 ↔ v2" toggle so the coach can jump between the
// current app and this redesign. Maps the active v2 route to its v1 equivalent
// (e.g. /v2/hoy → /hoy) via V2_TO_V1_ROUTE, falling back to /hoy. Locale is
// handled by the next-intl Link (it prefixes /es|/en automatically).

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** v2 screen → v1 route. Screens with no v1 twin fall back to /hoy. */
const V2_TO_V1_ROUTE: Record<string, string> = {
  hoy: '/hoy',
  atletas: '/atletas',
  biblioteca: '/programar',
  planes: '/programar',
  mensajes: '/hoy',
  ajustes: '/ajustes',
};

function v1HrefFor(pathname: string): string {
  // pathname is locale-stripped by next-intl's usePathname → e.g. "/v2/hoy".
  const m = pathname.match(/^\/v2\/([^/]+)/);
  const screen = m?.[1] ?? 'hoy';
  return V2_TO_V1_ROUTE[screen] ?? '/hoy';
}

export function VersionSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const v1Href = v1HrefFor(pathname);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--v2-r-pill)] p-0.5',
        'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
        className,
      )}
      role="group"
      aria-label="Cambiar de versión"
    >
      <Link
        href={v1Href}
        className={cn(
          'v2-focus rounded-[var(--v2-r-pill)] px-2.5 py-1 text-[11px] font-bold',
          'text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]',
        )}
      >
        v1
      </Link>
      <span
        aria-current="true"
        className={cn(
          'rounded-[var(--v2-r-pill)] px-2.5 py-1 text-[11px] font-bold',
          'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]',
        )}
      >
        v2
      </span>
    </div>
  );
}
