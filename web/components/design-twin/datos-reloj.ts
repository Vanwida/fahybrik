// LOS CASOS REALES CON LOS QUE SE DIRIGEN LAS DIEZ VISTAS DE LA MUÑECA.
//
// Todo lo de aquí sale de la base de producción el 30-jul-2026 y lleva su fila
// al lado. Un mockup que enseña un número que la app no puede saber es un
// mockup que miente (CONTRATO-UI §7), y en la muñeca duele el doble: es la
// pantalla donde menos sitio hay para desmentirse luego.
//
// ═══════════════════════════════════════════════════════════════════════════
//  LOS SEIS HECHOS QUE MANDAN SOBRE EL DISEÑO, Y NINGUNO ES CÓMODO
// ═══════════════════════════════════════════════════════════════════════════
//
//  1. **NO HAY ANCLA DE FC. En ningún atleta.** `athletes.max_hr_bpm` es NULL
//     en los 8 de 8, no existe ningún `lthr_bpm`, y `athlete_zone_profiles`
//     tiene CUATRO filas en toda la base — las cuatro del mismo atleta (67) y
//     las cuatro por RITMO, ninguna por pulso.
//
//     Consecuencia directa: **el lienzo teñido por tu zona, que es la idea que
//     da identidad al entreno en vivo (§10.1), hoy no se puede pintar para
//     nadie.** No es un caso límite que haya que contemplar: es el 100 % de la
//     base. Por eso el escenario MÍNIMO de las nueve vistas es el fondo neutro,
//     y el teñido es el escenario aspiracional (§6.3: el mínimo es el caso de
//     diseño). Ojo además: el «162 ppm» que circula por el doble es un valor
//     por defecto del cliente Swift, no un dato de ningún atleta — justo lo que
//     el §7 prohíbe («ningún valor por defecto puede parecer un dato»).
//
//  2. **Con FC sí se cuenta**: 181 de 206 `segment_executions` traen `avg_hr`.
//     Lo que falta no es el pulso, es contra qué compararlo. Sólo 9 de 206
//     traen `zone_seconds`.
//
//  3. **La cinta NO EXISTE en el modelo de datos.** No hay columna de interior
//     ni de entorno, `incline_pct` está informado en 1 de 206 filas (y es un
//     0,0 de una fila de prueba), y las 2 plantillas que llevan «cinta» en el
//     nombre tienen CERO asignaciones. La vista de cinta es, hoy, enteramente
//     una propuesta.
//
//  4. **El AMRAP tampoco existe.** Cero plantillas con formato AMRAP, y
//     `score_rounds` / `score_reps` son NULL en las 77 ejecuciones, sin una
//     excepción. La app no sabe guardar una ronda.
//
//  5. **Los dobles nunca se han corrido en vivo.** `dobles_live_status` tiene
//     cero filas. Las 27 carreras de dobles reales guardan el crono y ocho
//     parciales DE EQUIPO — ni reparto por atleta, ni tiempos de cambio. Así
//     que «sales en ~40 s» no se puede calcular con nada de lo que hay.
//
//  6. **Los cuatro formatos del reloj de pared no se han ejecutado NUNCA en
//     funcional.** `intervals` sólo tiene ejecuciones de `run` y de `row`;
//     `steady`, de `run`, `row` y `ski`. Y `tabata` y `death_by` no existen ni
//     prescritos: cero líneas en toda la biblioteca. Ver el apartado (10).

import type { Ancla } from './kit-watch/modelo';

// ---------------------------------------------------------------------------
// El ancla — o más bien su ausencia
// ---------------------------------------------------------------------------

/**
 * LO QUE HAY HOY: nada. Sin ancla no hay zona, sin zona no hay tinte, y el
 * pulso se pinta en ppm crudos. Es el escenario mínimo de las nueve.
 */
export const SIN_ANCLA: Ancla = null;

/**
 * LO QUE HABRÍA en cuanto un test de umbral escriba un valor medido. Se usa en
 * los escenarios «con umbral» para poder enseñar el lienzo teñido, y va marcado
 * como medido a propósito: un ancla estimada tiñendo la pantalla entera sería
 * pintar de color una suposición.
 */
