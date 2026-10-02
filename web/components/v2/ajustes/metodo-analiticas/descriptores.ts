// Los tipos de los campos del método de analíticas, los grupos de pantalla y su
// orden. Puro, sin React ni red. El catálogo campo a campo vive en `catalogo.ts`.
//
// Los LÍMITES nunca se copian aquí: se leen de `ANALYTICS_METHOD_BOUNDS`
// (metodo.ts) en el sitio que los necesita, para que el formulario y la base de
// datos no puedan discrepar sobre qué es un valor admisible.
//
// Dos campos (`cs_min_duration_s`, `cs_max_duration_s`) se guardan en segundos
// pero se enseñan en minutos: `escalaDivisor` es el factor de esa conversión
// (mostrado = guardado ÷ factor; guardado = mostrado × factor).

import type { BaseCumplimiento, BaseSesion, CoachAnalyticsMethod, FuenteCarga, ModalidadCarga } from '@fahybrid/shared/domain/analytics/metodo';

export type GrupoId = 'forma' | 'frescura' | 'carga' | 'cumplimiento' | 'holgura' | 'cambio' | 'intensidad' | 'progreso' | 'recuperacion' | 'capacidad';

export interface GrupoInfo {
  id: GrupoId;
  titulo: string;
  /** Una línea bajo el título, para lo que el coach necesita saber antes de tocar el grupo. */
  nota?: string;
  /** Casi nadie lo toca: se pliega tras un «Mostrar» (arquetipo Configurar, CONTRATO-UI §6.2). */
  plegadoPorDefecto: boolean;
}

/** El orden de aparición en la pantalla. */
export const GRUPOS: readonly GrupoInfo[] = [
  { id: 'forma', titulo: 'Forma y fatiga', plegadoPorDefecto: true },
  { id: 'frescura', titulo: 'Frescura: los cinco estados', plegadoPorDefecto: true },
  { id: 'carga', titulo: 'Cómo se calcula la carga', plegadoPorDefecto: true },
  { id: 'cumplimiento', titulo: 'Cumplimiento', plegadoPorDefecto: true },
  {
    id: 'holgura',
    titulo: 'Cumplimiento: la holgura de cada tramo',
    nota: 'Cuánto puede salirse un tramo de su banda y seguir contando como dentro. Es la holgura del reloj en vivo, para que reloj y analíticas no digan cosas distintas.',
    plegadoPorDefecto: true,
  },
  { id: 'cambio', titulo: 'Qué cuenta como cambio', plegadoPorDefecto: true },
  {
    id: 'intensidad',
    titulo: 'Intensidad: el reparto',
    nota: 'El objetivo del reparto (cuánto fácil, medio y duro) es el de tus zonas de FC, más arriba.',
    plegadoPorDefecto: true,
  },
  {
    id: 'progreso',
    titulo: '¿Mejoro? Qué cuenta como mejora',
    nota: 'Correr se juzga con la mejora que marcas en «Lecturas de carrera».',
    plegadoPorDefecto: true,
  },
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

/** Una lista ORDENADA de bases con que comparar una sesión hecha con su plan (manda la primera que se sabe). */
export interface CampoOrden extends CampoBase {
  tipo: 'orden';
  etiquetas: Record<BaseSesion, string>;
}

/** Un conjunto de familias de entreno, sin orden (se guarda en el orden del vocabulario). */
export interface CampoFamilias extends CampoBase {
  tipo: 'familias';
}

export type CampoDescriptor = CampoNumero | CampoEscalera | CampoOrden | CampoSeleccion | CampoFamilias;

/** Los cuatro peldaños de la escalera de carga, en castellano. */
export const PELDANO_ETIQUETA: Record<FuenteCarga, string> = {
  potencia: 'Vatios',
  ritmo: 'Ritmo',
  pulso: 'Pulso',
  esfuerzo: 'Esfuerzo (RPE o RIR)',
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
  cumplimiento: [
    'cumplimiento_base',
    'cumplimiento_bien_pct',
    'cumplimiento_regular_pct',
    'cumplimiento_sesion_bases',
    'cumplimiento_verde_min_pct',
    'cumplimiento_verde_max_pct',
    'cumplimiento_ambar_min_pct',
    'cumplimiento_ambar_max_pct',
  ],
  holgura: [
    'holgura_ritmo_s_km',
    'holgura_split_s_500m',
    'holgura_vatios_w',
    'holgura_pulso_ppm',
    'holgura_rpe',
    'holgura_rir',
    'holgura_carga_pct',
    'holgura_dosis_pct',
  ],
  cambio: [
    'cambio_carga_pct',
    'cambio_horas_pct',
    'cambio_forma_tss',
    'cambio_frescura_tss',
    'cambio_variabilidad_pct',
    'cambio_pulso_reposo_bpm',
    'cambio_sueno_horas',
    'cambio_cumplimiento_pts',
  ],
  intensidad: ['polarizacion_familias', 'polarizacion_tolerancia_pts', 'cambio_polarizacion_pts'],
  progreso: ['cambio_ergo_pct', 'cambio_fuerza_pct', 'cambio_estaciones_pct', 'cambio_wod_pct', 'cambio_test_pct', 'fuerza_1rm_reps_max'],
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
