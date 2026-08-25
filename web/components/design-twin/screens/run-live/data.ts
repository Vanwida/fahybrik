// Datos de ejemplo + espejo de los formateadores de la app para «Correr».
//
// Los formateadores NO se inventan: cada uno replica su función Swift (la ruta
// está en el comentario). Las diferencias entre ellos son reales y visibles en
// la app — el HUD de calle escribe el tiempo con `WorkoutSession.formatElapsed`
// ("04:37") y el de cinta con `TreadmillMath.clock` ("4:37") — así que el doble
// las conserva en vez de unificarlas.

import {
  distanciaCubierta,
  distanciaDosis,
  dosisDeCarrera,
  esDecimal,
  reloj,
  ritmoObjetivo,
  type TramoCarrera,
} from '../../datos-reales';

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
// El bloque de ejemplo — 4 × 1 km @ 4:35/km, con 2' al trote entre series
// ---------------------------------------------------------------------------

/** Umbral (LTHR) del atleta de ejemplo — el servidor resuelve las zonas contra esto. */
export const UMBRAL_BPM = 168;

/** Ritmo objetivo del tramo, s/km (PaceTarget.single = 4:35). */
export const OBJETIVO_SKM = 275;
/** PaceTarget.singleToleranceSecPerKm — ventana ± para juzgar un ritmo único. */
export const TOLERANCIA_SKM = 8;

/** Prescripción del tramo que el HUD enseña como referencia sobria. */
export const INCLINACION_PRESCRITA_PCT = 1;
export const CADENCIA_PRESCRITA_PPM = 180;

/** Metros de cada serie y segundos de cada recuperación — el bloque de ejemplo. */
const SERIE_M = 1000;
const RECUPERACION_S = 120;
const SERIES = 4;

/**
 * LA ESTRUCTURA del bloque, expandida: 4 series con 2' entre ellas = 7 tramos (la
 * última no lleva recuperación detrás).
 *
 * El OFF va declarado al TROTE porque es lo que este bloque es y lo que el propio
 * HUD dice en pantalla («Recuperación», nunca «Descanso»): dos minutos entre
 * series de 1000 a 4:35 se trotan. Sin declararlo, la dosis diría «descanso
 * 2:00» — la palabra que la app reserva para cuando de verdad se para.
 */
export const TRAMOS: readonly TramoCarrera[] = Array.from({ length: SERIES }, (_, i) => [
  { tipo: 'trabajo' as const, metros: SERIE_M, objetivo: ritmoObjetivo(OBJETIVO_SKM) },
  ...(i < SERIES - 1
    ? [{ tipo: 'recuperacion' as const, segundos: RECUPERACION_S, modo: 'trote' as const }]
    : []),
]).flat();

/** Cabecera de la puerta de bloque (BlockPreviewGate). */
export const BLOQUE = {
  fase: 'PRINCIPAL',
  titulo: 'Series de 1000',
  /** «BLOQUE 2 DE 4» — la posición del bloque en la sesión, no las series. */
  numero: 2,
  total: 4,
  /**
   * `PrescriptionRenderer.wodHeader` de un `intervals` — «Series», y luego cuántas.
   * Decía «Intervalos», que era la grafía de `conditioningFormatLabel`, la segunda
   * implementación de esta cabecera: murió el 30-jul y ahora hay una sola (§2).
   */
  formato: `Series · ${SERIES} series`,
  /**
   * WorkRow: nombre = título del segmento, trabajo = `previewWorkLine`. La línea
   * NO se escribe a mano: sale de la MISMA estructura que corre el HUD, por el
   * mismo formateador que la puerta del bloque de verdad — así no puede decir una
   * cosa aquí y otra tres tramos más abajo.
   */
  filas: [
    {
      nombre: 'Series de 1000',
      trabajo: dosisDeCarrera({ estructura: [...TRAMOS] })?.linea,
    },
  ],
} as const;

/** El título del segmento vivo — lo que el HUD pinta bajo «Tramo N de M». */
export const SEGMENTO_TITULO = 'Series de 1000';

/** El tramo, como lo ve este guion. Alias del tipo compartido: la gramática de
 *  correr es una sola en todo el doble (§2). */
export type Tramo = TramoCarrera;

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

/**
 * `Formato.distancia(…) ?? "0 m"` — la DOSIS del tramo y lo cubierto contra ella,
 * que es como lo escribe el `GoalProgress` del HUD de calle: «1,4 km», «2 km».
 *
 * Escribía «1.4 km» con PUNTO. La app no localiza nada: escribe la coma española a
 * mano en `Formato.esDecimal`, y un punto decimal en un espejo es exactamente el
 * tipo de mentira pequeña que este doble existe para no contar.
 */
export function fmtDistancia(metros: number): string {
  return distanciaDosis(metros) ?? '0 m';
}

/**
 * `Formato.distanciaCubierta(…) ?? "0 m"` — la distancia MEDIDA, con sus dos
 * decimales: «1,40 km», «437 m». En una medida los ceros SON el dato (has cubierto
 * un kilómetro cuatrocientos clavados) y además el ancho no baila mientras corres.
 *
 * No es «la de la cinta»: la usan las dos superficies —el chip de distancia del HUD
 * de calle y las celdas de la cinta— porque la diferencia es el CONCEPTO (medida vs
 * dosis), no el aparato.
 */