export const ANCLA_MEDIDA: Ancla = { ppm: 168, estimado: false };

// ---------------------------------------------------------------------------
// Interpolación — la forma de todas las curvas de FC de las nueve vistas
// ---------------------------------------------------------------------------

/** Rampa lineal saturada. Determinista: dos reproducciones pintan lo mismo. */
export function rampa(desde: number, hasta: number, t: number, duracionS: number): number {
  if (duracionS <= 0) return hasta;
  const k = Math.min(1, Math.max(0, t / duracionS));
  return Math.round(desde + (hasta - desde) * k);
}

// ---------------------------------------------------------------------------
// (1) RODAJE — ejecución 145 · atleta 66
// ---------------------------------------------------------------------------

/**
 * 10.000 m a 312 s/km (5:12/km), FC media 150 y máxima 158.
 *
 * Sin laps: en carrera, `raw_lap_data_json` sólo trae `zone_seconds` agregado
 * (y eso en 9 de 206 filas). Un rodaje es una sola medida de punta a punta.
 */
export const RODAJE = {
  procedencia: 'ejecución 145 · atleta 66',
  distanciaM: 10_000,
  ritmoSecKm: 312,
  fcMedia: 150,
  fcMax: 158,
  /** Metro en el que arranca la reproducción: a mitad, que es cuando se mira. */
  desdeM: 5_240,
} as const;

// ---------------------------------------------------------------------------
// (2) SERIES DE CALLE — ejecución 104 · atleta 67
// ---------------------------------------------------------------------------

/**
 * Cinco repeticiones, cada una su propia fila de `segment_executions`, y sus
 * distancias medidas fueron 1600 · 1176 · 1200 · 1220 · 950 m. La FC subió de
 * 138 a 178 a lo largo de la serie.
 *
 * ESA DISPERSIÓN ES EL DATO. Cinco tramos que deberían medir lo mismo y salen
 * entre 950 y 1600 m no los cerró un hito de distancia: los cerró el atleta (o
 * el botón de vuelta). Por eso la vista tiene dos escenarios y no uno — con
 * objetivo prescrito manda «los metros que faltan» y cierra el GPS; sin él, lo
 * único honesto que se puede enseñar son los metros que llevas, y cierras tú.
 */
export const SERIES_CALLE = {
  procedencia: 'ejecución 104 · atleta 67',
  medidasM: [1600, 1176, 1200, 1220, 950],
  total: 5,
  actual: 3,
  /** El objetivo, cuando el coach lo escribe. */
  objetivoM: 1_200,
  /** 4,0 m/s ≈ 4:10/km, el ritmo de una serie de este atleta. */
  velocidadMs: 4.0,
  ritmoSecKm: 250,
  recuperacionS: 90,
  fcDesde: 138,
  fcHasta: 178,
} as const;

// ---------------------------------------------------------------------------
// (3) CINTA — NO EXISTE en la base
// ---------------------------------------------------------------------------

/**
 * Cifras de una serie de cinta corriente, porque en la base NO HAY NINGUNA: sin
 * columna de interior/entorno, con `incline_pct` informado en 1 de 206 filas, y
 * con las 2 plantillas que dicen «cinta» sin una sola asignación.
 *
 * Va marcado como propuesta a propósito. Lo que SÍ es firme es la regla que
 * gobierna la vista, y no depende de estas cifras: **el reloj no ve la cinta.**
 * La lee el móvil por BLE, así que en la muñeca la velocidad y los metros son
 * dato REPETIDO, y sin móvil delante no existen.
 */
export const CINTA = {
  procedencia: 'propuesta · la cinta no existe en el modelo de datos',
  tramoM: 1_000,
  desdeM: 550,
  velocidadKmH: 12.0,
  inclinacionPct: 1.0,
  fcDesde: 152,
  fcHasta: 166,
} as const;

// ---------------------------------------------------------------------------
// (4) ERGO — ejecución 179 (remo) · atleta 64
// ---------------------------------------------------------------------------

