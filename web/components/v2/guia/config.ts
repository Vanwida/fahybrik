// ════════════════════════════════════════════════════════════════════════════
// GUÍA DEL ENTRENADOR — single source of truth for the docs index.
//
// The whole guide is registered ONCE here: the 6 áreas and the 19 secciones from
// the approved prototype. Both the sidebar (components/v2/guia/GuiaSidebar) and
// the router (app/[locale]/(v2)/guia/[slug]/page.tsx) read from this file — nobody
// edits the sidebar by hand. A phase-2 agent fills ONE section file; this config
// already points the sidebar link + the route at it.
//
// Server- and client-safe: pure data, no component imports. The slug→component
// wiring lives separately in ./sections/registry.ts so this stays importable from
// the client sidebar without pulling in every section bundle.
// ════════════════════════════════════════════════════════════════════════════

/** The six areas of the guide, in sidebar render order. */
export type GuiaAreaId =
  | 'empezar'
  | 'biblioteca'
  | 'plan'
  | 'asignar'
  | 'dia-a-dia'
  | 'seguimiento';

export interface GuiaArea {
  id: GuiaAreaId;
  /** Small uppercase group header in the sidebar. */
  label: string;
}

export interface GuiaSection {
  /** 1-based number shown in the sidebar (01…19). */
  num: number;
  area: GuiaAreaId;
  /** URL slug. The first section is served at /guia; the rest at /guia/<slug>. */
  slug: string;
  /** Sidebar + page <h2> title. */
  title: string;
  /** One-line description (used in TOC cards + meta). */
  blurb: string;
  /** True once the section has real content (vs. a stub awaiting phase 2). */
  built?: boolean;
}

/** Areas in render order — mirrors the prototype's sidebar groups. */
export const GUIA_AREAS: readonly GuiaArea[] = [
  { id: 'empezar', label: 'Empezar' },
  { id: 'biblioteca', label: 'Tu biblioteca' },
  { id: 'plan', label: 'El plan' },
  { id: 'asignar', label: 'Asignar y empezar' },
  { id: 'dia-a-dia', label: 'El día a día' },
  { id: 'seguimiento', label: 'Seguimiento' },
] as const;

