// El catálogo campo a campo del método de analíticas, forma, frescura y cálculo de la carga.
// Puro, sin React ni red. Los LÍMITES no se copian aquí (`ANALYTICS_METHOD_BOUNDS`).
// `catalogo.ts` une las tres partes y obliga en compilación a que no falte ninguna clave.

import { ESTADO_FRESCURA_ES, type EstadoFrescura } from '@fahybrid/shared/domain/analytics/forma';
import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { CampoDescriptor } from './descriptores';

/** Nombre del estado tal como lo ve el atleta, una sola fuente (`forma.ts`), nunca retipeado. */
const nombreEstado = (e: EstadoFrescura) => ESTADO_FRESCURA_ES[e].etiqueta_es;

export const DESCRIPTORES_FORMA_Y_CARGA = {
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
} satisfies Partial<Record<keyof CoachAnalyticsMethod, CampoDescriptor>>;