/**
 * Plantilla 507, «Remo · 5×500 m». Lo que se capturó de verdad: 1.014,30 m en
 * 392 s (6:32), ritmo medio 122,29 s/500 m, FC media 133 y máxima 162.
 *
 * Y un detalle que dice mucho: `erg_splits` trae UN solo elemento (500 m en
 * 119,2 s, 207 W, 29 paladas/min) aunque la plantilla prescriba cinco. Las dos
 * primeras repeticiones llegaron fundidas en una medida de 1.014,30 m. El
 * ergo mide bien, pero lo que llega guardado no siempre son los cinco tramos.
 */
export const ERGO = {
  procedencia: 'ejecución 179 · asignación 359 · atleta 64',
  total: 5,
  actual: 3,
  tramoM: 500,
  desdeM: 286,
  /** El split explícito que sí se guardó, en segundos por 500 m. */
  ritmoSec500: 119.2,
  potenciaW: 207,
  paladasMin: 29,
  descansoS: 120,
  fcDesde: 133,
  fcHasta: 162,
} as const;

// ---------------------------------------------------------------------------
// (5) FUERZA — ejecuciones 162, 171 y el circuito de pierna
// ---------------------------------------------------------------------------

export interface CasoFuerza {
  procedencia: string;
  ejercicio: string;
  series: number;
  serieActual: number;
  /** Repeticiones prescritas. `null` cuando el coach no las escribió. */
  reps: number | null;
  cargaKg: number;
  descansoS: number;
  /** `null` = el reloj no registró pulso en toda la sesión. */
  fcDesde: number | null;
  fcHasta: number | null;
}

/** Ejecución 162 · plantilla 497 · 4×5 a 100 kg, 90 s en los cuatro sets. */
export const FUERZA_TIPICA: CasoFuerza = {
  procedencia: 'ejecución 162 · asignación 349 · atleta 64',
  ejercicio: 'Back Squat',
  series: 4,
  serieActual: 3,
  reps: 5,
  cargaKg: 100,
  descansoS: 90,
  // FC media 95, máxima 122: una sesión entera de sentadilla vive muy abajo.
  fcDesde: 95,
  fcHasta: 122,
};

/**
 * Ejecución 171 · plantilla 503 · 4×10 a 82,5 kg — y **sin FC ninguna**:
 * `avg_hr` y `max_hr` son NULL. El caso mínimo de la fuerza: el reloj no midió
 * ni el pulso, así que en la muñeca sólo queda el tiempo y lo que tú declares.
 */
export const FUERZA_SIN_FC: CasoFuerza = {
  procedencia: 'ejecución 171 · plantilla 503 · atleta 72',
  ejercicio: 'Back Squat',
  series: 4,
  serieActual: 2,
  reps: 10,
  cargaKg: 82.5,
  descansoS: 90,
  fcDesde: null,
  fcHasta: null,
};

/**
 * Plantilla 442, bloque «Fuerza»: `Reverse Lunge` llega con CUATRO series y 30
 * kg y **sin repeticiones**. Así está en producción, y es el hueco conocido del
 * método (~38 % de la biblioteca sin dosis) llegando hasta la muñeca.
 *
 * Se pinta la carga sola. Jamás un «— reps» ni un 0: eso sería fabricar la
 * mitad de una dosis que el coach no escribió (§7).
 */
export const FUERZA_DOSIS_NULA: CasoFuerza = {
  procedencia: 'plantilla 442 · asignación 240 · atleta 67',
  ejercicio: 'Reverse Lunge',
  series: 4,
  serieActual: 2,
  reps: null,
  cargaKg: 30,
  descansoS: 60,
  // FC de la ejecución 103 de ese mismo circuito: media 138, máxima 171.
  fcDesde: 138,
  fcHasta: 171,
};

/**
 * El RIR y el RPE no se registran NUNCA: son NULL en las 56 filas de
 * `set_executions` de la base. Y el descanso ejecutado sólo aparece en 12 de
 * esas 56, siempre con el mismo 90. Los descansos PRESCRITOS que existen de
 * verdad son 60 s (×20), 90 s (×11), 40 s (×4), 120 s (×4) y 15 s (×2).
 */
export const FUERZA_HUECOS = {
  rirRegistrado: 0,
  rpeRegistrado: 0,
  setsConDescanso: 12,
  setsTotales: 56,
} as const;

