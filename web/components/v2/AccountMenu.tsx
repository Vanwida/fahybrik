'use client';

// AccountMenu — the coach identity control in the top utility bar. The avatar +
// first name is the universal "my account" affordance; clicking it opens a small
// right-aligned dropdown with the full identity (name + email) and a link to
// Ajustes (the editable profile). This is the natural place a coach looks for
// their profile/settings — the sidebar gear is a secondary path. Click-outside +
// Escape + aria, matching the v2 FilterDropdown interaction pattern.

import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { cn } from '@/lib/utils';

const AJUSTES_HREF = '/ajustes';
const CLUB_HREF = '/club';

export function AccountMenu({
  coach_name,
  coach_email,
  coach_avatar_url,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const firstName = coach_name.split(/\s+/)[0] ?? coach_name;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Mi cuenta"
        className={cn(
          'v2-focus flex items-center gap-2 rounded-[var(--v2-r-pill)] py-1 pl-2 pr-1 transition-colors',
          open
            ? 'bg-[color:var(--v2-elevated)]'
            : 'hover:bg-[color:var(--v2-elevated)]',
        )}
      >
        <span className="text-xs font-semibold text-[color:var(--v2-muted)]">{firstName}</span>
        <AthleteAvatar name={coach_name} imageUrl={coach_avatar_url} size="sm" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Mi cuenta"
          className={cn(
            'absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-[var(--v2-r-m)]',
            'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
          )}
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 border-b border-[color:var(--v2-border)] p-3">
            <AthleteAvatar name={coach_name} imageUrl={coach_avatar_url} size="md" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                {coach_name}
              </span>
              <span className="truncate text-xs text-[color:var(--v2-muted)]">{coach_email}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1">
            <Link
              href={CLUB_HREF}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                'v2-focus flex items-center gap-3 rounded-[var(--v2-r-s)] px-3 py-2 text-sm transition-colors',
                'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              <MIcon name="storefront" size={18} aria-hidden />
              <span className="font-medium">Tu club</span>
            </Link>
            <Link
              href={AJUSTES_HREF}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                'v2-focus flex items-center gap-3 rounded-[var(--v2-r-s)] px-3 py-2 text-sm transition-colors',
                'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              <MIcon name="settings" size={18} aria-hidden />
              <span className="font-medium">Ajustes y perfil</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
