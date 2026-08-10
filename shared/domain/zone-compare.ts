// @fahybrid/shared/domain/zone-compare — DOS PERIODOS, UNO AL LADO DEL OTRO.
//
// La petición literal del coach: «un feedback comparativo de los tres meses
// previos contra los tres conmigo». No es una gráfica más: es la misma materia
// prima (los segundos por zona de sus tramos) contando otra cosa — qué cambió
// entre dos trozos de calendario.
//
// LAS DOS VENTANAS MIDEN LO MISMO, Y ESO NO ES UNA COMODIDAD
// ----------------------------------------------------------
// Se guarda UN `weeks` para las dos. Catorce semanas le ganan a diez siempre, así
// que comparar ventanas de distinta longitud haría que el titular («+18 horas»)
// dijera algo que no es: diría que el calendario es más largo, no que el atleta
// entrenó más. Con la misma longitud, las horas totales vuelven a ser comparables
// y el reparto en porcentaje lo era ya.
//
// LO QUE NO SE COMPARA POR SÍ SOLO ES LA COBERTURA
// ------------------------------------------------
// Trece semanas con dato contra cuatro con dato no es una comparación, y las dos
// caben en la misma ventana de trece. Por eso cada lado viaja con
// `weeks_with_data` y la pantalla lo dice en voz alta: sin eso, un atleta que
// conectó el reloj a mitad del periodo parecería haber triplicado su volumen.
//
// EL ORDEN IMPORTA Y NO SE SOLAPAN
// --------------------------------
// `a` es el ANTES y `b` el DESPUÉS, y entre el final de `a` y el arranque de `b`
// no puede haber ni una semana compartida: con solape, las mismas horas se
// contarían en los dos lados y el delta se comería a sí mismo.

import type { HrAnchorSource } from './methodology';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from './dates';
import { esLunesIso, finDeVentana } from './zone-chart';

// ---------------------------------------------------------------------------
// Los límites de la pieza
// ---------------------------------------------------------------------------

/**
 * Menos de un mes por lado no es un periodo: es una racha. Y por arriba, seis
 * meses por lado son un año de calendario en una sola pantalla, que ya es todo
 * lo que un coach compara de una vez (la gráfica sola llega a 56 semanas porque
 * ahí se lee UNA serie, no dos totales enfrentados).
 */
export const COMPARE_MIN_WEEKS = 4;
export const COMPARE_MAX_WEEKS = 26;

/** Un «trimestre», en semanas. Trece y no doce: es lo que dura un trimestre de
 *  calendario contado en las semanas que la agregación sabe contar. */
export const COMPARE_TRIMESTRE_WEEKS = 13;

// ---------------------------------------------------------------------------
// El contrato de lectura (snake_case — convención Swift Codable)
// ---------------------------------------------------------------------------

/**
 * Un periodo, sumado.
 *
 * `total_s` es la suma de las seis partes y NO se lee de la base: así el reparto
 * en porcentaje siempre cierra en 100 y lo que se dibuja es exactamente lo que se
 * rotula, que es la misma regla que sostiene el alto de una barra en la gráfica.
 *
 * `label` lo escribe el SERVIDOR. Una sola voz para el móvil del atleta y la
 * ficha del coach: si cada punta redactara la suya, la misma comparación se
 * llamaría de dos formas y nadie sabría cuál es la buena.
 */
export interface ZoneComparePeriodDTO {
  /** Lunes de la primera semana del periodo. */
  week_start: string;
  label: string;
  z1_s: number;
  z2_s: number;
  z3_s: number;
  z4_s: number;
  z5_s: number;
  /** Tiempo MEDIDO que no se pudo repartir: sin pulso, o sin umbral con el que
   *  repartirlo. Cuenta dentro del total, porque el atleta lo entrenó. */
  no_hr_s: number;
  total_s: number;
  /** Cuántas de las `weeks` traen algo contado. Es la línea de honestidad de
   *  toda la pieza: sin ella, media ventana sin medir parece media ventana sin
   *  entrenar. */
  weeks_with_data: number;
}

/**
 * La comparación resuelta, lista para dibujar sin una consulta más.
 *
 * `anchor` es con qué umbral se repartieron estos segundos, y viaja con
 * `mixed` porque los dos periodos pueden no compartirlo: si el atleta se midió
 * el umbral por el camino, parte del cambio de reparto es de la medición y no
 * del entreno. Rotular la comparación entera con un solo umbral sin decirlo
 * convertiría una recalibración en un mérito.
 */