// ---------------------------------------------------------------------------
// (6) EMOM / INTERVAL — ejecución 177 · atleta 64
// ---------------------------------------------------------------------------

/**
 * Plantilla 506, «EMOM · 2 movimientos»: ski y bici alternos, 20 rondas
 * prescritas de 45 s de trabajo y 15 de parada. Se completaron 10 (paró a
 * mitad), FC media 140 y máxima 156, 652 s en total.
 *
 * EL HECHO ESTRUCTURAL, y decide la vista: **todo el EMOM es UNA SOLA fila de
 * `segment_executions`**, con la modalidad en «other» y sin separar el ski de
 * la bici. No hay pulso por ronda, ni tarea por ronda, ni nada contado dentro
 * del minuto: sólo el agregado y el contador de rondas. Así que el «10 de 12
 * cal» que pide el §10.6 no sale de la ejecución — o lo repite el móvil desde
 * la máquina en vivo, o no existe.
 */
export const EMOM = {
  procedencia: 'ejecución 177 · asignación 358 · atleta 64',
  rondas: 20,
  actual: 7,
  trabajoS: 45,
  paradaS: 15,
  /** Los dos movimientos, alternos por ronda. */
  movimientos: ['Ski', 'Bici'] as const,
  fcDesde: 140,
  fcHasta: 156,
} as const;

/**
 * Plantilla 462 · ejecución 90 — el otro EMOM que existe, y el único a pulso:
 * 10 rondas de 60 s alternando 10 repeticiones de un movimiento funcional con
 * 60 s de carrera. Se abandonó a los 16 s con las rondas en NULL.
 *
 * Sirve para lo que ninguna máquina enseña: una ronda de burpees es el modo
 * `ciego` puro — ni miras ni tocas, y el reloj no puede contar nada.
 */
export const EMOM_A_PULSO = {
  procedencia: 'plantilla 462 · ejecución 90 · atleta 64',
  rondas: 10,
  actual: 4,
  ventanaS: 60,
  tarea: '10 burpees',
  fcDesde: 148,
  fcHasta: 166,
} as const;

// ---------------------------------------------------------------------------
// (7) FOR TIME — ejecución 59 · atleta 67
// ---------------------------------------------------------------------------

/**
 * Plantilla 441, 16 estaciones. La ejecución 59 marcó **4.380 s = 73:00
 * clavados** … y CERO `segment_executions`. Ni un parcial. El otro intento (la
 * 66) capturó 3 de 23 segmentos y se abandonó.
 *
 * Es decir: **lo más completo que existe de un For Time en toda la base es el
 * tiempo final.** Eso es lo que la muñeca puede prometer, y por eso el sujeto
 * de esta vista es el crono y los parciales son aspiración.
 *
 * (Y un dato que se venía asumiendo mal: las plantillas 441 y 446 tienen
 * `format='circuit'`, no `'hyrox_sim'`. Las que sí llevan `hyrox_sim` —433,
 * 454, 94, 342— no se han asignado nunca.)
 */
export const FORTIME = {
  procedencia: 'ejecución 59 · asignación 244 · atleta 67',
  cronoFinalS: 4_380,
  estaciones: 16,
  /** Segundo en el que arranca la reproducción: ya metido en faena. */
  desdeS: 2_480,
} as const;

/**
 * Las 16 estaciones de la plantilla 441, con su dosis tal cual está guardada y
 * el peso relativo con el que se dibujan en el bisel. El peso es una ESTIMACIÓN
 * de duración, no un dato: sirve para que el aro tenga forma, y por eso no se
 * escribe en pantalla como si fuera un tiempo.
 */
export interface EstacionFortime {
  nombre: string;
  dosis: string;
  /** Peso en el aro (segundos estimados). */
  peso: number;
  /** ¿Lo mide el reloj? Sólo los tramos de carrera al aire libre. */
  loMideElReloj: boolean;
}

