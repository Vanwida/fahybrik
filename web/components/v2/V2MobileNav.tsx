'use client';

// La navegación del móvil (< lg): barra de pestañas fija — Hoy · Atletas ·
// Mensajes · Programar · Más — y la hoja «Más» con Negocio (si lo tiene), Ajustes,
// Ayuda, el tema, la cuenta y Cerrar sesión. Objetivos de 44 px, zona segura,
// scroll bloqueado detrás de la hoja, Esc cierra, cerrar al navegar.
// Los datos son los mismos que la barra lateral (components/v2/nav.ts).

import { useEffect, useState } from 'react';
import { ChevronRight, CircleHelp, LogOut, Moon, MoreHorizontal, Store, UserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Avatar, Button, Switch } from '@/components/v2/ui';
import { useV2Theme } from '@/components/v2/theme/V2ThemeProvider';
import { useSignOut } from '@/components/v2/AccountMenu';
import {
  GUIA_HREF,
  MOBILE_TAB_KEYS,
  NAV_SETTINGS,
  badgeLabel,
  isNavActive,
  visibleNavItems,
  type NavItem,
} from '@/components/v2/nav';
import type { ShellCounts } from '@/components/v2/V2Sidebar';
import { cn } from '@/lib/utils';

function CountPill({ count, className }: { count: number | null; className?: string }) {
  const label = badgeLabel(count);
  if (!label) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-v2-fg px-1 t-meta font-semibold leading-none text-v2-bg t-tnum',
        className,
      )}
    >
      {label}
    </span>
  );
}

function SheetLink({ href, label, icon: Icon, count, active, onNavigate }: {
  href: string;
  label: string;
  icon: NavItem['icon'];
  count?: number | null;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-ctl px-3 t-body outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]',
        active ? 'bg-v2-select font-semibold text-v2-select-fg' : 'text-v2-fg active:bg-v2-hover',
      )}
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-v2-muted" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <CountPill count={count ?? null} />
      <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-v2-faint" />
    </Link>
  );
}

export function V2MobileNav({
  coach_name,
  coach_email,
  coach_avatar_url,
  counts,
  negocio,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  counts: ShellCounts;
  negocio: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useV2Theme();
  const { signOut, signingOut } = useSignOut();

  const items = visibleNavItems({ negocio });
  const tabs = items.filter((i) => MOBILE_TAB_KEYS.includes(i.key));
  const negocioItem = items.find((i) => i.key === 'negocio') ?? null;
  const sheetHrefs = [negocioItem?.href, NAV_SETTINGS.href, GUIA_HREF].filter(Boolean) as string[];
  const masActive = sheetHrefs.some((href) => isNavActive(pathname, href));

  // Cerrar la hoja al navegar (ajuste durante el render, como indica React).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const tabCls = (active: boolean) =>
    cn(
      'relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-ctl px-1 t-meta outline-none',
      'focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]',
      active ? 'font-semibold text-v2-fg' : 'font-medium text-v2-muted',
    );

  return (
    <div className="lg:hidden">
      {open ? (
        <div aria-hidden onClick={close} className="fixed inset-0 z-30 bg-v2-scrim" />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col overflow-y-auto',
          'rounded-t-panel border-t border-v2-border bg-v2-elevated shadow-pop',
          'px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]',
          'transition-transform duration-[var(--v2-dur)] ease-[var(--v2-ease)] motion-reduce:transition-none',
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
      >
        <span aria-hidden className="mx-auto mb-2 h-1 w-9 shrink-0 rounded-full bg-v2-border-strong" />
        <nav aria-label="Más secciones" className="flex flex-col">
          {negocioItem ? (
            <SheetLink
              href={negocioItem.href}
              label={negocioItem.label}
              icon={negocioItem.icon}
              count={counts.negocio}
              active={isNavActive(pathname, negocioItem.href)}
              onNavigate={close}
            />
          ) : null}
          <SheetLink href={NAV_SETTINGS.href} label={NAV_SETTINGS.label} icon={NAV_SETTINGS.icon} active={isNavActive(pathname, NAV_SETTINGS.href)} onNavigate={close} />
          <SheetLink href={GUIA_HREF} label="Ayuda" icon={CircleHelp} active={isNavActive(pathname, GUIA_HREF)} onNavigate={close} />
          <div className="flex min-h-12 items-center gap-3 rounded-ctl px-3 t-body text-v2-fg">
            <Moon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-v2-muted" />
            <span className="min-w-0 flex-1">Tema oscuro</span>
            <Switch aria-label="Tema oscuro" checked={theme === 'dark'} onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')} />
          </div>
        </nav>

        <div className="mt-2 flex flex-col border-t border-v2-border pt-3">
          <div className="flex items-center gap-3 px-3 pb-2">
            <Avatar name={coach_name} src={coach_avatar_url} size="xl" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate t-body font-semibold text-v2-fg">{coach_name}</span>
              <span className="truncate t-meta text-v2-muted">{coach_email}</span>
            </div>
          </div>
          <SheetLink href="/ajustes/perfil" label="Tu perfil" icon={UserRound} active={false} onNavigate={close} />
          <SheetLink href="/ajustes/club" label="Tu club" icon={Store} active={false} onNavigate={close} />
          <Button variant="ghost" size="lg" icon={LogOut} loading={signingOut} onClick={signOut} className="mt-1 h-12 justify-start px-3 text-v2-fg">
            Cerrar sesión
          </Button>
        </div>
      </div>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-v2-border bg-v2-surface px-1 pt-1 pb-[calc(4px+env(safe-area-inset-bottom))]"
      >
        {tabs.map((item) => {
          const active = isNavActive(pathname, item.href) && !open;
          const Icon = item.icon;
          const badge = item.badge ? counts[item.badge] : null;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              aria-label={badgeLabel(badge) ? `${item.label}, ${badgeLabel(badge)}` : item.label}
              className={tabCls(active)}
            >
              <span className="relative flex size-6 items-center justify-center">
                <Icon aria-hidden strokeWidth={active ? 2.1 : 1.75} className="size-[22px]" />
                <CountPill count={badge} className="absolute -right-3 -top-1.5" />
              </span>
              {item.label}
              {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-v2-select-bar" /> : null}
            </Link>
          );
        })}
        <Button
          variant="ghost"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(tabCls(open || masActive), 'h-auto border-0 hover:bg-transparent')}
        >
          <span className="relative flex size-6 items-center justify-center">
            <MoreHorizontal aria-hidden strokeWidth={open || masActive ? 2.1 : 1.75} className="!size-[22px]" />
            {negocioItem && !open ? <CountPill count={counts.negocio} className="absolute -right-3 -top-1.5" /> : null}
          </span>
          Más
          {open || masActive ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-v2-select-bar" /> : null}
        </Button>
      </nav>
    </div>
  );
}
