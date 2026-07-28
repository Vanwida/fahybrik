// Datos de ejemplo + espejo de los formateadores de la app para «Correr».
//
// Los formateadores NO se inventan: cada uno replica su función Swift (la ruta
// está en el comentario). Las diferencias entre ellos son reales y visibles en
// la app — el HUD de calle escribe el tiempo con `WorkoutSession.formatElapsed`
// ("04:37") y el de cinta con `TreadmillMath.clock` ("4:37") — así que el doble
// las conserva en vez de unificarlas.

export type Entorno = 'cinta' | 'calle';

/** GPSSignalQuality (Workout/Outdoor/RunPaceSmoother.swift). */
export type CalidadGPS = 'buscando' | 'debil' | 'fuerte';

/** GPSSignalQuality.label — literal. */
export const ETIQUETA_GPS: Record<CalidadGPS, string> = {
  fuerte: 'GPS fuerte',
  debil: 'GPS débil',
  buscando: 'Buscando GPS',
};

// ---------------------------------------------------------------------------
// El bloque de ejemplo — 4×1000 m @ 4:35 /km, descanso 2'
// ---------------------------------------------------------------------------

/** FCmáx del atleta de ejemplo (PersonalHRMax resuelve la zona contra esto). */
export const FC_MAX = 190;

/** Ritmo objetivo del tramo, s/km (PaceTarget.single = 4:35). */
export const OBJETIVO_SKM = 275;
/** PaceTarget.singleToleranceSecPerKm — ventana ± para juzgar un ritmo único. */
export const TOLERANCIA_SKM = 8;

/** Prescripción del tramo que el HUD enseña como referencia sobria. */
export const INCLINACION_PRESCRITA_PCT = 1;
export const CADENCIA_PRESCRITA_PPM = 180;

/** Cabecera de la puerta de bloque (BlockPreviewGate). */
export const BLOQUE = {
  fase: 'PRINCIPAL',
  titulo: 'Series de 1000',
  numero: 2,
  total: 4,
  /** conditioningFormatLabel(.intervals) → displayName + "N series". */
  formato: 'Intervalos · 4 series',
  /** WorkRow: nombre = título del segmento, trabajo = previewWorkLine. */
  filas: [
    {
      nombre: 'Series de 1000',
      // PrescriptionRenderer.summaryLine: medida · ritmo · (N× · descanso)
      trabajo: '1000 m · @ 4:35 /km · 4× · descanso 2:00',
    },
  ],
} as const;

/** El título del segmento vivo — lo que el HUD pinta bajo «Tramo N de M». */
export const SEGMENTO_TITULO = 'Series de 1000';

export interface Tramo {
  tipo: 'trabajo' | 'recuperacion';
  metros?: number;
  segundos?: number;
}

/** La estructura expandida: 4 series con 2' entre ellas = 7 tramos. */
export const TRAMOS: readonly Tramo[] = [
  { tipo: 'trabajo', metros: 1000 },
  { tipo: 'recuperacion', segundos: 120 },
  { tipo: 'trabajo', metros: 1000 },
  { tipo: 'recuperacion', segundos: 120 },
  { tipo: 'trabajo', metros: 1000 },
  { tipo: 'recuperacion', segundos: 120 },
  { tipo: 'trabajo', metros: 1000 },
];

/** WorkoutSession.countInSeconds — el 3·2·1 antes del primer tramo. */
export const CUENTA_ATRAS_S = 3;

// ---------------------------------------------------------------------------
// La cinta de ejemplo (familia BH / Exercycle i.Concept: se anuncia «T01_…»)
// ---------------------------------------------------------------------------

export const CINTA_NOMBRE = 'T01_0421';
/** Velocidad que el atleta pone en la consola al arrancar. */
export const CINTA_VELOCIDAD_KMH = 13;
/** Aprieta la consola a mitad de tramo — la app lo refleja, no lo manda. */
export const CINTA_VELOCIDAD_APRETADA_KMH = 14;
export const CINTA_APRIETA_S = 60;
/** Muchas FTMS no emiten NADA hasta que la banda se mueve (telemetrySilent). */
export const CINTA_PRIMER_DATO_S = 6;

// ---------------------------------------------------------------------------
// Guiones deterministas (nada de Math.random: tablas fijas y función del segundo)
// ---------------------------------------------------------------------------

/** Ritmo vivo en calle, s/km — oscila dentro de la banda del objetivo. */
const RITMO_CALLE_SKM = [277, 276, 275, 274, 273, 274, 275, 276, 277, 278, 277, 276, 275, 274, 275, 276];

/** Micro-ondulación del pulso sobre la rampa. */
const PULSO_ONDA = [0, 1, 1, 0, -1, 0, 1, 2, 1, 0];

/** Ritmo GPS suavizado en el segundo `s` de carrera. */
export function ritmoCalleSkm(s: number): number {
  return RITMO_CALLE_SKM[s % RITMO_CALLE_SKM.length];
}

/** Pulso en el segundo `s`: rampa hasta la meseta de tramo y ondulación fija. */
export function pulsoEn(s: number): number {
  const rampa = Math.min(166, 112 + Math.round(s * 0.62));
  return rampa + PULSO_ONDA[s % PULSO_ONDA.length];
}

/** RunAutoPause: 3 s por debajo del umbral para ENGANCHAR, 1,5 s por encima para SOLTAR. */
export const AUTOPAUSA = {
  paraS: 40,
  enganchaS: 43,
  arrancaS: 48,
  sueltaS: 50,
} as const;