export const RUTA_FORTIME: readonly EstacionFortime[] = [
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'SkiErg', dosis: '1.000 m', peso: 240, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Sled Push', dosis: '50 m · 152 kg', peso: 180, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Sled Pull', dosis: '50 m · 103 kg', peso: 210, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Burpee Broad Jump', dosis: '80 m', peso: 240, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Rowing', dosis: '1.000 m', peso: 240, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Farmers Carry', dosis: '200 m · 24 kg', peso: 150, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Sandbag Lunges', dosis: '100 m · 20 kg', peso: 240, loMideElReloj: false },
  { nombre: 'Run', dosis: '1,00 km', peso: 270, loMideElReloj: true },
  { nombre: 'Wall Balls', dosis: '100 reps · 6 kg', peso: 300, loMideElReloj: false },
];

// ---------------------------------------------------------------------------
// (8) AMRAP — NO EXISTE en la base
// ---------------------------------------------------------------------------

/**
 * Cero plantillas con formato AMRAP, y `score_rounds` / `score_reps` en NULL en
 * las 77 ejecuciones sin una sola excepción: **la app no sabe guardar una
 * ronda.** La ventana de 12 min y las tareas son, por tanto, una propuesta.
 *
 * Lo que NO es propuesta es la regla: la ronda no la mide nadie. La declara el
 * atleta con un toque, y por eso ésta es la única de las nueve vistas donde la
 * franja de acción se gana estar siempre — el momento de tocar llega sin aviso.
 */
export const AMRAP = {
  procedencia: 'propuesta · el AMRAP no existe en el modelo de datos',
  ventanaS: 720,
  tarea: '10 wall balls · 15 cal remo',
  /** Los últimos segundos, que es cuando el reloj sirve de verdad. */
  restanteFinalS: 39,
  rondasAlFinal: 9,
  fcDesde: 168,
  fcHasta: 174,
} as const;

// ---------------------------------------------------------------------------
// (9) DOBLES — nunca se han corrido en vivo
// ---------------------------------------------------------------------------

/**
 * `dobles_live_status` tiene CERO filas: el relevo en vivo no se ha usado
 * nunca. Y de las 27 carreras de dobles reales se guardan el crono y ocho
 * parciales **de equipo** — sin reparto por atleta y sin tiempos de cambio.
 *
 * Consecuencia, y es la que ordena la vista: **«sales en ~40 s» no se puede
 * calcular con nada de lo que hay hoy.** Sólo existe si el móvil tiene
 * emparejada la máquina en la que está tu pareja y puede ver cuánto le queda.
 * Sin eso, lo único honesto que la muñeca puede enseñar mientras esperas es tu
 * propio pulso bajando.
 */
export const DOBLES = {
  procedencia: 'carreras de dobles reales · sin reparto por atleta ni cambios',
  pareja: 'tu pareja',
  /** Tu tramo del relevo. */
  tramoM: 500,
  desdeM: 320,
  /** Lo que le queda a tu pareja, cuando el móvil puede verlo. */
  esperaS: 40,
  fcTrabajo: 172,
  fcEsperaDesde: 172,
  fcEsperaHasta: 148,
} as const;

// ---------------------------------------------------------------------------
// (10) EL RELOJ DE PARED — `intervals`, `tabata`, `death_by` y `steady` cuando
//      la modalidad NO es ni correr ni ergo
// ---------------------------------------------------------------------------
//
// EL RECUENTO, medido contra producción el 5-ago-2026 y no contra la memoria:
//
//   · `intervals` (más su grafía antigua `interval`) — 74 líneas de prescripción
//     entre `template_segments` y `block_exercises`. De ésas, las FUNCIONALES,
//     que son las que se quedaron sin pantalla: bloques 79 y 493 (plancha
//     lateral), 402 y 403 (on/off por estación), 393 y las plantillas 91, 367 y
//     385 (fuerza-potencia cada 2'), y las plantillas 319, 329 y 335 (core).
//   · `steady` — 283 líneas. Funcionales: los calentamientos (409, 410), las
//     vueltas a la calma (411, 516) y los bloques de técnica de los tests de
//     pista (389, 447).
//   · `tabata` — **CERO.** Ni una línea con ese `scheme`, ni una mención en
//     ningún título ni en ninguna nota de toda la base.
//   · `death_by` — **CERO**, igual.
//
// Los dos que no existen se diseñan de todas formas (el atleta que se monte una
// tabata desde el constructor libre la tiene mañana), pero van MARCADOS y su
// estructura NO se la inventa nadie: sale del propio motor, que es el sitio
// donde ya estaba escrita.