export function fmtDistanciaCubierta(metros: number): string {
  return distanciaCubierta(metros) ?? '0 m';
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
// Cuando no hay ritmo medido — TreadmillHUDView.sinRitmo / OutdoorRunHUDView.
// lecturaViva: el sujeto degrada a la SIGUIENTE VERDAD DISPONIBLE, nunca a un
// hueco. En este bloque hay un único punto (PaceTarget.single = 4:35, sin
// banda), así que el objetivo SIEMPRE existe y es esa siguiente verdad.
// ---------------------------------------------------------------------------

/**
 * `RunTarget.objetivoLabel` — el ritmo objetivo CON su unidad pegada: «4:35/km».
 *
 * La unidad va dentro porque en Swift va dentro, y las dos pantallas la escriben
 * tal cual: la cinta en su línea de objetivo y el sujeto de «Objetivo» cuando
 * todavía no hay ritmo medido. Devolvía «4:35» y cada HUD le pegaba un « /km» con
 * espacio delante — la tercera grafía del ritmo, otra vez (§2).
 */
export function objetivoLabel(): string {
  return `${reloj(OBJETIVO_SKM)}/km`;
}

/**
 * LA VELOCIDAD QUE HAY QUE MARCAR EN LA CONSOLA — `RunTarget.velocidadDeCinta`
 * sobre `TreadmillMath.speedKmh(fromPaceSecPerKm:step:)`: 4:35/km → «13,1».
 *
 * Se redondea AL ESCALÓN que la cinta publica en su rango de velocidades (0,1
 * km/h por defecto): un «13,09» no se puede marcar en ninguna consola, y un
 * número que el atleta no puede teclear no es ayuda.
 */
export function velocidadDeCinta(escalonKmh = 0.1): string {
  const bruto = 3600 / OBJETIVO_SKM;
  return esDecimal(Math.round(bruto / escalonKmh) * escalonKmh, 1);
}

/**
 * El objetivo de la cinta, con el número que hay que marcar al lado —
 * `TreadmillHUDView.objetivoConMarca`: «Objetivo 4:35/km · pon 13,1».
 *
 * El coach prescribe en ritmo, que es su idioma; la consola se marca en km/h, que
 * es el de la máquina. Y mientras la cinta no acepte que la app le fije la
 * velocidad —hoy no lo hace ninguna de las que hemos encontrado, esta BH incluida—
 * la cuenta la hace el atleta a mano y sudando. Sólo cuando le toca marcarla a él:
 * si la app pudiera fijarla, darle un número que teclear sería ruido.
 */
export function objetivoConMarca(puedeControlarVelocidad = false): string {
  if (puedeControlarVelocidad) return `Objetivo ${objetivoLabel()}`;
  return `Objetivo ${objetivoLabel()} · pon ${velocidadDeCinta()}`;
}

/** La siguiente verdad disponible sin ritmo: el objetivo si existe, si no el
 *  reloj del tramo. La segunda rama no es alcanzable con este bloque (siempre
 *  prescribe un ritmo), pero es la que usaría un tramo sin `PaceTarget`. */
export function sinRitmo(legSegundos: number): { etiqueta: string; cifra: string } {
  const objetivo = objetivoLabel();
  return objetivo ? { etiqueta: 'Objetivo', cifra: objetivo } : { etiqueta: 'Tiempo', cifra: fmtElapsed(legSegundos) };
}

// ---------------------------------------------------------------------------
// Por qué NO hay dato — TreadmillHUDModel.sinLecturaMotivo / sinPulsoMotivo
// (§7 del CONTRATO-UI). El Swift distingue cuatro motivos para cada aparato;
// este guion solo recorre dos de cada uno — nunca simula una cinta que se
// calla tras haber dado datos, ni un umbral perdido de la banda — pero la
// palabra que SÍ dice es la real, nunca un guion.
// ---------------------------------------------------------------------------

/** TreadmillHUDModel.sinLecturaMotivo. `conDatos` false = nunca llegó el
 *  primer dato ("esperando a la cinta"); true implica velocidad 0 con datos
 *  vivos ("cinta parada") — las otras dos palabras («sin conectar» / «la
 *  cinta no envía datos») son de un enlace que este guion no modela. */
export function sinLecturaMotivoCinta(conDatos: boolean): string {
  return conDatos ? 'cinta parada' : 'esperando a la cinta';
}

/** TreadmillHUDModel.sinPulsoMotivo — el reloj es siempre la fuente en este
 *  HUD (chip "Pulso · Watch"), así que el único motivo alcanzable es el de un
 *  enlace conectado sin lectura todavía. */
export const SIN_PULSO_MOTIVO_CINTA = 'sin lecturas aún';

/** El motivo del pulso en la calle — chip "Sin reloj" (OutdoorRunHUDView). */
export const SIN_PULSO_MOTIVO_CALLE = 'sin reloj';

/** TreadmillHUDView.beltReadingLine — lo que la CINTA dice que hace, bajo el
 *  héroe: la misma medida en las unidades del propio dial. Ausente hasta el
 *  primer dato. El 0 se pinta: está medido. */
export function lineaLecturaCinta(velocidadKmh: number, conDatos: boolean): string | null {
  if (!conDatos) return null;
  return `${fmt1(velocidadKmh)} km/h en la cinta`;
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