export interface ZoneComparisonDTO {
  /** Semanas por lado. Las dos ventanas miden lo mismo, siempre. */
  weeks: number;
  /** El ANTES. */
  a: ZoneComparePeriodDTO;
  /** El DESPUÉS. */
  b: ZoneComparePeriodDTO;
  anchor: {
    source: HrAnchorSource;
    lthr_bpm: number;
    /** La frase del servidor (`HR_ANCHOR_LABEL`). */
    source_label: string;
    /** Los dos periodos NO se repartieron con el mismo umbral. */
    mixed: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Qué es una comparación válida
// ---------------------------------------------------------------------------

/** Lunes de la ÚLTIMA semana del periodo, ambas puntas inclusive. */
export function finDeComparacion(week_start: string, weeks: number): string {
  return finDeVentana(week_start, weeks);
}

/**
 * ¿Las dos ventanas están en orden y sin pisarse?
 *
 * Se exporta porque la necesitan los tres: el esquema para rechazar, el
 * formulario para avisar antes de enviar y el endpoint de la ficha para no
 * agregar dos veces las mismas semanas.
 */
export function comparacionEnOrden(args: {
  a_start: string;
  b_start: string;
  weeks: number;
}): boolean {
  if (!esLunesIso(args.a_start) || !esLunesIso(args.b_start)) return false;
  if (!Number.isInteger(args.weeks) || args.weeks < COMPARE_MIN_WEEKS) return false;
  // El lunes siguiente al final de `a` es lo más pronto que puede arrancar `b`.
  const primeroLibre = isoDateString(
    addDays(parseIsoDate(finDeComparacion(args.a_start, args.weeks)), 7),
  );
  return args.b_start >= primeroLibre;
}

// ---------------------------------------------------------------------------
// Cómo se llama cada lado — LA VOZ DEL SERVIDOR
// ---------------------------------------------------------------------------

/**
 * Las fechas del atleta que dan NOMBRE a un periodo. Son hechos suyos, estables:
 * cuándo entró y cuándo arrancó su plan. Por eso la etiqueta se DERIVA de ellas
 * en vez de guardarse junto a la sección — una etiqueta guardada seguiría
 * diciendo «Con el plan» el día que se corrija la fecha de arranque, y entonces
 * el rótulo hablaría de un periodo que ya no es ese.
 */
export interface CompareAnchorDates {
  /** Lunes de la semana en la que el atleta entró. Null si no consta. */
  alta: string | null;
  /** Lunes en el que arranca su plan. Null si no tiene ninguno asignado. */
  plan: string | null;
}

const MES_CORTO = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** «5 may». Sin punto detrás del mes: es una etiqueta, no una frase. */
function diaCorto(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return MES_CORTO.format(new Date(t)).replace('.', '');
}

/**
 * Cómo se llama este periodo, dicho una sola vez y por el servidor.
 *
 * Sin persona a propósito: la misma frase la lee el coach en su ficha y el
 * atleta en su móvil, y «desde que entraste» en una y «desde que entró» en la
 * otra serían dos redacciones del mismo dato.
 *
 * El plan manda sobre el alta cuando las dos fechas coinciden: de las dos, la que
 * habla de entrenar es la del plan.
 */
export function etiquetaDePeriodo(args: {
  week_start: string;
  weeks: number;
  lado: 'a' | 'b';
  anclas: CompareAnchorDates;
}): string {
  const { anclas, lado } = args;
  // El ANTES termina justo la semana anterior al corte, así que su nombre sale
  // de mirar dónde ACABA y no dónde empieza.
  const corte =
    lado === 'b'
      ? args.week_start
      : isoDateString(addDays(parseIsoDate(finDeComparacion(args.week_start, args.weeks)), 7));

  if (anclas.plan != null && corte === anclas.plan) {
    return lado === 'b' ? 'Con el plan' : 'Antes del plan';
  }
  if (anclas.alta != null && corte === anclas.alta) {
    return lado === 'b' ? 'Después de entrar' : 'Antes de entrar';
  }
  // Una ventana que no cuelga de ningún hecho suyo se llama por lo que es: el
  // trozo de calendario del que habla, del lunes de la primera al DOMINGO de la
  // última — que es el día en el que de verdad se acaba.
  const domingo = isoDateString(
    addDays(parseIsoDate(finDeComparacion(args.week_start, args.weeks)), 6),
  );
  return `Del ${diaCorto(args.week_start)} al ${diaCorto(domingo)}`;
}

// ---------------------------------------------------------------------------
// Los atajos: comparaciones que salen de las fechas REALES del atleta
// ---------------------------------------------------------------------------

export const COMPARE_PRESETS = ['plan', 'alta', 'trimestre'] as const;
export type ComparePresetKey = (typeof COMPARE_PRESETS)[number];

/**
 * Un atajo del mando «Comparar», ya resuelto con las fechas de ESTE atleta.
 *
 * Se calcula en el servidor y no en la pantalla por lo mismo que la etiqueta: es
 * aritmética sobre hechos del atleta, y con dos implementaciones (una por punta)
 * el chip acabaría ofreciendo un periodo y el endpoint sirviendo otro.
 *
 * `unavailable` no esconde el atajo: lo enseña apagado con el motivo. Un chip que
 * desaparece deja al coach buscando algo que él recuerda haber visto.
 */
export interface ComparePresetDTO {
  key: ComparePresetKey;
  /** Cómo se llama el mando, para el coach. */
  label: string;
  a_start: string | null;
  b_start: string | null;
  weeks: number | null;
  /** Por qué no se puede montar todavía, o null si sí se puede. */
  unavailable: string | null;
}

const PRESET_LABEL: Record<ComparePresetKey, string> = {
  plan: 'Antes del plan / con el plan',
  alta: 'Antes de entrar / después',
  trimestre: 'Trimestre anterior / este',
};

function semanasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${desdeIso}T00:00:00Z`);
  const b = Date.parse(`${hastaIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (7 * 86_400_000));
}

/** El lunes de esta semana. Todo lo de aquí se mide en lunes. */
function lunesDe(iso: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(iso)));
}