/** The 19 sections, in order. `built` ones have real content today. */
export const GUIA_SECTIONS: readonly GuiaSection[] = [
  // ── Empezar ───────────────────────────────────────────────────────────────
  {
    num: 1,
    area: 'empezar',
    slug: 'que-es-esta-guia',
    title: 'Qué es esta guía',
    blurb: 'Cómo funciona el panel y por qué tu nombre aparece en la app de tu atleta.',
    built: true,
  },
  {
    num: 2,
    area: 'empezar',
    slug: 'tu-cuenta-y-tu-marca',
    title: 'Tu cuenta y tu marca',
    blurb: 'Tu identidad de entrenador: tu nombre y tu sello en la experiencia del atleta.',
  },
  // ── Tu biblioteca ───────────────────────────────────────────────────────────
  {
    num: 3,
    area: 'biblioteca',
    slug: 'tu-catalogo-de-ejercicios',
    title: 'Tu catálogo de ejercicios',
    blurb: 'Tus ejercicios con vídeo, listos para usar en cualquier sesión.',
  },
  {
    num: 4,
    area: 'biblioteca',
    slug: 'tus-tipos-de-trabajo',
    title: 'Tus tipos de trabajo',
    blurb: 'Los bloques con los que montas una sesión: carrera, fuerza, circuito, test…',
  },
  {
    num: 5,
    area: 'biblioteca',
    slug: 'tu-metodologia-y-tus-fases',
    title: 'Tu metodología y tus fases',
    blurb: 'El nombre de tus fases es tuyo: tú lo escribes, tu atleta lo lee.',
  },
  // ── El plan ──────────────────────────────────────────────────────────────────
  {
    num: 6,
    area: 'plan',
    slug: 'como-se-estructura-un-plan',
    title: 'Cómo se estructura un plan',
    blurb: 'De la fase a la semana, de la semana al día, del día a la sesión.',
  },
  {
    num: 7,
    area: 'plan',
    slug: 'monta-la-semana',
    title: 'Monta la semana de tu atleta',
    blurb: 'Foco, sesiones por día, carga e intensidad y el guardado honesto.',
    built: true,
  },
  {
    num: 8,
    area: 'plan',
    slug: 'carga-e-intensidad',
    title: 'Carga e intensidad de cada ejercicio',
    blurb: 'Cómo se mide el trabajo y contra qué objetivo en cada modalidad.',
  },
  {
    num: 9,
    area: 'plan',
    slug: 'periodizacion-nombrar-fases',
    title: 'Periodización: nombrar fases',
    blurb: 'Nombrar y secuenciar tus fases a lo largo del plan.',
  },
  // ── Asignar y empezar ───────────────────────────────────────────────────────
  {
    num: 10,
    area: 'asignar',
    slug: 'da-de-alta-e-invita',
    title: 'Da de alta e invita',
    blurb: 'De captar al atleta a que reciba la invitación a su app.',
  },
  {
    num: 11,
    area: 'asignar',
    slug: 'cuestionario-inicial-y-tests',
    title: 'Cuestionario inicial y tests',
    blurb: 'Lo que sabes de tu atleta antes de montarle el primer plan.',
  },
  {
    num: 12,
    area: 'asignar',
    slug: 'asigna-el-plan',
    title: 'Asigna el plan: borrador → publicado',
    blurb: 'El paso que hace que el plan aparezca en su móvil.',
  },
  // ── El día a día ─────────────────────────────────────────────────────────────
  {
    num: 13,
    area: 'dia-a-dia',
    slug: 'tu-pantalla-hoy',
    title: 'Tu pantalla /hoy',
    blurb: 'Tu cola de decisiones del día: a quién atender primero.',
  },
  {
    num: 14,
    area: 'dia-a-dia',
    slug: 'estado-de-cada-entreno',
    title: 'El estado de cada entreno',
    blurb: 'El círculo marcar → ver: adherencia, estados y la cola /hoy.',
    built: true,
  },
  {
    num: 15,
    area: 'dia-a-dia',
    slug: 'habla-con-tu-atleta',
    title: 'Habla con tu atleta',
    blurb: 'El chat con tu atleta, con notas de voz.',
  },
  // ── Seguimiento ──────────────────────────────────────────────────────────────
  {
    num: 16,
    area: 'seguimiento',
    slug: 'readiness-y-checkin',
    title: 'Readiness y check-in',
    blurb: 'El check-in de la mañana y cómo llega tu atleta a la sesión.',
  },
  {
    num: 17,
    area: 'seguimiento',
    slug: 'adherencia-y-constancia',
    title: 'Adherencia y constancia',
    blurb: 'La constancia de tu atleta, semana a semana.',
  },
  {
    num: 18,
    area: 'seguimiento',
    slug: 'carreras-y-objetivos',
    title: 'Carreras y objetivos',
    blurb: 'La próxima carrera y los objetivos que ordenan el plan.',
  },
  {
    num: 19,
    area: 'seguimiento',
    slug: 'progreso-y-rendimiento',
    title: 'Progreso y rendimiento',
    blurb: 'La evolución de marcas y tests a lo largo del tiempo.',
  },
] as const;

/** The first section is served at the bare /guia route (no trailing slug). */
export const GUIA_FIRST_SLUG = GUIA_SECTIONS[0].slug;

/** Locale-relative href for a section. First section → /guia, rest → /guia/<slug>. */
export function guiaHref(slug: string): string {
  return slug === GUIA_FIRST_SLUG ? '/guia' : `/guia/${slug}`;
}

/** Human label for an area id. */
export function guiaAreaLabel(area: GuiaAreaId): string {
  return GUIA_AREAS.find((a) => a.id === area)?.label ?? '';
}

/** Sections belonging to an area, in declaration order. */
export function guiaSectionsForArea(area: GuiaAreaId): GuiaSection[] {
  return GUIA_SECTIONS.filter((s) => s.area === area);
}

/** Look a section up by slug. */
export function findGuiaSection(slug: string): GuiaSection | undefined {
  return GUIA_SECTIONS.find((s) => s.slug === slug);
}
