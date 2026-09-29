// El catálogo de TODOS los campos de `CoachAnalyticsMethod`: cómo se llama cada
// uno delante del coach, para qué sirve en una línea, en qué unidad se enseña y
// con cuántos decimales/paso. Puro — sin React, sin red.
//
// Los LÍMITES nunca se copian aquí: se leen de `ANALYTICS_METHOD_BOUNDS`
// (metodo.ts) en el sitio que los necesita, para que el formulario y la base de
// datos no puedan discrepar sobre qué es un valor admisible.
//
// Dos campos (`cs_min_duration_s`, `cs_max_duration_s`) se guardan en segundos
// pero se enseñan en minutos: `escalaDivisor` es el factor de esa conversión
// (mostrado = guardado ÷ factor; guardado = mostrado × factor).
//
// El tipo del catálogo (`Record<keyof CoachAnalyticsMethod, CampoDescriptor>`)
// obliga en compilación a que TODAS las claves del método tengan descriptor: si
// `metodo.ts` añade un campo y este fichero no se actualiza, deja de compilar.

import { ESTADO_FRESCURA_ES, type EstadoFrescura } from '@fahybrid/shared/domain/analytics/forma';
import type { BaseCumplimiento, CoachAnalyticsMethod, FuenteCarga, ModalidadCarga } from '@fahybrid/shared/domain/analytics/metodo';

export type GrupoId = 'forma' | 'frescura' | 'carga' | 'cumplimiento' | 'cambio' | 'recuperacion' | 'capacidad';

export interface GrupoInfo {
  id: GrupoId;
  titulo: string;
  /** Casi nadie lo toca: se pliega tras un «Mostrar» (arquetipo Configurar, CONTRATO-UI §6.2). */
  plegadoPorDefecto: boolean;
}

/** El orden de aparición en la pantalla. */
export const GRUPOS: readonly GrupoInfo[] = [
  { id: 'forma', titulo: 'Forma y fatiga', plegadoPorDefecto: false },
  { id: 'frescura', titulo: 'Frescura: los cinco estados', plegadoPorDefecto: false },
  { id: 'carga', titulo: 'Cómo se calcula la carga', plegadoPorDefecto: false },
  { id: 'cumplimiento', titulo: 'Cumplimiento', plegadoPorDefecto: false },
  { id: 'cambio', titulo: 'Qué cuenta como cambio', plegadoPorDefecto: false },
  { id: 'recuperacion', titulo: 'Recuperación', plegadoPorDefecto: true },
  { id: 'capacidad', titulo: 'Velocidad crítica (correr)', plegadoPorDefecto: true },
] as const;

interface CampoBase {
  grupo: GrupoId;
  etiqueta: string;
  /** Una línea: para qué sirve este número en la pantalla del coach o del atleta. */
  ayuda: string;
}

export interface CampoNumero extends CampoBase {
  tipo: 'numero';
  unidad: string;
  decimales: number;
  paso: number;
  /** Si se enseña en otra escala que la guardada (segundos → minutos, aquí 60). */
  escalaDivisor?: number;
}

export interface CampoEscalera extends CampoBase {
  tipo: 'escalera';
  modalidad: ModalidadCarga;
}

export interface CampoSeleccion extends CampoBase {
  tipo: 'seleccion';
  // Array mutable (no ReadonlyArray): así se pasa tal cual a `Select`, que
  // tipa sus `options` como `SelectOption<V>[]`.
  opciones: Array<{ value: BaseCumplimiento; label: string }>;
}

export type CampoDescriptor = CampoNumero | CampoEscalera | CampoSeleccion;

/** Los cuatro peldaños de la escalera de carga, en castellano. */
export const PELDANO_ETIQUETA: Record<FuenteCarga, string> = {
  potencia: 'Vatios',
  ritmo: 'Ritmo',
  pulso: 'Pulso',
  esfuerzo: 'Esfuerzo (RPE o RIR)',
};

/** Nombre del estado tal como lo ve el atleta — una sola fuente (`forma.ts`), nunca retipeado. */
const nombreEstado = (e: EstadoFrescura) => ESTADO_FRESCURA_ES[e].etiqueta_es;

