// ════════════════════════════════════════════════════════════════════════════
// GUÍA DEL ENTRENADOR — el índice, en un solo sitio.
//
// Las áreas siguen la organización del panel (Hoy · Atletas · Mensajes ·
// Programar · Negocio · Ajustes) y, al final, lo que pasa en la app del atleta.
// El número de cada artículo sale de su posición: reordenar no deja huecos.
// El lector (GuiaReader) y las rutas (/guia, /guia/[slug]) leen de aquí; el
// componente de cada artículo vive en ./sections/<slug>.tsx (registry.ts).
//
// Datos puros, sin componentes: se importa también desde el cliente.
// ════════════════════════════════════════════════════════════════════════════

export type GuiaAreaId =
  | 'empezar'
  | 'dia-a-dia'
  | 'programar'
  | 'dar-el-plan'
  | 'seguimiento'
  | 'ciclo-vida'
  | 'dobles'
  | 'negocio'
  | 'app-atleta'
  | 'herramientas';

export interface GuiaArea {
  id: GuiaAreaId;
  label: string;
}

export interface GuiaSection {
  /** Número en el índice (1…n), por posición. */
  num: number;
  area: GuiaAreaId;
  /** La portada vive en /guia; el resto en /guia/<slug>. */
  slug: string;
  title: string;
  /** Una línea: índice, buscador y metadatos. */
  blurb: string;
}

export const GUIA_AREAS: readonly GuiaArea[] = [
  { id: 'empezar', label: 'Empezar' },
  { id: 'dia-a-dia', label: 'El día a día' },
  { id: 'programar', label: 'Programar' },
  { id: 'dar-el-plan', label: 'Dar el plan' },
  { id: 'seguimiento', label: 'Seguimiento' },
  { id: 'ciclo-vida', label: 'Ciclo de vida' },
  { id: 'dobles', label: 'Dobles' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'app-atleta', label: 'En la app del atleta' },
  { id: 'herramientas', label: 'Herramientas' },
] as const;