export interface GuionCalle {
  /** Segundo en que llega el primer fix utilizable. */
  fixS: number;
  /** Segundo en que el fix pasa a fuerte (== fixS si engancha fino de golpe). */
  fuerteS: number;
  autopausa: boolean;
}

const GUIONES_CALLE: Record<string, GuionCalle> = {
  'calle-gps-ok': { fixS: 3, fuerteS: 3, autopausa: false },
  'calle-gps-debil': { fixS: 8, fuerteS: 14, autopausa: false },
  autopausa: { fixS: 3, fuerteS: 3, autopausa: true },
};

/** El guion de calle del escenario; si el escenario es de cinta y el atleta
 *  elige calle igualmente, corre el guion limpio. */
export function guionCalle(escenario: string): GuionCalle {
  return GUIONES_CALLE[escenario] ?? GUIONES_CALLE['calle-gps-ok'];
}

/** Entorno que el escenario espera (el atleta puede elegir otro: manda su toque). */
export function entornoDelEscenario(escenario: string): Entorno {
  return escenario === 'cinta-manual' ? 'cinta' : 'calle';
}

// ---------------------------------------------------------------------------
// Formateadores — espejo 1:1 del Swift
// ---------------------------------------------------------------------------

/** WorkoutSession.formatElapsed — "%02d:%02d" ("04:37"), con horas si procede. */
export function fmtElapsed(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  if (total >= 3600) return `${Math.floor(total / 3600)}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** PrescriptionRenderer.formatDistance — "1.4 km" / "2 km" / "437 m". */
export function fmtDistancia(metros: number): string {
  if (!(metros > 0)) return '0 m';
  if (metros >= 1000) {
    const km = metros / 1000;
    return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`;
  }
  return `${Math.round(metros)} m`;
}

/** TreadmillHUDView.distString — "1.40 km" / "437 m" (la cinta cuenta más fino). */
export function fmtDistanciaCinta(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${Math.round(metros)} m`;
}

/** Un decimal con punto, como String(format: "%.1f") — la app no localiza. */
export function fmt1(valor: number): string {
  return valor.toFixed(1);
}

// ---------------------------------------------------------------------------
// Juicio del ritmo contra el objetivo (PaceTarget.status)
// ---------------------------------------------------------------------------

export type EstadoObjetivo = 'dentro' | 'rapido' | 'lento' | 'sin-juicio';

export function estadoRitmo(skm: number | null): EstadoObjetivo {
  if (skm === null || skm <= 0) return 'sin-juicio';
  if (skm < OBJETIVO_SKM - TOLERANCIA_SKM) return 'rapido';
  if (skm > OBJETIVO_SKM + TOLERANCIA_SKM) return 'lento';
  return 'dentro';
}

/** TargetStatus.color — dentro = ok, fuera (por cualquier lado) = danger. */
export function colorEstado(estado: EstadoObjetivo): string {
  if (estado === 'dentro') return 'var(--twin-ok)';
  if (estado === 'sin-juicio') return 'var(--twin-fg)';
  return 'var(--twin-danger)';
}

/** OutdoorRunHUDView.paceStateWord — la lectura natural del HUD de calle. */
export function palabraEstadoCalle(estado: EstadoObjetivo): string | null {
  if (estado === 'dentro') return 'dentro';
  if (estado === 'rapido') return 'rápido';
  if (estado === 'lento') return 'lento';
  return null;
}

/** TargetStatus.cue — la señal de una palabra del HUD de cinta. */
export function palabraEstadoCinta(estado: EstadoObjetivo): string | null {
  if (estado === 'dentro') return 'En objetivo';
  if (estado === 'rapido') return 'Afloja';
  if (estado === 'lento') return 'Aprieta';
  return null;
}

// ---------------------------------------------------------------------------
// Ruta ficticia para el mini-mapa (sin tiles: geometría propia en metros)
// ---------------------------------------------------------------------------

export interface PuntoRuta {
  x: number;
  y: number;
}

const PASO_RUTA_M = 12;

/** Traza determinista: gira una manzana cada ~14 pasos con una ondulación
 *  encima, así la polilínea parece calle y no un rectángulo de plantilla. */
function construirRuta(): PuntoRuta[] {
  const pts: PuntoRuta[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 420; i += 1) {
    const rumbo = ((Math.floor(i / 14) * 90 + 16 * Math.sin(i * 0.55)) * Math.PI) / 180;
    const anterior = pts[i];
    pts.push({
      x: anterior.x + PASO_RUTA_M * Math.cos(rumbo),
      y: anterior.y + PASO_RUTA_M * Math.sin(rumbo),
    });
  }
  return pts;
}

export const RUTA: readonly PuntoRuta[] = construirRuta();

/** La traza recorrida hasta `metros`, en metros-espacio. */
export function trazaHasta(metros: number): PuntoRuta[] {
  const pasos = Math.min(RUTA.length - 1, Math.floor(metros / PASO_RUTA_M));
  const traza = RUTA.slice(0, pasos + 1);
  const resto = metros - pasos * PASO_RUTA_M;
  if (resto > 0 && pasos + 1 < RUTA.length) {
    const a = RUTA[pasos];
    const b = RUTA[pasos + 1];
    const f = resto / PASO_RUTA_M;
    traza.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return traza;
}
