// EL HIERRO EN VIVO — el modelo POR SERIE, y el presupuesto del que sale la cara.
//
// POR QUÉ ESTE FICHERO EXISTE Y NO BASTABA `data.ts`. El modelo de julio dice
// que una prescripción de fuerza tiene UNA medida, UNA carga y UN descanso para
// todas sus series (`Prescripcion.reps`, `.cargaKg`). Contra la base de datos eso
// es falso en la mitad del corpus: la forma dominante del método es la PIRÁMIDE
// —6-6-4-4-3, 10-8-8-6-4, 10-10-8-8-6-4-12-10-10-8-8-6— y la carga llega tres
// veces de tres maneras distintas (kilos, banda de %RM, peso corporal). Con un
// solo par de campos, «6-6-4-4-3» solo se puede escribir mintiendo: «5×6».
//
// Y no es un caso de borde que se pueda dejar para después: de las 75
// prescripciones `sets` de la base, 37 tienen CINCO SERIES O MÁS (5, 6, 8, 10 y
// 12), o sea el 49 %. La mitad de la fuerza del corpus no entra en el modelo de
// julio ni cabe en el riel que se dibujó para cuatro.
//
// LOS EJES, y son independientes entre sí (cualquiera puede faltar):
//
//   medida      reps exactas | banda de reps (12-15) | ninguna
//   carga       kg | %RM (valor o banda) | peso corporal | ninguna
//   intensidad  RIR | RPE | ninguna  (de la serie, o heredada del ejercicio)
//   descanso    segundos | ninguno   (la ÚLTIMA serie no lleva: no se descansa
//                                     después de la última, y la base lo escribe
//                                     así — `rest_s` nulo en el último elemento)
//
// El eje que NO se mezcla con estos: lo que el atleta HIZO. En fuerza gobierna
// el atleta y la app no mide ni una repetición, así que nada pasa de prescrito a
// hecho sin que él lo diga (§7). Va en `SerieHecha`, aparte.

import {
  DEFAULT_VELOCITY_BAND_CUTS,
  velocityBand,
  velocityLossPct,
  type VelocityBand,
} from '@fahybrid/shared/domain/strength';
import { ANCHO_UTIL_PT, APOYOS_PT } from '../../kit-vivo';
// La grafía de un número y la de un peso ya existen en esta carpeta y no se
// reescriben aquí: `numeroTexto` (entero tal cual, decimal con coma) y `kg`
// (⚠️ declarado en `data.ts` como canónico que le falta a `datos-reales.ts`).
// Dos grafías del mismo kilo en la misma pantalla es como empezó el 29-jul.
import { kg, numeroTexto } from './data';

// ---------------------------------------------------------------------------
// Los ejes
// ---------------------------------------------------------------------------

/**
 * Cuánto se hace en una serie.
 *
 * `hasta` es el TECHO de una banda («12-15 reps»): el coach prescribe un margen
 * dentro del que el atleta autorregula, y enseñar solo el suelo le esconde media
 * prescripción. Nulo = la medida es exacta.
 */
export interface Medida {
  reps: number;
  hasta: number | null;
}

/**
 * Contra qué se hace. Las tres formas están en la base, tal cual:
 *
 *   kg          `{"kind":"kg","value":82.5}`                    plantilla 503
 *   porcentaje  `{"kind":"percent_rm","min":75,"max":85}`       bloque 392
 *   corporal    `{"kind":"bodyweight"}`                          plantilla 503
 *
 * Un porcentaje NO se convierte a kilos. La app no tiene el 1RM medido de este
 * atleta para este ejercicio, y resolver «75 % de tu máximo» inventando el
 * máximo sería mandarlo a levantar un peso que nadie ha pesado (§7). Se enseña
 * el porcentaje, y los discos los pone él.
 */
export type Carga =
  | { tipo: 'kg'; kg: number }
  | { tipo: 'porcentaje'; min: number; max: number | null }
  | { tipo: 'corporal' };

/** Lo que el COACH pide de esfuerzo. Lo que el atleta sintió es otra cosa. */
export interface Intensidad {
  tipo: 'rir' | 'rpe';
  valor: number;
}

/** Una serie, tal y como la escribió el coach. Cualquier eje puede faltar. */
export interface SeriePrescrita {
  medida: Medida | null;
  carga: Carga | null;
  /** De la serie. Cuando falta, se hereda la del ejercicio al leerla. */
  intensidad?: Intensidad | null;
  /** Segundos. Nulo = esta serie no lleva descanso escrito (la última nunca). */
  descansoS: number | null;
}