const SECTIONS = [
  // ── Empezar ───────────────────────────────────────────────────────────────
  {
    area: 'empezar',
    slug: 'que-es-esta-guia',
    title: 'Qué es esta guía',
    blurb: 'Cómo está ordenado el panel: Hoy, Atletas, Mensajes, Programar, Negocio y Ajustes.',
  },
  {
    area: 'empezar',
    slug: 'tu-cuenta-y-tu-marca',
    title: 'Tu perfil, tu club y tu cuenta',
    blurb: 'Ajustes: tu nombre y tu foto, la marca que ve tu atleta, los avisos y los primeros pasos.',
  },
  {
    area: 'empezar',
    slug: 'tu-metodologia-y-tus-fases',
    title: 'Tu método',
    blurb: 'Ajustes › Método: cómo entrenas, cómo clasificas a tus atletas y qué te tiene que avisar.',
  },
  // ── El día a día ──────────────────────────────────────────────────────────
  {
    area: 'dia-a-dia',
    slug: 'tu-pantalla-hoy',
    title: 'Hoy: quién te necesita',
    blurb: 'Una bandeja que tiende a cero: resuelve, pospón o marca hecho, el peor primero.',
  },
  {
    area: 'dia-a-dia',
    slug: 'atletas',
    title: 'Atletas: todos en una tabla',
    blurb: 'Vistas, filtros y acciones sobre varios a la vez: asignar, publicar, escribir, pausar.',
  },
  {
    area: 'dia-a-dia',
    slug: 'habla-con-tu-atleta',
    title: 'Mensajes',
    blurb: 'Los que esperan tu respuesta primero; hecho, posponer y enviar a varios.',
  },
  {
    area: 'dia-a-dia',
    slug: 'ficha-del-atleta',
    title: 'La ficha de un atleta',
    blurb: 'Por qué está marcado, qué hacer ahora y su plan de tres semanas, editable en el sitio.',
  },
  // ── Programar ─────────────────────────────────────────────────────────────
  {
    area: 'programar',
    slug: 'como-se-estructura-un-plan',
    title: 'Cómo se estructura un plan',
    blurb: 'Ejercicio, bloque, entreno, semana, programa y plan: qué es cada cosa y dónde se toca.',
  },
  {
    area: 'programar',
    slug: 'monta-un-programa',
    title: 'Monta un programa',
    blurb: 'Programar › Programas: todas las semanas en una rejilla, la línea rápida y «Progresar».',
  },
  {
    area: 'programar',
    slug: 'biblioteca',
    title: 'Tu biblioteca',
    blurb: 'Entrenos y bloques reutilizables, la cola «Por revisar» y los tipos de trabajo.',
  },
  {
    area: 'programar',
    slug: 'tu-catalogo-de-ejercicios',
    title: 'Tus ejercicios',
    blurb: 'Biblioteca › Ejercicios: los de la base y los tuyos, con tu vídeo y tus claves.',
  },
  {
    area: 'programar',
    slug: 'carga-e-intensidad',
    title: 'Carga e intensidad',
    blurb: 'Cómo se mide el trabajo y contra qué objetivo, en cada modalidad.',
  },
  {
    area: 'programar',
    slug: 'editor-de-carrera',
    title: 'Prescribir una carrera',
    blurb: 'Por fases y tramo a tramo, con «Repetir ×N» y un objetivo en cada tramo.',
  },
  {
    area: 'programar',
    slug: 'importador-de-entrenos',
    title: 'Importar entrenos de tu Excel',
    blurb: 'Rellena un programa desde tu hoja: tú marcas el rango, revisas y eliges qué días entran.',
  },
  {
    area: 'programar',
    slug: 'grupos',
    title: 'Grupos: un plan para muchos',
    blurb: 'Programar › Grupos: atletas que comparten plan, una cadena de programas en orden.',
  },
  {
    area: 'programar',
    slug: 'tests',
    title: 'Tests',
    blurb: 'Programar › Tests: tu batería, aplicarla a varios y de dónde salen sus zonas y máximos.',
  },
  // ── Dar el plan ───────────────────────────────────────────────────────────
  {
    area: 'dar-el-plan',
    slug: 'invita-a-tus-atletas',
    title: 'Invita a tus atletas',
    blurb: 'Uno o una lista entera, con su nivel y su grupo; cada uno recibe su enlace.',
  },
  {
    area: 'dar-el-plan',
    slug: 'altas-pendientes',
    title: 'Altas pendientes',
    blurb: 'El cuestionario de entrada de cada atleta nuevo y los tests de su primera semana.',
  },
  {
    area: 'dar-el-plan',
    slug: 'asigna-el-plan',
    title: 'Asigna y publica por semanas',
    blurb: 'Un programa a uno, a varios o a un grupo; cada semana se hace visible sola.',
  },
  // ── Seguimiento ───────────────────────────────────────────────────────────
  {
    area: 'seguimiento',
    slug: 'readiness-y-checkin',
    title: 'Readiness y check-in',
    blurb: 'Cómo llega tu atleta hoy, de 0 a 100, siempre frente a su propia base.',
  },
  {
    area: 'seguimiento',
    slug: 'adherencia-y-constancia',
    title: 'Entrenos hechos y adherencia',
    blurb: 'Lo que tu atleta marca vuelve a ti: el estado de cada entreno y su adherencia con ventana.',
  },
  {
    area: 'seguimiento',
    slug: 'progreso-y-rendimiento',
    title: 'Rendimiento',
    blurb: 'La pestaña Rendimiento: zonas y tests, carrera, carga, fuerza, fisiología y carreras.',
  },
  {
    area: 'seguimiento',
    slug: 'carreras-y-objetivos',
    title: 'Carreras y objetivos',
    blurb: 'La carrera objetivo, su cuenta atrás y el historial de resultados.',
  },
  {
    area: 'seguimiento',
    slug: 'objetivo-y-prediccion',
    title: 'Objetivo y predicción',
    blurb: 'El tiempo meta repartido en los tramos de la carrera: presupuesto, predicho y el hueco.',
  },
  {
    area: 'seguimiento',
    slug: 'cumplimiento-por-serie',
    title: 'Prescrito contra hecho, tramo a tramo',
    blurb: 'En un entreno ya hecho, cada tramo de carrera con su veredicto y el % en banda.',
  },
  {
    area: 'seguimiento',
    slug: 'zonas-de-pulso',
    title: 'Zonas de pulso',
    blurb: 'Cuelgan del umbral, no de la FC máxima; sin ancla no hay zonas, y la app lo dice.',
  },
  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  {
    area: 'ciclo-vida',
    slug: 'pausas-y-bajas',
    title: 'Pausas y bajas',
    blurb: 'Congela el plan sin castigar la adherencia; da de baja conservando el historial.',
  },
  {
    area: 'ciclo-vida',
    slug: 'lesiones',
    title: 'Lesiones',
    blurb: 'Regístrala en la ficha, sigue su evolución y adapta el plan sin que cuente como fallo.',
  },
  {
    area: 'ciclo-vida',
    slug: 'revision-1a1',
    title: 'Revisiones 1:1',
    blurb: 'Un repaso cada cierto tiempo: tú propones, tu atleta elige hueco y se agenda solo.',
  },
  // ── Dobles ────────────────────────────────────────────────────────────────
  {
    area: 'dobles',
    slug: 'entrenar-en-dobles',
    title: 'Parejas de dobles',
    blurb: 'Dos atletas, una pareja: su plan, el reparto de la simulación y tus consejos.',
  },
  {
    area: 'dobles',
    slug: 'dobles-en-vivo-y-juntos',
    title: 'Dobles en vivo y juntos',
    blurb: 'Uno entrena y el otro lo ve en vivo, el relevo dirigido y el resumen juntos al acabar.',
  },
  // ── Negocio ───────────────────────────────────────────────────────────────
  {
    area: 'negocio',
    slug: 'leads',
    title: 'Leads',
    blurb: 'Negocio › Leads: quien rellena tu formulario entra aquí, con su estado y su siguiente paso.',
  },
  {
    area: 'negocio',
    slug: 'la-videollamada',
    title: 'La videollamada con tu lead',
    blurb: 'Reserva en tus horarios, videollamada automática y recordatorios, sin ida y vuelta.',
  },
  {
    area: 'negocio',
    slug: 'nurturing-de-leads',
    title: 'Recupera leads fríos',
    blurb: 'Los leads que se estancan reciben un correo a su tiempo, sin que muevas un dedo.',
  },
  {
    area: 'negocio',
    slug: 'cupo-y-lista-de-espera',
    title: 'Agenda, cupo y lista de espera',
    blurb: 'Ajustes › Agenda y cupo: tus horarios de llamada, tus plazas y quién espera turno.',
  },
  {
    area: 'negocio',
    slug: 'cobros',
    title: 'Cobros',
    blurb: 'Negocio › Cobros: quién te debe, quién renueva, y recordar o marcar cobrado.',
  },
  {
    area: 'negocio',
    slug: 'embudo',
    title: 'Embudo',
    blurb: 'Negocio › Embudo: del formulario a entrenar contigo, y dónde se cae la gente.',
  },
  // ── En la app del atleta ──────────────────────────────────────────────────
  {
    area: 'app-atleta',
    slug: 'correr-en-cinta',
    title: 'Correr en cinta',
    blurb: 'La app se enlaza a una cinta compatible y corre con ritmo en vivo contra tu objetivo.',
  },
  {
    area: 'app-atleta',
    slug: 'correr-al-aire-libre',
    title: 'Correr al aire libre',
    blurb: 'GPS con mapa, ritmo contra objetivo, auto-pausa, avisos de voz y el reloj.',
  },
  {
    area: 'app-atleta',
    slug: 'remo-y-ergometros',
    title: 'Remo y ergómetros',
    blurb: 'Con el monitor enlazado, cada intervalo entra entero: ritmo /500 m, paladas, vatios y calorías.',
  },
  {
    area: 'app-atleta',
    slug: 'al-acabar-el-entreno',
    title: 'Al acabar el entreno',
    blurb: 'Récords con tarjeta para compartir, y lo que te llega: cómo ha ido y una molestia.',
  },
  {
    area: 'app-atleta',
    slug: 'historial-del-atleta',
    title: 'Su historial',
    blurb: 'El calendario del atleta en su app: cada día abre el entreno entero, con tiempos reales.',
  },
  // ── Herramientas ──────────────────────────────────────────────────────────
  {
    area: 'herramientas',
    slug: 'el-conector-con-tu-asistente',
    title: 'El conector con tu asistente',
    blurb: 'Pregúntale a tu asistente cómo va un atleta, tócale el plan y publica, desde el móvil.',
  },
] as const satisfies ReadonlyArray<Omit<GuiaSection, 'num'>>;