/** El objetivo que gobierna el esfuerzo, tal cual lo escribió el coach. */
export interface ObjetivoPared {
  etiqueta: string;
  valor: string;
}

/**
 * El pulso de un caso: el rango medido y sobre cuántos segundos se reparte.
 * `null` cuando NO se midió, que aquí es lo normal — ver `PULSO_BURPEES`.
 */
export interface PulsoCaso {
  desde: number;
  hasta: number;
  /** Los segundos sobre los que la rampa recorre el rango entero. */
  sobreS: number;
}

/**
 * EL DATO INCÓMODO DE ESTA FAMILIA: **ninguno de los cuatro formatos se ha
 * ejecutado NUNCA con una modalidad funcional.** En `segment_executions`,
 * `intervals` sólo aparece con `run` y `row`, y `steady` con `run`, `row` y
 * `ski`; las tres filas de modalidad `functional` que hay no traen pulso.
 *
 * Consecuencia: los dos casos REALES de esta vista (la plancha y la movilidad)
 * se pintan SIN pulso, igual que `FUERZA_SIN_FC`. No es que el reloj no sepa
 * medirlo —lo mide siempre—: es que no hay ninguna ejecución que reproducir, y
 * fabricar una curva sería pintar una suposición con cara de medida (§7).
 */
const SIN_PULSO = null;

/**
 * El ÚNICO pulso real que existe en toda la base de un trabajo funcional
 * rotativo a pulso: la ejecución 90 de la plantilla 462 —10 rondas de 60 s a 10
 * burpees—, con 148 de media y 166 de máxima (el mismo caso del que ya tira
 * `EMOM_A_PULSO`).
 *
 * Se lo prestan la tabata y el death by, que son burpees igualmente y no tienen
 * ejecución propia. Es el mismo criterio que el ritmo de ergo del EMOM: con UN
 * dato real repetido al menos se sabe de dónde sale; con dos inventados, no.
 * Los 600 s de la rampa tampoco son de gusto — son lo que duró aquella sesión.
 */
const PULSO_BURPEES: PulsoCaso = {
  desde: EMOM_A_PULSO.fcDesde,
  hasta: EMOM_A_PULSO.fcHasta,
  sobreS: EMOM_A_PULSO.rondas * EMOM_A_PULSO.ventanaS,
};

/**
 * Bloques 79 y 493, «Side plank 4x40''/20''» — plancha lateral, 4 rondas de 40 s
 * de trabajo y 20 s de descanso, a peso corporal y sin ningún objetivo escrito.
 *
 * Es el `intervals` funcional CANÓNICO y por eso es el escenario mínimo: la
 * misma dosis en las cuatro rondas, el reloj corta, y no hay absolutamente nada
 * más que enseñar. (El bloque trae la línea dos veces, de 4 y de 6 rondas — una
 * por lado. La muñeca ve una cada vez.)
 */
export const INTERVALOS_CORE = {
  procedencia: "bloque 79 · «Side plank 4x40''/20''» · biblioteca del coach",
  /** `exercises.name` dice «Side Plank»; el atleta oye «plancha lateral». */
  movimiento: 'Plancha lateral',
  rondas: 4,
  /** La ronda en la que arranca la reproducción: metido en faena, que es cuando se mira. */
  rondaActual: 3,
  trabajoS: 40,
  descansoS: 20,
  objetivo: null as ObjetivoPared | null,
  pulso: SIN_PULSO as PulsoCaso | null,
} as const;

/**
 * Bloque 402, «Intervalos on/off por estación a ritmo de carrera (Semana 11)» —
 * cuatro estaciones (ski, remo, bici y trineo) a 3 rondas de 60 s / 60 s cada
 * una. La del TRINEO es la que cae aquí: las otras tres las mide el móvil por
 * BLE y se las llevan las vistas de ergo.
 *
 * Aporta lo que la plancha no tiene: un OBJETIVO escrito (`target` RPE 9). Es la
 * única diferencia entre dos intervalos, y por eso es lo que se gana el segundo
 * nivel — no el movimiento, que ya te lo sabes.
 */