/**
 * LO ÚNICO QUE LA APP MIDE DEL LEVANTAMIENTO — la velocidad de la barra.
 *
 * Todo lo demás de esta pantalla es prescripción (lo que pidió el coach) o
 * declaración (lo que dijo el atleta). Esto no: lo mide el reloj en la muñeca
 * (`ios/FAHYBRIK/Sensor/BarVelocityEstimator.swift` → `MirrorWire` →
 * `set_executions.mean_velocity_*`, migración 0176).
 *
 * Se guardan la PRIMERA y la ÚLTIMA repetición porque son dos preguntas
 * distintas: la última dice a qué velocidad va la barra AHORA, y las dos juntas
 * dicen cuánto has perdido dentro de la serie. La pérdida no se guarda hecha —
 * la calcula `velocityLossPct` del dominio compartido, para que el doble no
 * pueda dar un número distinto del que dará la app.
 *
 * `confianza` es del estimador [0,1]. Por debajo del corte NO se enseña una
 * cifra: un «rojo con aplomo» sobre una medida que no se sostiene es peor que no
 * medir (§7). El corte y las bandas son MÉTODO del coach — viven en
 * `shared/domain/strength/velocity-bands.ts` con sus defectos editables, y aquí
 * no se reescribe ni uno.
 */
export interface Velocidad {
  /** m/s de la concéntrica de la ÚLTIMA repetición de la serie. */
  msUltima: number;
  /** m/s de la PRIMERA. Nula = no se pudo medir, y entonces no hay pérdida. */
  msPrimera: number | null;
  confianza: number;
}

/**
 * Lo que el atleta declaró de una serie. `estado` es el del motor
 * (`SetRecord.status`): una serie cerrada tal cual está `hecha`; con la dosis
 * cambiada, `ajustada`; y `saltada` es un cierre legítimo que no es un cero.
 */
export interface SerieHecha {
  reps: number | null;
  carga: Carga | null;
  /** Lo que SINTIÓ. Nulo = no lo dijo, y no se rellena con el del coach. */
  rirSentido: number | null;
  estado: 'hecha' | 'ajustada' | 'saltada';
  /** Lo que MIDIÓ el sensor. Ausente = no había sensor, o no fue fiable. */
  velocidad?: Velocidad | null;
}

/** El ejercicio que tienes delante, con su sitio en la sesión. */
export interface Ejercicio {
  /** De dónde sale el dato, para poder auditarlo contra la base. */
  procedencia: string;
  /** `block_title` — cómo llamó el coach al bloque. */
  bloque: string;
  /** El ejercicio: `exercises.name`. */
  nombre: string;
  /** Dónde va este ejercicio dentro del bloque, para el cromo. */
  posicion: { i: number; de: number };
  /**
   * Con qué se hace. **Hueco del modelo de datos**: `exercises` no tiene columna
   * de material, así que solo se puede afirmar «barra» en los ejercicios que son
   * de barra por definición. Nulo = no se sabe → no se dibujan discos.
   */
  implemento: 'barra' | null;
  /** La intensidad del EJERCICIO, que la serie puede pisar. */
  intensidad: Intensidad | null;
  series: readonly SeriePrescrita[];
  /** Qué viene después en el entreno. Nulo = este era el último. */
  siguiente: string | null;
}

/** La intensidad que manda en una serie: la suya, y si no, la del ejercicio. */
export function intensidadDe(ej: Ejercicio, i: number): Intensidad | null {
  const s = ej.series[i];
  return s?.intensidad ?? ej.intensidad;
}

// ---------------------------------------------------------------------------
// Las grafías — un solo sitio (§2.1), y ninguna se recompone en una vista
// ---------------------------------------------------------------------------

/** El signo de multiplicar es U+00D7, no una equis (`Formato.signoPor`). */
const POR = '×';

/**
 * El rango de un porcentaje, SIN unidad: «75-85» · «70». Un techo que no supera
 * al suelo no abre banda y no se escribe como si lo hiciera (§7).
 */
function rangoTexto(c: { min: number; max: number | null }): string {
  return c.max != null && c.max > c.min ? `${c.min}-${c.max}` : String(c.min);
}

