// El catálogo campo a campo del método de analíticas, intensidad, progreso, recuperación y velocidad crítica.
// Puro, sin React ni red. Los LÍMITES no se copian aquí (`ANALYTICS_METHOD_BOUNDS`).
// `catalogo.ts` une las tres partes y obliga en compilación a que no falte ninguna clave.


import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { CampoDescriptor } from './descriptores';

export const DESCRIPTORES_RENDIMIENTO = {
  // ── Intensidad: el reparto ───────────────────────────────────────────────
  polarizacion_familias: {
    tipo: 'familias',
    grupo: 'intensidad',
    etiqueta: 'Qué entrenos cuentan en el reparto',
    ayuda:
      'El reparto fácil, medio y duro se calcula solo con estas familias. El pulso de una serie de barra no mide su intensidad, por eso la fuerza suele quedarse fuera.',
  },
  polarizacion_tolerancia_pts: {
    tipo: 'numero',
    grupo: 'intensidad',
    etiqueta: 'Margen frente al objetivo',
    ayuda: 'Cuántos puntos puede separarse cada zona del reparto de tu objetivo antes de que el panel diga que se sale.',
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  cambio_polarizacion_pts: {
    tipo: 'numero',
    grupo: 'intensidad',
    etiqueta: 'Cambio de reparto que cuenta',
    ayuda: 'Variación del trabajo fácil entre periodos, en puntos porcentuales, a partir de la cual cuenta como cambio.',
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },

  // ── ¿Mejoro? Qué cuenta como mejora ──────────────────────────────────────
  cambio_ergo_pct: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Mejora que cuenta en remo, SkiErg y BikeErg',
    ayuda: 'Variación del ritmo o de los vatios, a la misma dosis, a partir de la cual el panel dice que mejora o empeora.',
    unidad: '%',
    decimales: 1,
    paso: 0.5,
  },
  cambio_fuerza_pct: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Mejora que cuenta en fuerza',
    ayuda: 'Variación del 1RM estimado (o de las repeticiones a peso corporal) a partir de la cual cuenta como mejora.',
    unidad: '%',
    decimales: 1,
    paso: 0.5,
  },
  cambio_estaciones_pct: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Mejora que cuenta en estaciones',
    ayuda: 'Variación del tiempo de una estación, a la misma dosis y con la misma carga, a partir de la cual cuenta.',
    unidad: '%',
    decimales: 1,
    paso: 0.5,
  },
  cambio_wod_pct: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Mejora que cuenta en un WOD repetido',
    ayuda: 'Variación de la puntuación (tiempo o repeticiones) entre dos veces que se hace el mismo WOD.',
    unidad: '%',
    decimales: 1,
    paso: 0.5,
  },
  cambio_test_pct: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Mejora que cuenta en un test',
    ayuda: 'Variación del resultado de uno de tus tests entre dos repeticiones a partir de la cual cuenta como mejora.',
    unidad: '%',
    decimales: 1,
    paso: 0.5,
  },
  fuerza_1rm_reps_max: {
    tipo: 'numero',
    grupo: 'progreso',
    etiqueta: 'Repeticiones máximas para estimar un 1RM',
    ayuda:
      'Una serie con más repeticiones que esto no se usa para estimar el 1RM: por encima de unas diez las fórmulas se separan y lo que mide ya es resistencia.',
    unidad: 'reps',
    decimales: 0,
    paso: 1,
  },

  // ── Recuperación ─────────────────────────────────────────────────────────
  basal_dias: {
    tipo: 'numero',
    grupo: 'recuperacion',
    etiqueta: 'Ventana del basal',
    ayuda: 'Días hacia atrás sobre los que se calcula el basal de recuperación de cada atleta.',
    unidad: 'días',
    decimales: 0,
    paso: 1,
  },
  basal_excluir_dias: {
    tipo: 'numero',
    grupo: 'recuperacion',
    etiqueta: 'Días recientes excluidos del basal',
    ayuda: 'Los días más recientes no entran en el basal, para que una caída puntual no arrastre su propia referencia.',
    unidad: 'días',
    decimales: 0,
    paso: 1,
  },
  sleep_target_hours: {
    tipo: 'numero',
    grupo: 'recuperacion',
    etiqueta: 'Noche completa',
    ayuda: 'Horas de sueño que se toman como referencia de una noche completa.',
    unidad: 'horas',
    decimales: 1,
    paso: 0.5,
  },
  hrv_min_nights_baseline: {
    tipo: 'numero',
    grupo: 'recuperacion',
    etiqueta: 'Noches mínimas para el basal',
    ayuda: 'Con menos noches, el basal se mueve con cada noche nueva y deja de ser una referencia estable.',
    unidad: 'noches',
    decimales: 0,
    paso: 1,
  },
  hrv_min_nights_recent: {
    tipo: 'numero',
    grupo: 'recuperacion',
    etiqueta: 'Noches mínimas recientes',
    ayuda: 'Noches recientes mínimas para afirmar un cambio de variabilidad frente al basal.',
    unidad: 'noches',
    decimales: 0,
    paso: 1,
  },

  // ── Velocidad crítica (correr) ───────────────────────────────────────────
  cs_min_efforts: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Esfuerzos mínimos',
    ayuda: 'Con menos esfuerzos independientes no se intenta el ajuste: con solo dos, la recta siempre parece perfecta.',
    unidad: 'esfuerzos',
    decimales: 0,
    paso: 1,
  },
  cs_min_duration_s: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Duración mínima de un esfuerzo',
    ayuda: 'Por debajo, manda la potencia de arranque y la velocidad crítica sale inflada.',
    unidad: 'min',
    decimales: 1,
    paso: 0.5,
    escalaDivisor: 60,
  },
  cs_max_duration_s: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Duración máxima de un esfuerzo',
    ayuda: 'Por encima, entra la reserva de combustible que el modelo no contempla y la velocidad crítica sale hundida.',
    unidad: 'min',
    decimales: 1,
    paso: 0.5,
    escalaDivisor: 60,
  },
  cs_min_spread_ratio: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Separación mínima entre esfuerzos',
    ayuda: 'El esfuerzo más largo tiene que durar, como mínimo, este número de veces lo que dura el más corto. Si no, es casi el mismo punto repetido.',
    unidad: '×',
    decimales: 1,
    paso: 0.5,
  },
  cs_min_fit_r2_pct: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Bondad del ajuste mínima (R²)',
    ayuda: 'Por debajo de este porcentaje de bondad del ajuste, el resultado no se guarda.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cs_max_drift_from_threshold_pct: {
    tipo: 'numero',
    grupo: 'capacidad',
    etiqueta: 'Desvío máximo frente al umbral',
    ayuda: 'Cuánto puede alejarse la velocidad crítica del umbral ya medido antes de retirar el resultado.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
} satisfies Partial<Record<keyof CoachAnalyticsMethod, CampoDescriptor>>;