export const GUIA_SECTIONS: readonly GuiaSection[] = SECTIONS.map((s, i) => ({ ...s, num: i + 1 }));

/** La portada: /guia, sin slug. */
export const GUIA_FIRST_SLUG = GUIA_SECTIONS[0]!.slug;

/**
 * Direcciones viejas de la guía que siguen funcionando: el artículo cambió de
 * nombre o se fundió con otro. /guia/<viejo> redirige a /guia/<nuevo>.
 */
export const GUIA_SLUG_ALIASES: Readonly<Record<string, string>> = {
  'tus-tipos-de-trabajo': 'biblioteca',
  'monta-la-semana': 'monta-un-programa',
  'periodizacion-nombrar-fases': 'grupos',
  'da-de-alta-e-invita': 'invita-a-tus-atletas',
  'cuestionario-inicial-y-tests': 'altas-pendientes',
  'estado-de-cada-entreno': 'adherencia-y-constancia',
  'leads-tu-embudo': 'leads',
  pagos: 'cobros',
  'metricas-del-funnel': 'embudo',
};

/** Ruta (sin locale) de un artículo. La portada es /guia. */
export function guiaHref(slug: string): string {
  return slug === GUIA_FIRST_SLUG ? '/guia' : `/guia/${slug}`;
}