/** «82,5 kg» · «75-85 %» · «peso corporal». Nula = no hay carga escrita. */
export function cargaTexto(c: Carga | null | undefined): string | null {
  if (!c) return null;
  if (c.tipo === 'kg') return kg(c.kg);
  if (c.tipo === 'corporal') return 'peso corporal';
  return `${rangoTexto(c)} %`;
}

/** «12-15» · «10». Nula = la prescripción no trae medida (§7: ni un cero). */
export function medidaTexto(m: Medida | null | undefined): string | null {
  if (!m) return null;
  return m.hasta != null && m.hasta > m.reps ? `${m.reps}-${m.hasta}` : String(m.reps);
}

export interface Cifra {
  cifra: string;
  unidad: string | null;
  /** El segundo peldaño del numeral, cuando la carga no cabe en la cifra. */
  segundo: { cifra: string; unidad: string } | null;
}

/**
 * LA SERIE QUE TIENES DELANTE, repartida en los peldaños del numeral.
 *
 * «10 × 82,5» + «kg» es UNA cosa y así se lee: repeticiones y luego carga, que
 * es como se piensa una serie. No se parte —de que quepa se encarga el
 * presupuesto de ancho de `Numeral` (§10.2)— y esto vale para los KILOS.
 *
 * Con un PORCENTAJE no vale: «6 × 75-85» se lee como kilos y no lo son. Ahí la
 * cifra son las repeticiones y el porcentaje baja al segundo peldaño con su
 * unidad entera («% de tu máximo»), que es la única forma de que no mienta.
 *
 * Con peso corporal la carga no es un número: no ocupa peldaño y se dice abajo,
 * junto al nombre. Y sin medida ni carga no hay cifra que inventar → nula, y
 * entonces el sujeto es el NOMBRE del ejercicio.
 */
export function cifraDeSerie(s: SeriePrescrita | undefined): Cifra | null {
  if (!s) return null;
  const reps = medidaTexto(s.medida);
  const c = s.carga;

  if (reps && c?.tipo === 'kg') {
    return { cifra: `${reps} ${POR} ${numeroTexto(c.kg)}`, unidad: 'kg', segundo: null };
  }
  if (reps && c?.tipo === 'porcentaje') {
    return { cifra: reps, unidad: 'reps', segundo: { cifra: rangoTexto(c), unidad: '% de tu máximo' } };
  }
  if (reps) return { cifra: reps, unidad: 'reps', segundo: null };
  // Sin medida pero con kilos: el `Reverse Lunge` real del coach llega con 30 kg
  // y ninguna repetición. La carga sola es la cifra.
  if (c?.tipo === 'kg') return { cifra: numeroTexto(c.kg), unidad: 'kg', segundo: null };
  return null;
}

/** La misma serie en una línea, para un peldaño del riel o un cierre. */
export function serieEnLinea(s: SeriePrescrita | undefined): string | null {
  const cifra = cifraDeSerie(s);
  if (!cifra) return null;
  return cifra.unidad === 'kg' ? `${cifra.cifra} kg` : cifra.cifra;
}

/** Lo que se registró de una serie cerrada, para su peldaño. */
export function hechaEnLinea(h: SerieHecha): string | null {
  if (h.estado === 'saltada') return 'saltada';
  const peso = h.carga?.tipo === 'kg' ? h.carga.kg : null;
  if (h.reps != null && peso != null) return `${h.reps} ${POR} ${numeroTexto(peso)} kg`;
  if (h.reps != null) return String(h.reps);
  return peso != null ? kg(peso) : null;
}

// ---------------------------------------------------------------------------
// La velocidad, dicha — el semáforo es del dominio, no de la pantalla
// ---------------------------------------------------------------------------

/**
 * La banda de la última repetición. La resuelve `velocityBand` del dominio
 * compartido con sus cortes por defecto (0,55 · 0,40 · 0,25 m/s) y su mínimo de
 * confianza: **aquí no se escribe ni un umbral**. Son método del coach y el día
 * que los edite, el doble y la app se mueven juntos.
 */
export function bandaDe(v: Velocidad | null | undefined): VelocityBand {
  if (!v) return 'none';
  return velocityBand(v.msUltima, v.confianza, DEFAULT_VELOCITY_BAND_CUTS);
}

