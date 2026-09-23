'use client';

// La cuenta del coach en la barra superior: quién eres (nombre + email) y lo que
// se busca aquí por costumbre — Tu perfil, Tu club, Ayuda y Cerrar sesión.

import { useState } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { CircleHelp, LogOut, Store, UserRound } from 'lucide-react';
import { useClerk } from '@clerk/nextjs';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/v2/ui';
import { OVERLAY_Z, usePanelPortal } from '@/components/v2/ui/portal';
import { OPTION_ROW, POPUP_SURFACE } from '@/components/v2/ui/styles';
import { GUIA_HREF } from '@/components/v2/nav';
import { cn } from '@/lib/utils';

export const ACCOUNT_LINKS = [
  { href: '/ajustes/perfil', label: 'Tu perfil', icon: UserRound },
  { href: '/ajustes/club', label: 'Tu club', icon: Store },
  { href: GUIA_HREF, label: 'Ayuda', icon: CircleHelp },
] as const;

/** Cierra la sesión de Clerk y sale del panel (sin dejar una vista con la sesión ya muerta). */
export function useSignOut(): { signOut: () => void; signingOut: boolean } {
  const clerk = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    clerk
      .signOut()
      .catch(() => undefined)
      .finally(() => {
        window.location.href = '/sign-in';
      });
  };
  return { signOut, signingOut };
}

export function AccountMenu({
  coach_name,
  coach_email,
  coach_avatar_url,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
}) {
  const { anchor, container } = usePanelPortal();
  const { signOut, signingOut } = useSignOut();
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        ref={anchor}
        aria-label={`Tu cuenta: ${coach_name}`}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full outline-none',
          'pointer-coarse:size-11',
          'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)] data-[popup-open]:ring-2 data-[popup-open]:ring-v2-border-strong',
        )}
      >
        <Avatar name={coach_name} src={coach_avatar_url} size="md" />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal container={container}>
        <MenuPrimitive.Positioner side="bottom" align="end" sideOffset={6} className={OVERLAY_Z}>
          <MenuPrimitive.Popup className={cn(POPUP_SURFACE, 'w-64 p-1')}>
            <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-2">
              <Avatar name={coach_name} src={coach_avatar_url} size="lg" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate t-body font-semibold text-v2-fg">{coach_name}</span>
                <span className="truncate t-meta text-v2-muted">{coach_email}</span>
              </div>
            </div>
            <MenuPrimitive.Separator className="my-1 h-px bg-v2-border" />
            {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
              <MenuPrimitive.Item key={href} className={OPTION_ROW} render={<Link href={href} />}>
                <Icon aria-hidden strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </MenuPrimitive.Item>
            ))}
            <MenuPrimitive.Separator className="my-1 h-px bg-v2-border" />
            <MenuPrimitive.Item className={OPTION_ROW} onClick={signOut} disabled={signingOut}>
              <LogOut aria-hidden strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
            </MenuPrimitive.Item>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