/**
 * La ÚLTIMA semana que se puede comparar: la anterior a la que está corriendo.
 *
 * La semana en curso va a medias por definición, y meterla en un lado hundiría su
 * media de horas por una razón que no tiene nada que ver con el atleta. La
 * gráfica de la ficha sí la enseña —ahí el hueco reciente es la noticia—, pero
 * una comparación de volúmenes se hace con semanas cerradas.
 */
function ultimaSemanaCerrada(hoyIso: string): string {
  return isoDateString(addDays(parseIsoDate(lunesDe(hoyIso)), -7));
}

/**
 * Un atajo montado alrededor de un CORTE: `b` arranca en él y `a` termina justo
 * antes, las dos con la misma longitud — la mayor que quepa entre el corte y la
 * última semana cerrada, con el techo de la pieza.
 */
function atajoDesdeCorte(args: {
  key: ComparePresetKey;
  corte: string | null;
  hoy: string;
  sinFecha: string;
  corto: (semanas: number) => string;
}): ComparePresetDTO {
  const base = { key: args.key, label: PRESET_LABEL[args.key] };
  if (args.corte == null) {
    return { ...base, a_start: null, b_start: null, weeks: null, unavailable: args.sinFecha };
  }
  const cerradas = semanasEntre(args.corte, ultimaSemanaCerrada(args.hoy)) + 1;
  if (cerradas < COMPARE_MIN_WEEKS) {
    return {
      ...base,
      a_start: null,
      b_start: null,
      weeks: null,
      unavailable: args.corto(Math.max(0, cerradas)),
    };
  }
  const weeks = Math.min(COMPARE_MAX_WEEKS, cerradas);
  return {
    ...base,
    a_start: isoDateString(addDays(parseIsoDate(args.corte), -weeks * 7)),
    b_start: args.corte,
    weeks,
    unavailable: null,
  };
}

/**
 * Los tres atajos del mando, con las fechas reales del atleta.
 *
 * `trimestre` no cuelga de ningún hecho suyo (son los últimos tres meses contra
 * los tres anteriores), así que existe siempre: puede salir vacío de dato, y eso
 * lo dice la propia comparación con su cobertura, no un chip apagado.
 */
export function comparePresets(args: {
  anclas: CompareAnchorDates;
  /** Hoy, «YYYY-MM-DD». Se inyecta para que el test no dependa del reloj. */
  hoy: string;
}): ComparePresetDTO[] {
  const trimestreB = isoDateString(
    addDays(parseIsoDate(ultimaSemanaCerrada(args.hoy)), -(COMPARE_TRIMESTRE_WEEKS - 1) * 7),
  );
  return [
    atajoDesdeCorte({
      key: 'plan',
      corte: args.anclas.plan,
      hoy: args.hoy,
      sinFecha: 'Todavía no tiene ningún plan asignado.',
      corto: (n) =>
        `Con el plan lleva ${n === 1 ? '1 semana cerrada' : `${n} semanas cerradas`}. Hacen falta ${COMPARE_MIN_WEEKS}.`,
    }),
    atajoDesdeCorte({
      key: 'alta',
      corte: args.anclas.alta,
      hoy: args.hoy,
      sinFecha: 'No consta cuándo entró.',
      corto: (n) =>
        `Lleva dentro ${n === 1 ? '1 semana cerrada' : `${n} semanas cerradas`}. Hacen falta ${COMPARE_MIN_WEEKS}.`,
    }),
    {
      key: 'trimestre',
      label: PRESET_LABEL.trimestre,
      a_start: isoDateString(addDays(parseIsoDate(trimestreB), -COMPARE_TRIMESTRE_WEEKS * 7)),
      b_start: trimestreB,
      weeks: COMPARE_TRIMESTRE_WEEKS,
      unavailable: null,
    },
  ];
}

/**
 * Con qué atajo se abre el mando: el primero que se pueda montar.
 *
 * En este orden porque es el de lo que más dice: «antes del plan contra con el
 * plan» es la pregunta que el coach vino a hacerse; el alta es la misma pregunta
 * cuando todavía no hay plan; y el trimestre es la que siempre se puede
 * contestar.
 */
export function atajoDeEntrada(presets: readonly ComparePresetDTO[]): ComparePresetDTO | null {
  return presets.find((p) => p.unavailable == null) ?? null;
}