/** «0,42» — dos decimales con coma, igual que `VelocityLiveReading.mpsText`. */
export function msTexto(ms: number): string {
  return ms.toFixed(2).replace('.', ',');
}

/**
 * Lo que has perdido dentro de la serie, en %. Nula cuando no hay primera
 * repetición medida o cuando la pérdida es despreciable — medio punto de
 * porcentaje no es fatiga, es el ruido del estimador (mismo corte que
 * `VelocityLiveReading.lossText`).
 */
export function perdidaPct(v: Velocidad | null | undefined): number | null {
  if (!v || v.msPrimera == null) return null;
  const pct = velocityLossPct(v.msPrimera, v.msUltima);
  return pct > 0.5 ? pct : null;
}

/**
 * El tono del semáforo. Espeja el mapa del Swift shipeado
 * (`VelocidadBarraChip`): verde `ok`, amarillo `warning`, naranja el acento de
 * marca y rojo `danger`.
 *
 * El naranja de acento en una banda es una excepción al §9.1 —que lo reserva
 * para el instante en que algo se logra— y se hereda a propósito: la app ya la
 * pinta así y dos semáforos distintos para el mismo dato es peor que una
 * excepción declarada.
 */
export const TONO_BANDA: Record<VelocityBand, string> = {
  green: 'var(--twin-ok)',
  yellow: 'var(--twin-warning)',
  orange: 'var(--twin-accent)',
  red: 'var(--twin-danger)',
  none: 'var(--twin-muted)',
};

/**
 * Cómo se llama cada banda, de cara al atleta. El vocabulario es el del Swift
 * (`VelocityBand.label`) y dice lo que la app puede afirmar: si la barra va
 * rápida o lenta. **No dice un %1RM** — eso lo interpreta el atleta con su coach,
 * y es la línea de la casa entre mecanismo y método.
 */
export const ETIQUETA_BANDA: Record<VelocityBand, string> = {
  green: 'rápida',
  yellow: 'media',
  orange: 'lenta',
  red: 'muy lenta',
  none: '',
};

/** «RIR 2 · deja 2 dentro» — el número solo no dice qué hacer. */
export function pastillaIntensidad(x: Intensidad | null): string | null {
  if (!x) return null;
  if (x.tipo === 'rpe') return `RPE ${numeroTexto(x.valor)}`;
  return x.valor === 0 ? 'RIR 0 · hasta el fallo' : `RIR ${x.valor} · deja ${x.valor} dentro`;
}

// ---------------------------------------------------------------------------
// EL PRESUPUESTO DEL RIEL — de aquí sale la ventana, y no de una preferencia
// ---------------------------------------------------------------------------
//
// El riel de series es la lista de esta familia, y su problema no es el de la
// lista de rondas: no crece hacia ABAJO (es una fila), crece hacia DENTRO. Con
// doce series cada peldaño se queda en 26 pt y ahí no cabe ni «S12», así que lo
// que se pierde no es el alto de la pantalla: es la legibilidad de lo único que
// dice cómo fueron las series anteriores.

/** Lo que mide un avance de la monoespaciada, en fracción de su tamaño. */
const AVANCE_MONO = 0.6;
/** El tamaño al que se escribe la dosis de un peldaño. */
const DOSIS_PX = 11;
/** «10 × 82,5» — la dosis más larga que sale del corpus real, en glifos. */
const GLIFOS_DOSIS = 10;
/** Relleno horizontal del peldaño y hueco entre peldaños. */
const RELLENO_PELDANO_PT = 8;
const HUECO_PELDANO_PT = 6;

/** Lo que necesita un peldaño para decir su dosis sin encogerla. */
export const ANCHO_PELDANO_PT = Math.ceil(GLIFOS_DOSIS * AVANCE_MONO * DOSIS_PX) + RELLENO_PELDANO_PT;

/** Cuántos peldaños con dosis caben a lo ancho del lienzo. Cuatro. */
export const CABEN_CON_DOSIS = Math.floor(
  (ANCHO_UTIL_PT + HUECO_PELDANO_PT) / (ANCHO_PELDANO_PT + HUECO_PELDANO_PT)
);