export const DESCRIPTORES_METODO_ANALITICO: Record<keyof CoachAnalyticsMethod, CampoDescriptor> = {
  // ── Forma y fatiga ──────────────────────────────────────────────────────
  ctl_days: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Días de fondo (forma)',
    ayuda: 'Cuántos días de historia pesan en la forma del atleta. Más días, una curva más lenta y más estable.',
    unidad: 'días',
    decimales: 0,
    paso: 1,
  },
  atl_days: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Días de lo reciente (fatiga)',
    ayuda: 'Cuántos días pesan en el cansancio que arrastra el atleta ahora mismo.',
    unidad: 'días',
    decimales: 0,
    paso: 1,
  },
  ramp_alert_tss_per_week: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Aviso de subida rápida',
    ayuda: 'A partir de esta subida de forma por semana, el panel avisa de que sube demasiado rápido.',
    unidad: 'carga/semana',
    decimales: 0,
    paso: 1,
  },
  subida_dias: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Ventana de «has subido»',
    ayuda: 'Los días sobre los que se lee una subida de forma para contársela al atleta, del tipo «has subido un 20 %».',
    unidad: 'días',
    decimales: 0,
    paso: 1,
  },
  subida_minima_pct: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Subida mínima que se cuenta',
    ayuda: 'Por debajo de este porcentaje, una subida es ruido de redondeo y no se menciona.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  acr_low: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Cociente bajo (reciente ÷ fondo)',
    ayuda: 'Por debajo de este cociente, lo reciente no sostiene el fondo: la forma puede empezar a bajar.',
    unidad: 'cociente',
    decimales: 2,
    paso: 0.05,
  },
  acr_high: {
    tipo: 'numero',
    grupo: 'forma',
    etiqueta: 'Cociente alto (reciente ÷ fondo)',
    ayuda:
      'Por encima de este cociente, la carga se acumula más rápido de lo que se asimila. Ya no sale en el panel nuevo, pero lo sigue usando el sistema anterior hasta retirarlo.',
    unidad: 'cociente',
    decimales: 2,
    paso: 0.05,
  },

  // ── Frescura: los cinco estados ─────────────────────────────────────────
  frescura_sobrecarga_hasta: {
    tipo: 'numero',
    grupo: 'frescura',
    etiqueta: `Hasta aquí, «${nombreEstado('sobrecarga')}»`,
    ayuda: `Frescura igual o por debajo de este número: el atleta ve «${nombreEstado('sobrecarga')}».`,
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  frescura_optimo_hasta: {
    tipo: 'numero',
    grupo: 'frescura',
    etiqueta: `Hasta aquí, «${nombreEstado('optimo')}»`,
    ayuda: `De ahí hasta este número: el atleta ve «${nombreEstado('optimo')}», el punto óptimo para progresar.`,
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  frescura_mantener_hasta: {
    tipo: 'numero',
    grupo: 'frescura',
    etiqueta: `Hasta aquí, «${nombreEstado('mantener')}»`,
    ayuda: `De ahí hasta este número: el atleta ve «${nombreEstado('mantener')}».`,
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  frescura_fresco_hasta: {
    tipo: 'numero',
    grupo: 'frescura',
    etiqueta: `Hasta aquí, «${nombreEstado('fresco')}»`,
    ayuda: `De ahí hasta este número: el atleta ve «${nombreEstado('fresco')}», a punto para competir. Por encima, «${nombreEstado('recargando')}».`,
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },

  // ── Cómo se calcula la carga ─────────────────────────────────────────────
  fuentes_run: {
    tipo: 'escalera',
    modalidad: 'run',
    grupo: 'carga',
    etiqueta: 'Correr',
    ayuda: 'Por qué peldaño se mide primero el esfuerzo al correr: gana el primero con dato y con umbral.',
  },
  fuentes_row: {
    tipo: 'escalera',
    modalidad: 'row',
    grupo: 'carga',
    etiqueta: 'Remo',
    ayuda: 'Orden de peldaños en el ergómetro de remo.',
  },
  fuentes_ski: {
    tipo: 'escalera',
    modalidad: 'ski',
    grupo: 'carga',
    etiqueta: 'SkiErg',
    ayuda: 'Orden de peldaños en el SkiErg.',
  },
  fuentes_bike: {
    tipo: 'escalera',
    modalidad: 'bike',
    grupo: 'carga',
    etiqueta: 'BikeErg',
    ayuda: 'Orden de peldaños en el BikeErg.',
  },
  fuentes_strength: {
    tipo: 'escalera',
    modalidad: 'strength',
    grupo: 'carga',
    etiqueta: 'Fuerza',
    ayuda: 'Orden de peldaños en el trabajo de fuerza.',
  },
  fuentes_other: {
    tipo: 'escalera',
    modalidad: 'other',
    grupo: 'carga',
    etiqueta: 'El resto (calentar, core, movilidad)',
    ayuda: 'Orden de peldaños para lo que no encaja en las modalidades de arriba.',
  },
  fuerza_coeficiente: {
    tipo: 'numero',
    grupo: 'carga',
    etiqueta: 'Peso de la fuerza en la carga',
    ayuda: 'Cuánto vale una hora de fuerza frente a una hora de cardio al mismo esfuerzo. 1 = la misma unidad para todo.',
    unidad: '×',
    decimales: 2,
    paso: 0.05,
  },
  cobertura_veredicto_min_pct: {
    tipo: 'numero',
    grupo: 'carga',
    etiqueta: 'Cobertura mínima para hablar',
    ayuda:
      'Con menos porcentaje del tiempo entrenado preciado, el número se sigue enseñando pero la palabra (forma, frescura) se retira.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cobertura_ciega_alerta_pct: {
    tipo: 'numero',
    grupo: 'carga',
    etiqueta: 'Aviso de entreno sin medir',
    ayuda: 'A partir de este porcentaje sin medir ni puntuar, la pantalla lo avisa en voz alta.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },

  // ── Cumplimiento ─────────────────────────────────────────────────────────
  cumplimiento_base: {
    tipo: 'seleccion',
    grupo: 'cumplimiento',
    etiqueta: 'Sobre qué se mide',
    ayuda: 'Qué cuenta el cumplimiento: sesiones hechas, tramos dentro de lo pedido, o carga hecha frente a la planificada.',
    opciones: [
      { value: 'sesiones', label: 'Sesiones hechas' },
      { value: 'tramos', label: 'Tramos dentro de lo pedido' },
      { value: 'carga', label: 'Carga hecha frente a planificada' },
    ],
  },
  cumplimiento_bien_pct: {
    tipo: 'numero',
    grupo: 'cumplimiento',
    etiqueta: 'A partir de aquí, bien',
    ayuda: 'Por encima de este porcentaje, el cumplimiento se enseña en verde.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cumplimiento_regular_pct: {
    tipo: 'numero',
    grupo: 'cumplimiento',
    etiqueta: 'A partir de aquí, regular',
    ayuda: 'Entre este porcentaje y el de «bien» es regular; por debajo, malo.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },

  // ── Qué cuenta como cambio (contra el periodo anterior) ─────────────────
  cambio_carga_pct: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de carga que cuenta',
    ayuda: 'Variación de carga entre periodos a partir de la cual se avisa de un cambio.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cambio_horas_pct: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de horas que cuenta',
    ayuda: 'Variación de horas entrenadas entre periodos a partir de la cual cuenta como cambio.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cambio_forma_tss: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de forma que cuenta',
    ayuda: 'Variación de forma entre periodos a partir de la cual cuenta como cambio.',
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  cambio_frescura_tss: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de frescura que cuenta',
    ayuda: 'Variación de frescura entre periodos a partir de la cual cuenta como cambio.',
    unidad: 'puntos',
    decimales: 0,
    paso: 1,
  },
  cambio_variabilidad_pct: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de variabilidad que cuenta',
    ayuda: 'Variación de variabilidad cardiaca entre periodos a partir de la cual cuenta como cambio.',
    unidad: '%',
    decimales: 0,
    paso: 1,
  },
  cambio_pulso_reposo_bpm: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de pulso en reposo que cuenta',
    ayuda: 'Variación de pulso en reposo entre periodos a partir de la cual cuenta como cambio.',
    unidad: 'ppm',
    decimales: 0,
    paso: 1,
  },
  cambio_sueno_horas: {
    tipo: 'numero',
    grupo: 'cambio',
    etiqueta: 'Cambio de sueño que cuenta',
    ayuda: 'Variación de horas de sueño entre periodos a partir de la cual cuenta como cambio.',
    unidad: 'horas',
    decimales: 1,
    paso: 0.5,
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
    ayuda: 'El más largo tiene que durar, como mínimo, esta proporción veces el más corto. Si no, es un punto repetido.',
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
};

/** Las claves de cada grupo, en el orden en que se pintan (no es el orden de declaración del tipo). */
export const CAMPOS_POR_GRUPO: Record<GrupoId, ReadonlyArray<keyof CoachAnalyticsMethod>> = {
  forma: ['ctl_days', 'atl_days', 'ramp_alert_tss_per_week', 'subida_dias', 'subida_minima_pct', 'acr_low', 'acr_high'],
  frescura: ['frescura_sobrecarga_hasta', 'frescura_optimo_hasta', 'frescura_mantener_hasta', 'frescura_fresco_hasta'],
  carga: [
    'fuentes_run',
    'fuentes_row',
    'fuentes_ski',
    'fuentes_bike',
    'fuentes_strength',
    'fuentes_other',
    'fuerza_coeficiente',
    'cobertura_veredicto_min_pct',
    'cobertura_ciega_alerta_pct',
  ],
  cumplimiento: ['cumplimiento_base', 'cumplimiento_bien_pct', 'cumplimiento_regular_pct'],
  cambio: [
    'cambio_carga_pct',
    'cambio_horas_pct',
    'cambio_forma_tss',
    'cambio_frescura_tss',
    'cambio_variabilidad_pct',
    'cambio_pulso_reposo_bpm',
    'cambio_sueno_horas',
  ],
  recuperacion: ['basal_dias', 'basal_excluir_dias', 'sleep_target_hours', 'hrv_min_nights_baseline', 'hrv_min_nights_recent'],
  capacidad: [
    'cs_min_efforts',
    'cs_min_duration_s',
    'cs_max_duration_s',
    'cs_min_spread_ratio',
    'cs_min_fit_r2_pct',
    'cs_max_drift_from_threshold_pct',
  ],
};