export function guiaAreaLabel(area: GuiaAreaId): string {
  return GUIA_AREAS.find((a) => a.id === area)?.label ?? '';
}

export function guiaSectionsForArea(area: GuiaAreaId): GuiaSection[] {
  return GUIA_SECTIONS.filter((s) => s.area === area);
}

export function findGuiaSection(slug: string): GuiaSection | undefined {
  return GUIA_SECTIONS.find((s) => s.slug === slug);
}

type GuiaSlug = (typeof SECTIONS)[number]['slug'];

/**
 * El artículo de ayuda de cada pantalla del panel: lo usan el «?» de la barra
 * superior (vía <HelpArticle slug={GUIA_SLUGS.x} />) y los enlaces de ayuda.
 * Un artículo que desaparezca lo delata el test de tests/guia.
 */
export const GUIA_SLUGS = {
  inicio: 'que-es-esta-guia',
  hoy: 'tu-pantalla-hoy',
  altas: 'altas-pendientes',
  atletas: 'atletas',
  atleta: 'ficha-del-atleta',
  atleta_rendimiento: 'progreso-y-rendimiento',
  atleta_perfil: 'ficha-del-atleta',
  mensajes: 'habla-con-tu-atleta',
  programar: 'como-se-estructura-un-plan',
  programas: 'monta-un-programa',
  programa: 'monta-un-programa',
  biblioteca: 'biblioteca',
  ejercicios: 'tu-catalogo-de-ejercicios',
  grupos: 'grupos',
  tests: 'tests',
  asignar: 'asigna-el-plan',
  dobles: 'entrenar-en-dobles',
  leads: 'leads',
  cobros: 'cobros',
  embudo: 'embudo',
  ajustes_perfil: 'tu-cuenta-y-tu-marca',
  ajustes_club: 'tu-cuenta-y-tu-marca',
  ajustes_metodo: 'tu-metodologia-y-tus-fases',
  ajustes_plan: 'asigna-el-plan',
  ajustes_agenda: 'cupo-y-lista-de-espera',
  ajustes_notificaciones: 'tu-cuenta-y-tu-marca',
  ajustes_cuenta: 'tu-cuenta-y-tu-marca',
} as const satisfies Record<string, GuiaSlug>;

export type GuiaScreen = keyof typeof GUIA_SLUGS;