/**
 * A partir de aquí el riel se convierte en VENTANA. No es un número elegido: es
 * el primero que no cabe — y es exactamente el 49 % del corpus.
 *
 * Y la ventana, y no el contador de `vivo-rondas`: las rondas de un metcon son
 * HOMOGÉNEAS (la 12 repite la 11) y colapsarlas concentra; las series de fuerza
 * son HETEROGÉNEAS —6-6-4-4-3— y colapsarlas destruye la única cosa que el riel
 * sabe decir. Para lo heterogéneo la respuesta ya estaba escrita el 10-ago y es
 * la de las estaciones: la ventana alrededor del cursor.
 */
export const UMBRAL_VENTANA = CABEN_CON_DOSIS + 1;

/** La ventana: la cerrada de antes, la de ahora y la que viene. */
export const VENTANA = 3;

/**
 * Los índices que pinta el riel. Con pocas series, todas; desde el umbral, la
 * ventana pegada al cursor —y en los extremos se desplaza en vez de encogerse,
 * o la primera y la última serie tendrían dos peldaños en vez de tres.
 */
export function peldanosVisibles(total: number, activa: number): number[] {
  if (total < UMBRAL_VENTANA) return Array.from({ length: total }, (_, i) => i);
  const inicio = Math.min(Math.max(0, activa - 1), Math.max(0, total - VENTANA));
  return Array.from({ length: Math.min(VENTANA, total) }, (_, k) => inicio + k);
}

// ---------------------------------------------------------------------------
// LA CASCADA DE APOYOS — 213 pt, y cuatro cosas que quieren entrar
// ---------------------------------------------------------------------------
//
// El hueco de los apoyos lo deriva `kit-vivo` del reparto del marco. Lo que
// quiere vivir ahí, por orden de prioridad y con lo que mide cada uno:

/** El riel de series: un peldaño de dos líneas con su marca. */
const ALTO_RIEL_PT = 48;
/**
 * Y su cabecera, que solo existe cuando el riel es VENTANA: si se están
 * enseñando tres de doce series, hay que decir que son tres de doce o el atleta
 * cree que su ejercicio tiene tres. Con las cuatro a la vista no hay nada que
 * declarar y la cabecera no se paga.
 */
const ALTO_CABECERA_PT = 20;
/** La fila de apoyos: `t-readout-s` (22) + etiqueta + relleno de 10 y 10. */
const ALTO_FILA_PT = 60;
/** La barra cargada: los discos (54) más su línea de «por lado · barra de 20». */
const ALTO_BARRA_PT = 78;
/** La lectura de la velocidad: una frase de dos líneas a 12 px. */
const ALTO_LECTURA_PT = 34;
/** El chip de lo que viene después de este ejercicio. */
const ALTO_SIGUIENTE_PT = 40;
/** Hueco entre apoyos (`MarcoVivo` los apila con 8). */
const HUECO_APOYO_PT = 8;

export interface Cascada {
  riel: boolean;
  fila: boolean;
  /** La frase de la velocidad perdida. Solo existe con la serie ya cerrada. */
  lectura: boolean;
  barra: boolean;
  siguiente: boolean;
}

/**
 * Qué entra en los apoyos, por prioridad y con el presupuesto real.
 *
 * El orden no es estético: el RIEL dice dónde vas y cómo fueron las anteriores
 * (sin él la pantalla no sitúa), la FILA lleva el pulso, la pausa y la velocidad
 * (lo medido), la LECTURA interpreta lo que acabas de hacer, la BARRA convierte
 * «82,5 kg» en los discos que hay que coger, y LO SIGUIENTE es contexto que se
 * puede mirar al acabar. Por eso, cuando hay discos que poner, lo que se cae es
 * lo siguiente.
 *
 * La barra y la lectura no compiten nunca, y no por suerte: los discos se miran
 * mientras cargas —cara de trabajo— y la pérdida de velocidad se lee con la
 * serie ya cerrada —cara de descanso—. Es la misma ranura contestando a «¿qué
 * haces AHORA?», y los dos anclajes de arriba no se mueven.
 *
 * Se calcula en vez de maquetarse a ojo porque es lo que el 10-ago dejó EMPEZAR
 * fuera de pantalla: la ranura del vivo no scrollea, así que lo que no cabe no
 * se recorta — EMPUJA.
 */
