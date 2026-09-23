// Lo estático del ⌘K: las pantallas («Ir a») y las acciones. Los datos (atletas,
// programas, grupos, biblioteca) llegan de /api/coach/search; esto vive en el
// cliente y se filtra aquí, sin tildes ni mayúsculas y por palabras, igual que
// la búsqueda del servidor.
//
// `keywords` no se enseñan: son las palabras con las que un coach busca una
// pantalla («cupo», «color», «umbrales»), incluidas las de antes del rediseño.

import { GUIA_HREF } from '@/components/v2/nav';

export interface ScreenEntry {
  id: string;
  label: string;
  /** Sección a la que pertenece, a la derecha («Programar», «Ajustes»). */
  section: string | null;
  href: string;
  keywords: string;
  requires?: 'negocio';
}

export const SCREENS: readonly ScreenEntry[] = [
  { id: 'hoy', label: 'Hoy', section: null, href: '/hoy', keywords: 'inicio bandeja pendientes avisos' },
  { id: 'altas', label: 'Altas pendientes', section: 'Hoy', href: '/hoy?vista=altas', keywords: 'alta cuestionario de entrada nuevos intake' },
  { id: 'atletas', label: 'Atletas', section: null, href: '/atletas', keywords: 'roster lista clientes tabla' },
  { id: 'mensajes', label: 'Mensajes', section: null, href: '/mensajes', keywords: 'chat conversaciones por responder' },
  { id: 'programas', label: 'Programas', section: 'Programar', href: '/programar/programas', keywords: 'programar microciclos plan semanas' },
  { id: 'biblioteca', label: 'Biblioteca', section: 'Programar', href: '/programar/biblioteca', keywords: 'entrenos bloques ejercicios sesiones plantillas' },
  { id: 'grupos', label: 'Grupos', section: 'Programar', href: '/programar/grupos', keywords: 'periodizacion niveles secuencia cadena' },
  { id: 'tests', label: 'Tests', section: 'Programar', href: '/programar/tests', keywords: 'bateria calibracion marcas' },
  { id: 'leads', label: 'Leads', section: 'Negocio', href: '/negocio/leads', keywords: 'interesados captacion llamadas', requires: 'negocio' },
  { id: 'cobros', label: 'Cobros', section: 'Negocio', href: '/negocio/cobros', keywords: 'pagos vencidos suscripciones stripe mrr', requires: 'negocio' },
  { id: 'embudo', label: 'Embudo', section: 'Negocio', href: '/negocio/embudo', keywords: 'metricas funnel conversion', requires: 'negocio' },
  { id: 'perfil', label: 'Tu perfil', section: 'Ajustes', href: '/ajustes/perfil', keywords: 'nombre foto bio certificaciones cuenta' },
  { id: 'club', label: 'Tu club', section: 'Ajustes', href: '/ajustes/club', keywords: 'logo color marca nombre del club box direccion' },
  { id: 'metodo', label: 'Método', section: 'Ajustes', href: '/ajustes/metodo', keywords: 'como entrenas umbrales avisos readiness marcadores' },
  { id: 'plan', label: 'Plan del atleta', section: 'Ajustes', href: '/ajustes/plan', keywords: 'publicar automaticamente visibilidad semanas' },
  { id: 'agenda', label: 'Agenda y cupo', section: 'Ajustes', href: '/ajustes/agenda', keywords: 'disponibilidad franjas llamadas cupo plazas' },
  { id: 'notificaciones', label: 'Notificaciones', section: 'Ajustes', href: '/ajustes/notificaciones', keywords: 'push avisos navegador' },
  { id: 'cuenta', label: 'Cuenta', section: 'Ajustes', href: '/ajustes/cuenta', keywords: 'email cerrar sesion salir' },
  { id: 'guia', label: 'Guía', section: 'Ayuda', href: GUIA_HREF, keywords: 'ayuda manual como funciona' },
];

/** Lo que el ⌘K y «+ Nuevo» saben hacer. El shell decide cómo se ejecuta cada una. */
export type ShellAction =
  | 'invitar_atleta'
  | 'nuevo_entreno'
  | 'nuevo_programa'
  | 'nuevo_grupo'
  | 'asignar_programa'
  | 'enviar_comunicado'
  | 'mensaje_a';

export interface ActionEntry {
  id: ShellAction;
  label: string;
  keywords: string;
  /** Pide elegir un atleta antes (el ⌘K pasa a modo «¿A quién?»). */
  picksAthlete?: boolean;
}

export const ACTIONS: readonly ActionEntry[] = [
  { id: 'invitar_atleta', label: 'Invitar atleta', keywords: 'nuevo atleta alta cliente anadir' },
  { id: 'nuevo_entreno', label: 'Nuevo entreno', keywords: 'crear sesion plantilla biblioteca' },
  { id: 'nuevo_programa', label: 'Nuevo programa', keywords: 'crear microciclo semanas' },
  { id: 'nuevo_grupo', label: 'Nuevo grupo', keywords: 'crear periodizacion nivel' },
  { id: 'asignar_programa', label: 'Asignar programa…', keywords: 'dar programa varios atletas grupo' },
  { id: 'enviar_comunicado', label: 'Enviar comunicado…', keywords: 'publicar comunicado aviso', picksAthlete: true },
  { id: 'mensaje_a', label: 'Mensaje a…', keywords: 'escribir chat responder', picksAthlete: true },
];

/** Minúsculas y sin tildes — la misma normalización que `searchTokens` del servidor. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokensOf(q: string): string[] {
  return normalize(q)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Filtra entradas estáticas por palabras: cada palabra de la consulta tiene que
 * ser el PRINCIPIO de una palabra de la etiqueta, la sección o las palabras clave
 * («mar» encuentra «marca», no «programar»). Orden:
 * la etiqueta empieza por la consulta > una palabra de la etiqueta empieza por
 * ella > coincide por palabras clave; a igualdad, el orden declarado.
 */
export function filterEntries<T extends { label: string; keywords: string; section?: string | null }>(
  entries: readonly T[],
  query: string,
): T[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [...entries];
  const phrase = tokens.join(' ');
  const scored: { entry: T; rank: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const label = normalize(entry.label);
    const words = `${label} ${normalize(entry.section ?? '')} ${normalize(entry.keywords)}`.split(/\s+/);
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) return;
    const rank = label.startsWith(phrase) ? 0 : label.split(/\s+/).some((w) => w.startsWith(tokens[0]!)) ? 1 : 2;
    scored.push({ entry, rank, index });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((s) => s.entry);
}

/** Pantallas visibles para este coach. */
export function visibleScreens(opts: { negocio: boolean }): ScreenEntry[] {
  return SCREENS.filter((s) => s.requires !== 'negocio' || opts.negocio);
}
