// La navegación del panel del coach — UNA fuente para la barra lateral, la barra
// de pestañas del móvil, los atajos «G …» y el «Ir a» del ⌘K.
//
// Cinco destinos + Ajustes (PLAN-CONSTRUCCION §5, DECISIONS 2026-09-23): Hoy es la
// casa; Negocio solo existe para quien tiene el add-on. Lo que se configura una
// vez vive dentro de Ajustes; la Guía sale de la barra (el «?» de arriba).
// Las rutas son relativas al locale (/hoy); el Link de next-intl pone /es|/en.

import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  CalendarRange,
  Inbox,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react';

export type NavKey = 'hoy' | 'atletas' | 'mensajes' | 'programar' | 'negocio' | 'ajustes';

/** De dónde sale la cifra de un destino (la pone el layout, con dueño). */
export type NavBadge = 'hoy' | 'mensajes' | 'negocio';

export interface NavItem {
  key: NavKey;
  /** Ruta relativa al locale. */
  href: string;
  label: string;
  icon: LucideIcon;
  /** Segunda tecla del atajo «G …» (G H, G A…). */
  go?: string;
  badge?: NavBadge;
  /** Solo se enseña con este add-on contratado. */
  requires?: 'negocio';
}

/** La casa del panel: login, la marca y «Volver» aterrizan aquí. */
export const HOME_HREF = '/hoy';

/** La guía del entrenador — fuera de la barra, detrás del «?». */
export const GUIA_HREF = '/guia';

/** Destinos principales, en orden. Ajustes va aparte, anclado abajo. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'hoy', href: '/hoy', label: 'Hoy', icon: Inbox, go: 'h', badge: 'hoy' },
  { key: 'atletas', href: '/atletas', label: 'Atletas', icon: Users, go: 'a' },
  { key: 'mensajes', href: '/mensajes', label: 'Mensajes', icon: MessageSquare, go: 'm', badge: 'mensajes' },
  { key: 'programar', href: '/programar', label: 'Programar', icon: CalendarRange, go: 'p' },
  { key: 'negocio', href: '/negocio', label: 'Negocio', icon: Briefcase, go: 'n', badge: 'negocio', requires: 'negocio' },
];

export const NAV_SETTINGS: NavItem = { key: 'ajustes', href: '/ajustes', label: 'Ajustes', icon: Settings };

/** Lo que el coach puede ver: Negocio desaparece sin el add-on. */
export function visibleNavItems(opts: { negocio: boolean }): NavItem[] {
  return NAV_ITEMS.filter((item) => item.requires !== 'negocio' || opts.negocio);
}

/** Pestañas del móvil: los cuatro primeros destinos + «Más». */
export const MOBILE_TAB_KEYS: readonly NavKey[] = ['hoy', 'atletas', 'mensajes', 'programar'];

/** Activo cuando la ruta es la del destino o cuelga de ella. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Cifra de una insignia: exacta hasta 99; más allá, «99+». null = sin insignia. */
export function badgeLabel(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

/** Destino de un atajo «G <tecla>». */
export function navForGoKey(key: string, opts: { negocio: boolean }): NavItem | null {
  const k = key.toLowerCase();
  return visibleNavItems(opts).find((item) => item.go === k) ?? null;
}