export function cascada(quiere: {
  ventana: boolean;
  lectura: boolean;
  barra: boolean;
  siguiente: boolean;
}): Cascada {
  const salida: Cascada = { riel: false, fila: false, lectura: false, barra: false, siguiente: false };
  let gastado = 0;
  const cabe = (alto: number) => {
    const con = gastado === 0 ? alto : gastado + HUECO_APOYO_PT + alto;
    if (con > APOYOS_PT) return false;
    gastado = con;
    return true;
  };
  salida.riel = cabe(ALTO_RIEL_PT + (quiere.ventana ? ALTO_CABECERA_PT : 0));
  salida.fila = cabe(ALTO_FILA_PT);
  if (quiere.lectura) salida.lectura = cabe(ALTO_LECTURA_PT);
  if (quiere.barra) salida.barra = cabe(ALTO_BARRA_PT);
  if (quiere.siguiente) salida.siguiente = cabe(ALTO_SIGUIENTE_PT);
  return salida;
}

// ---------------------------------------------------------------------------
// LOS TRES CASOS REALES — la escalera de series que hay en la base
// ---------------------------------------------------------------------------
//
// Verbatim de `prescription_json`, leído por psql en la rama principal. Se
// eligieron los tres que cubren los ejes enteros: la serie plana con kilos, la
// pirámide con banda de %RM, y la que no cabe en el riel. Ninguno está
// inventado y ninguno se ha redondeado para que luciera mejor.

/**
 * `template_segments` 2714 · plantilla 503 «Fuerza · Back Squat».
 * Cuatro series de 10 a 82,5 kg con 90 s de descanso. Es el caso de la captura
 * del 11-ago: 4×10, descanso 1:30.
 */
export const SQUAT_4X10: Ejercicio = {
  procedencia: 'plantilla 503 · segmento 2714',
  bloque: 'Fuerza · Back Squat',
  nombre: 'Back Squat',
  posicion: { i: 1, de: 3 },
  implemento: 'barra',
  intensidad: null,
  siguiente: 'Bulgarian Split Squat',
  series: Array.from({ length: 4 }, (_, i) => ({
    medida: { reps: 10, hasta: null },
    carga: { tipo: 'kg' as const, kg: 82.5 },
    // El descanso es de la SERIE, y la última no lleva: no se descansa después
    // de la última. La base lo escribe así y la pantalla lo respeta.
    descansoS: i === 3 ? null : 90,
  })),
};

/**
 * `blocks` 392 · «Fuerza inferior PESADA (Perfil Fuerza)», la fila del squat.
 * Cinco series **6-6-4-4-3** al **75-85 %** con 2:30 de descanso. El `notes` del
 * bloque lo escribe igual: «5 rounds Back Squat 6/6/4/4/3 @75-85% / 2'30" rest».
 *
 * Es el caso que rompe el modelo de julio: cada serie tiene SU medida, la carga
 * es una banda de porcentaje y no hay ni un kilo escrito en ningún sitio.
 */
export const SQUAT_PIRAMIDE: Ejercicio = {
  procedencia: 'bloque 392 · «Fuerza inferior PESADA»',
  bloque: 'Fuerza inferior pesada',
  nombre: 'Back Squat',
  posicion: { i: 1, de: 4 },
  implemento: 'barra',
  intensidad: null,
  siguiente: 'Bulgarian Split Squat',
  series: [6, 6, 4, 4, 3].map((reps, i, todas) => ({
    medida: { reps, hasta: null },
    carga: { tipo: 'porcentaje' as const, min: 75, max: 85 },
    descansoS: i === todas.length - 1 ? null : 150,
  })),
};

/**
 * `blocks` 501 · «6r Pull ups», la fila del fondo lastrado.
 * **Doce series** 10-10-8-8-6-4-12-10-10-8-8-6, sin carga escrita y sin
 * descanso. Es el ejercicio más largo del corpus y el que demuestra que el riel
 * de cuatro peldaños no era una elección: era el único caso que se probó.
 */
export const DIP_12: Ejercicio = {
  procedencia: 'bloque 501 · «6r Pull ups»',
  bloque: 'Fuerza superior',
  nombre: 'Weighted dip',
  posicion: { i: 2, de: 2 },
  implemento: null,
  intensidad: null,
  siguiente: null,
  series: [10, 10, 8, 8, 6, 4, 12, 10, 10, 8, 8, 6].map((reps) => ({
    medida: { reps, hasta: null },
    carga: null,
    descansoS: null,
  })),
};