export const INTERVALOS_ESTACION = {
  procedencia: 'bloque 402 · «Intervalos on/off por estación» · semana 11',
  movimiento: 'Empuje de trineo',
  rondas: 3,
  rondaActual: 2,
  trabajoS: 60,
  descansoS: 60,
  objetivo: { etiqueta: 'Empuja a', valor: 'RPE 9' } as ObjetivoPared | null,
  pulso: SIN_PULSO as PulsoCaso | null,
} as const;

/**
 * TABATA — cero casos en la biblioteca, así que la estructura NO se inventa: es
 * la del preajuste del propio constructor libre de la app
 * (`FreeFunctionalBuilder.swift`, `FreeEmomPreset.tabata`): ciclo de 30 s = 20 de
 * trabajo + 10 de cambio, 8 rondas. Su rótulo literal es «Tabata · 8 rondas ·
 * 20/10».
 *
 * Y ahí va un hallazgo que ordena la pantalla: **la app no guarda una tabata
 * como `tabata`.** El constructor la escribe como `emom` con otros números,
 * porque «20/10 × 8 ES esa estructura» (comentario del propio fichero). Por eso
 * el formato tiene cero filas y por eso la pantalla no puede colgar de que
 * alguien escriba `scheme: 'tabata'`: tiene que salir de la FORMA (ventanas
 * cortas con parada explícita), no del nombre.
 */
export const TABATA = {
  procedencia: 'propuesta · CERO casos; la estructura sale del preajuste de la app',
  movimiento: 'Burpees',
  rondas: 8,
  /** Desde la primera: en una tabata lo que se aguanta es llegar a la octava. */
  rondaActual: 1,
  trabajoS: 20,
  descansoS: 10,
  pulso: PULSO_BURPEES,
} as const;

/**
 * DEATH BY — cero casos, y otra vez la estructura sale del motor y no de mí:
 * `WorkoutModels.swift` fija `deathByStart = prescription.start ?? 1`,
 * `deathByIncrement = prescription.increment ?? 1` y la ventana en
 * `formatWorkSeconds ?? 60`. O sea: el minuto N pide N repeticiones.
 *
 * Los dos hechos del motor que decide esta pantalla (`WorkoutSession.swift`):
 *   · `deathByTarget = start + increment × rondasHechas` — LAS REPETICIONES DE
 *     ESTE MINUTO, que son el formato entero.
 *   · el minuto que se cumple solo cuenta como logrado; **lo único que acaba el
 *     bloque es que el atleta declare que falló** (`deathByFail`), y la
 *     puntuación es «rondas superadas».
 */
export const DEATH_BY = {
  procedencia: 'propuesta · CERO casos; arranque/incremento/minuto = defectos del motor',
  movimiento: 'Burpees',
  minutoS: 60,
  arranque: 1,
  incremento: 1,
  /** El minuto 7, o sea 7 repeticiones: ya se nota, y aún se llega. */
  rondaActual: 7,
  pulso: PULSO_BURPEES,
} as const;

/**
 * Bloque 409, «Calentamiento general» — movilidad de cadera, 300 s de una sola
 * ventana (`total_s`). Es el `steady` funcional tal cual está en la biblioteca,
 * y tiene diez hermanos con la misma forma: las vueltas a la calma (411 y 516,
 * con 300 s de foam roll y 180 s de respiración) y la técnica de carrera de los
 * tests de pista (389 y 447, 300 s).
 *
 * Una sola ventana, sin trocear, sin nada que declarar y sin nada que tocar: es
 * el caso donde la muñeca dice UNA cosa, y la pantalla entera es esa cosa.
 */
export const STEADY_FUNCIONAL = {
  procedencia: 'bloque 409 · «Calentamiento general» · biblioteca del coach',
  /** `exercises.name` dice «Hip mobility flow». */
  movimiento: 'Movilidad de cadera',
  /** Una sola ventana, así que la «ronda» siempre es la 1. */
  rondaActual: 1,
  ventanaS: 300,
  pulso: SIN_PULSO as PulsoCaso | null,
} as const;
