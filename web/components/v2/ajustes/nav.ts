// Las secciones de Ajustes, en el orden de la sub-navegación. Una sola lista
// para el menú de escritorio, la lista del móvil y el ⌘K de quien la quiera.

import {
  Bell,
  CalendarClock,
  CalendarRange,
  CircleUserRound,
  KeyRound,
  SlidersHorizontal,
  Store,
  type LucideIcon,
} from 'lucide-react';

export type AjustesSlug = 'perfil' | 'club' | 'metodo' | 'plan' | 'agenda' | 'notificaciones' | 'cuenta';

export interface AjustesSection {
  slug: AjustesSlug;
  label: string;
  /** Una línea: qué hay dentro (lista del móvil). */
  detail: string;
  icon: LucideIcon;
}

export const AJUSTES_SECTIONS: readonly AjustesSection[] = [
  { slug: 'perfil', label: 'Tu perfil', detail: 'Nombre, foto, bio y titulaciones', icon: CircleUserRound },
  { slug: 'club', label: 'Tu club', detail: 'Nombre, logo, color y dirección', icon: Store },
  { slug: 'metodo', label: 'Método', detail: 'Cómo entrenas, avisos y readiness', icon: SlidersHorizontal },
  { slug: 'plan', label: 'Plan del atleta', detail: 'Qué semanas ve y cuándo se abren', icon: CalendarRange },
  { slug: 'agenda', label: 'Agenda y cupo', detail: 'Horarios de llamada, días libres, plazas', icon: CalendarClock },
  { slug: 'notificaciones', label: 'Notificaciones', detail: 'Avisos en este navegador', icon: Bell },
  { slug: 'cuenta', label: 'Cuenta', detail: 'Correo de acceso y cerrar sesión', icon: KeyRound },
];

export function ajustesHref(slug: AjustesSlug): string {
  return `/ajustes/${slug}`;
}