/**
 * LA VELOCIDAD DEL SQUAT, SERIE A SERIE — **FABRICADA, y declarada**.
 *
 * No hay de dónde sacarla: las columnas nacieron hoy (migración 0176) y las 88
 * ejecuciones de la base tienen las cinco a nulo. Inventar una lectura sería
 * exactamente lo que el §7 prohíbe si la pantalla la presentara como medida — así
 * que se fabrica AQUÍ, una vez, con su nota, igual que `vivo-rondas` hizo con los
 * parciales de sus rondas. La PRESCRIPCIÓN de arriba sigue siendo real.
 *
 * Y no son tres números al azar: cuentan la historia que hace útil el dato. La
 * serie 1 sale «media», la 2 se cae a «lenta» perdiendo un 31 % dentro de la
 * serie, **por eso** el atleta baja a 77,5 kg en la 3 — y la 3 vuelve a «media».
 * Si la pantalla enseña bien la velocidad, esa decisión se lee sin explicarla.
 */
export const VELOCIDAD_SQUAT: readonly Velocidad[] = [
  { msPrimera: 0.62, msUltima: 0.49, confianza: 0.78 },
  { msPrimera: 0.55, msUltima: 0.38, confianza: 0.74 },
  { msPrimera: 0.6, msUltima: 0.47, confianza: 0.8 },
  { msPrimera: 0.58, msUltima: 0.44, confianza: 0.76 },
];

/**
 * Y la del fondo lastrado: medida con **poca confianza**. También fabricada, y
 * también con motivo — un dip tiene un recorrido y un patrón que el estimador
 * lee peor que una sentadilla, así que es el caso donde el sensor está puesto y
 * la app tiene que decir que no se fía en vez de pintar un número.
 */
export const VELOCIDAD_DUDOSA: Velocidad = { msPrimera: 0.51, msUltima: 0.34, confianza: 0.31 };

/**
 * Las `n` primeras series cerradas, tal y como las cierra un atleta que no toca
 * nada: con lo que estaba escrito. Es el estado NORMAL —cerrar cuesta un toque y
 * ajustar es la excepción— y el RIR sentido llega vacío porque no se le ha
 * preguntado (§7: no se copia el del coach).
 *
 * `ajustes` es para las series que sí se tocaron: en el caso de la última serie
 * del squat el atleta bajó a 77,5 kg, y eso es exactamente lo que hay que ver en
 * el riel antes de decidir la siguiente.
 */
export function cerradasHasta(
  ej: Ejercicio,
  n: number,
  ajustes: Record<number, Partial<SerieHecha>> = {},
  /** Lo que midió el sensor en cada una. Ausente = no había sensor. */
  velocidades?: readonly Velocidad[]
): Record<number, SerieHecha> {
  const salida: Record<number, SerieHecha> = {};
  for (let i = 0; i < Math.min(n, ej.series.length); i++) {
    const s = ej.series[i];
    salida[i] = {
      reps: s.medida?.reps ?? null,
      carga: s.carga,
      rirSentido: null,
      estado: 'hecha',
      velocidad: velocidades?.[i] ?? null,
      ...ajustes[i],
    };
  }
  return salida;
}

export const CASOS: Record<string, Ejercicio> = {
  'squat-4x10': SQUAT_4X10,
  'squat-piramide': SQUAT_PIRAMIDE,
  'doce-series': DIP_12,
};

// ---------------------------------------------------------------------------
// El guion del vivo
// ---------------------------------------------------------------------------

/** El doble avanza 4 s de entreno por segundo real, igual que `vivo-rondas`. */
export const SIM_X = 4;

/**
 * El pulso del hierro. Los dos extremos son MEDIDOS: la ejecución 162 de la
 * asignación del back squat dio máximo 122 ppm y media 95. Un squat no saca a
 * este atleta de la zona 1, así que el lienzo se tiñe de calma porque lo dice el
 * dato y no porque quede bien.
 *
 * Sube mientras levantas y cae en cuanto sueltas, con la constante de una
 * recuperación normal.
 */
const PULSO = { arriba: 122, abajo: 95, tauS: 28 } as const;

export function pulsoEnDescanso(segundos: number): number {
  const { arriba, abajo, tauS } = PULSO;
  return Math.round(abajo + (arriba - abajo) * Math.exp(-Math.max(0, segundos) / tauS));
}

export function pulsoLevantando(): number {
  return PULSO.arriba;
}

/** Hay reloj en la muñeca. Sin él no hay pulso, ni zona, ni tinte (§7). */
export const CON_RELOJ = true;
