// ════════════════════════════════════════════════════════════════════════════
// GUÍA DEL ENTRENADOR — single source of truth for the docs index.
//
// The whole guide is registered ONCE here: the 12 áreas and the 41 secciones — el
// método, el negocio, el ciclo de vida del atleta, los dobles, la carrera y los
// aparatos con los que entrena (todo lo que se construyó en producción estos días).
// Both the sidebar
// (components/v2/guia/GuiaSidebar) and the router (app/[locale]/(v2)/guia/[slug])
// read from this file — nobody edits the sidebar by hand. Each section fills ONE
// file in ./sections; this config already points the sidebar link + the route at it.
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
  | 'seguimiento'
  | 'negocio'
  | 'ciclo-vida'
  | 'dobles'
  | 'herramientas'
  | 'carrera'
  | 'aparatos';

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
  { id: 'negocio', label: 'Tu negocio' },
  { id: 'ciclo-vida', label: 'Ciclo de vida' },
  { id: 'dobles', label: 'Dobles' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'carrera', label: 'Carrera' },
  { id: 'aparatos', label: 'Aparatos y sensores' },
] as const;

/** The 41 sections, in order. `built` ones have real content today. */
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
    built: true,
  },
  // ── Tu biblioteca ───────────────────────────────────────────────────────────
  {
    num: 3,
    area: 'biblioteca',
    slug: 'tu-catalogo-de-ejercicios',
    title: 'Tu catálogo de ejercicios',
    blurb: 'Tus ejercicios con vídeo, listos para usar en cualquier sesión.',
    built: true,
  },
  {
    num: 4,
    area: 'biblioteca',
    slug: 'tus-tipos-de-trabajo',
    title: 'Tus tipos de trabajo',
    blurb: 'Los bloques con los que montas una sesión: carrera, fuerza, circuito, test…',
    built: true,
  },
  {
    num: 5,
    area: 'biblioteca',
    slug: 'tu-metodologia-y-tus-fases',
    title: 'Tu metodología y tus fases',
    blurb: 'El nombre de tus fases es tuyo: tú lo escribes, tu atleta lo lee.',
    built: true,
  },
  // ── El plan ──────────────────────────────────────────────────────────────────
  {
    num: 6,
    area: 'plan',
    slug: 'como-se-estructura-un-plan',
    title: 'Cómo se estructura un plan',
    blurb: 'De la fase a la semana, de la semana al día, del día a la sesión.',
    built: true,
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
    built: true,
  },
  {
    num: 9,
    area: 'plan',
    slug: 'periodizacion-nombrar-fases',
    title: 'Planificación: nombrar fases',
    blurb: 'Nombrar y secuenciar tus fases a lo largo del plan.',
    built: true,
  },
  // ── Asignar y empezar ───────────────────────────────────────────────────────
  {
    num: 10,
    area: 'asignar',
    slug: 'da-de-alta-e-invita',
    title: 'Da de alta e invita',
    blurb: 'De captar al atleta a que reciba la invitación a su app.',
    built: true,
  },
  {
    num: 11,
    area: 'asignar',
    slug: 'cuestionario-inicial-y-tests',
    title: 'Cuestionario inicial y tests',
    blurb: 'Lo que sabes de tu atleta antes de montarle el primer plan.',
    built: true,
  },
  {
    num: 12,
    area: 'asignar',
    slug: 'asigna-el-plan',
    title: 'Asigna el plan: borrador → publicado',
    blurb: 'El paso que hace que el plan aparezca en su móvil.',
    built: true,
  },
  // ── El día a día ─────────────────────────────────────────────────────────────
  {
    num: 13,
    area: 'dia-a-dia',
    slug: 'tu-pantalla-hoy',
    title: 'Tu pantalla /hoy',
    blurb: 'Tu cola de decisiones del día: a quién atender primero.',
    built: true,
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
    built: true,
  },
  // ── Seguimiento ──────────────────────────────────────────────────────────────
  {
    num: 16,
    area: 'seguimiento',
    slug: 'readiness-y-checkin',
    title: 'Readiness y check-in',
    blurb: 'El check-in de la mañana y cómo llega tu atleta a la sesión.',
    built: true,
  },
  {
    num: 17,
    area: 'seguimiento',
    slug: 'adherencia-y-constancia',
    title: 'Adherencia y constancia',
    blurb: 'La constancia de tu atleta, semana a semana.',
    built: true,
  },
  {
    num: 18,
    area: 'seguimiento',
    slug: 'carreras-y-objetivos',
    title: 'Carreras y objetivos',
    blurb: 'La próxima carrera y los objetivos que ordenan el plan.',
    built: true,
  },
  {
    num: 19,
    area: 'seguimiento',
    slug: 'progreso-y-rendimiento',
    title: 'Progreso y rendimiento',
    blurb: 'La evolución de marcas y tests, y la pestaña Rendimiento con «Evaluar semana».',
    built: true,
  },
  {
    num: 38,
    area: 'seguimiento',
    slug: 'historial-del-atleta',
    title: 'Historial del atleta',
    blurb: 'El calendario del atleta en su app: cada día abre la sesión entera, con tiempos reales, splits y ruta.',
    built: true,
  },
  // ── Tu negocio ───────────────────────────────────────────────────────────────
  {
    num: 20,
    area: 'negocio',
    slug: 'leads-tu-embudo',
    title: 'Leads: tu embudo de entrada',
    blurb: 'Cada visita que deja su email entra aquí como lead, con su estado y su objetivo.',
    built: true,
  },
  {
    num: 21,
    area: 'negocio',
    slug: 'la-videollamada',
    title: 'La videollamada con tu lead',
    blurb: 'Reserva con hueco, Google Meet automático y recordatorios — sin ida y vuelta.',
    built: true,
  },
  {
    num: 22,
    area: 'negocio',
    slug: 'nurturing-de-leads',
    title: 'Recupera leads fríos',
    blurb: 'Los leads que se estancan se reenganchan solos por email, sin que muevas un dedo.',
    built: true,
  },
  {
    num: 23,
    area: 'negocio',
    slug: 'cupo-y-lista-de-espera',
    title: 'Cupo y lista de espera',
    blurb: 'Tu grupo tiene un tope; cuando se llena, los nuevos esperan turno por orden.',
    built: true,
  },
  {
    num: 24,
    area: 'negocio',
    slug: 'pagos',
    title: 'Pagos: cobro por Stripe',
    blurb: 'El precio nace en el alta y el pago activa el acceso. Ves estados reales y tu MRR.',
    built: true,
  },
  {
    num: 25,
    area: 'negocio',
    slug: 'metricas-del-funnel',
    title: 'Métricas del funnel',
    blurb: 'De la visita al alta: dónde entra la gente y dónde se cae, semana a semana.',
    built: true,
  },
  // ── Ciclo de vida del atleta ─────────────────────────────────────────────────
  {
    num: 26,
    area: 'ciclo-vida',
    slug: 'pausas-y-bajas',
    title: 'Pausas y bajas',
    blurb: 'Congela el plan sin penalizar la adherencia; da de baja conservando el historial.',
    built: true,
  },
  {
    num: 27,
    area: 'ciclo-vida',
    slug: 'lesiones',
    title: 'Lesiones',
    blurb: 'Registra una lesión, adáptale el plan y velo de un vistazo en tu roster.',
    built: true,
  },
  {
    num: 28,
    area: 'ciclo-vida',
    slug: 'revision-1a1',
    title: 'Revisión 1:1 recurrente',
    blurb: 'Un repaso periódico con tu atleta: tú propones, él elige hueco, se agenda solo.',
    built: true,
  },
  // ── Dobles ───────────────────────────────────────────────────────────────────
  {
    num: 29,
    area: 'dobles',
    slug: 'entrenar-en-dobles',
    title: 'Entrenar en dobles',
    blurb: 'Dos atletas, una pareja: sesión conjunta, reparto de estaciones y modo espejo.',
    built: true,
  },
  {
    num: 37,
    area: 'dobles',
    slug: 'dobles-en-vivo-y-juntos',
    title: 'Dobles en pareja: en vivo y juntos',
    blurb: 'Uno entrena y el otro lo ve en vivo, el relevo dirigido en la simulación, y el resumen juntos al acabar.',
    built: true,
  },
  // ── Herramientas ─────────────────────────────────────────────────────────────
  {
    num: 30,
    area: 'herramientas',
    slug: 'importador-de-entrenos',
    title: 'Importar entrenos del Excel',
    blurb: 'Rellena un ciclo desde tu Excel: por rango, tipado, y tú eliges qué días entran.',
    built: true,
  },
  {
    num: 31,
    area: 'herramientas',
    slug: 'objetivo-y-prediccion',
    title: 'Objetivo y predicción',
    blurb: 'El tiempo meta repartido en los 10 tramos de HYROX: presupuesto, predicho y el hueco.',
    built: true,
  },
  {
    num: 41,
    area: 'herramientas',
    slug: 'el-conector-con-tu-asistente',
    title: 'El conector con tu asistente',
    blurb:
      'Pregúntale a tu asistente cómo va un atleta, tócale el plan y publica, desde el móvil y en tu idioma.',
    built: true,
  },
  // ── Carrera ──────────────────────────────────────────────────────────────────
  {
    num: 32,
    area: 'carrera',
    slug: 'editor-de-carrera',
    title: 'Editor de carrera',
    blurb: 'Prescribe el rodaje por fases, tramo a tramo, con «Repetir ×N» y un objetivo tipado.',
    built: true,
  },
  {
    num: 33,
    area: 'carrera',
    slug: 'cumplimiento-por-serie',
    title: 'Cumplimiento por serie',
    blurb: 'En la sesión ejecutada, cada tramo prescrito contra hecho con su veredicto y el % en banda.',
    built: true,
  },
  {
    num: 34,
    area: 'carrera',
    slug: 'correr-en-cinta',
    title: 'Correr en cinta',
    blurb: 'El atleta enlaza la app a una cinta compatible y corre con ritmo en vivo contra tu objetivo.',
    built: true,
  },
  {
    num: 35,
    area: 'carrera',
    slug: 'correr-al-aire-libre',
    title: 'Correr al aire libre, en vivo',
    blurb: 'GPS con mapa y traza, ritmo contra objetivo, auto-pausa, Isla Dinámica, avisos de voz y la muñeca.',
    built: true,
  },
  {
    num: 36,
    area: 'carrera',
    slug: 'al-acabar-el-entreno',
    title: 'Al acabar el entreno',
    blurb: 'Récords corriendo con tarjeta compartible, y el feedback que te llega: cómo ha ido y una molestia.',
    built: true,
  },
  // ── Aparatos y sensores ──────────────────────────────────────────────────────
  {
    num: 39,
    area: 'aparatos',
    slug: 'remo-y-ergometros',
    title: 'Remo y ergómetros a fondo',
    blurb: 'Con el PM5 de Concept2 enlazado, cada split entra entero: ritmo /500m, paladas, vatios, drag y calorías.',
    built: true,
  },
  {
    num: 40,
    area: 'aparatos',
    slug: 'zonas-de-pulso',
    title: 'Zonas de pulso personales',
    blurb: 'Sus zonas cuelgan del umbral, no de la FC máxima; sin ancla no hay zonas, y la app lo dice.',
    built: true,
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
