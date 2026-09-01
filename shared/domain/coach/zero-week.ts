// SEMANA CERO — colocar lo que el coach quiere que se haga ANTES de que arranque
// el plan, en los días huérfanos que de verdad existan.
//
// EL PROBLEMA QUE RESUELVE
// -----------------------
// Un plan siempre arranca en lunes, y se asigna cualquier día. Así que la ventana
// previa NO tiene tamaño fijo: mide de 1 a 7 días según cuándo se asigne. Una
// plantilla con forma de semana no sirve — lo que el coach declara es una lista
// con preferencia de día, y aquí se decide qué cabe de verdad.
//
// LAS CUATRO REGLAS
// -----------------
//  1. El día que el coach eligió es una PREFERENCIA, no una promesa: si ya pasó
//     (o está pillado) la pieza se DESLIZA al siguiente hueco libre.
//  2. Lo que no cabe NO se hace, y se dice cuál y por qué. Nunca se recorta en
//     silencio ni se apila para «aprovechar» — un test mal colocado es peor que
//     ninguno.
//  3. Una pieza puede pedir días libres detrás (`restDaysAfter`): un 5K control y
//     una batería de 1RM en días seguidos es mala programación.
//  4. Hay un MARGEN antes del lunes (`bufferDays`) para no arrancar el plan
//     fatigado. Los dos son método del coach (dato editable), no constantes.
//
// Pura y sin I/O: la ventana, los días ocupados y las piezas entran por
// parámetro. Eso la hace testeable contra fechas fijas — el bug clásico de este
// tipo de código es depender de `new Date()` por dentro y no poder comprobarlo.

/** Una pieza que el coach quiere colocar antes de que arranque el plan. */
export interface ZeroWeekItem {
  /** Identificador opaco para el llamador (id del schedule, del test…). */
  readonly id: string;
  /** Día preferido, 1 = lunes … 7 = domingo. Es preferencia, no promesa. */
  readonly preferredDayOfWeek: number;
  /** Días libres que pide DETRÁS (0 = se puede encadenar). */
  readonly restDaysAfter: number;
}

export interface ZeroWeekPlacement {
  readonly id: string;
  /** ISO `YYYY-MM-DD` donde acaba cayendo. */
  readonly iso: string;
  /** True cuando NO cayó en el día que el coach pidió (se deslizó). */
  readonly moved: boolean;
}

export type ZeroWeekSkipReason =
  /** No quedaba ningún día libre en la ventana. */
  | 'no_room'
  /** La ventana no existe: se asignó tan pegado al lunes que no hay días. */
  | 'no_window';

export interface ZeroWeekSkip {
  readonly id: string;
  readonly reason: ZeroWeekSkipReason;
}

export interface ZeroWeekPlan {
  readonly placed: ZeroWeekPlacement[];
  readonly skipped: ZeroWeekSkip[];
  /** Los días de la ventana, en ISO — vacío cuando no hay ventana. */
  readonly window: string[];
}

const MS_DAY = 86_400_000;

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_DAY);
}

/** 1 = lunes … 7 = domingo (el mismo convenio que `day_of_week` en la base). */
function dayOfWeek(d: Date): number {
  const js = d.getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/**
 * Reparte las piezas por la ventana previa al arranque del plan.
 *
 * `assignedOn` y `planStart` son días de calendario a medianoche UTC (lo que
 * produce `startOfDayUtc`/`mondayOfWeek`). La ventana es
 * `[assignedOn, planStart - 1 - bufferDays]`: se empieza HOY porque el atleta ya
 * puede entrenar hoy, y se corta antes del margen.
 *
 * Las piezas se atienden EN EL ORDEN QUE LLEGAN: ese orden es la prioridad del
 * coach. Con hueco para dos y tres piezas declaradas, entran las dos primeras.
 */
export function planZeroWeek(params: {
  assignedOn: Date;
  planStart: Date;
  bufferDays: number;
  /** Días ISO que ya tienen algo del atleta y no se pueden pisar. */
  occupied?: Iterable<string>;
  items: readonly ZeroWeekItem[];
}): ZeroWeekPlan {
  const { assignedOn, planStart, items } = params;
  const buffer = Math.max(0, params.bufferDays);
  const occupied = new Set(params.occupied ?? []);

  // La ventana: desde hoy hasta el día anterior al plan, menos el margen.
  const lastDay = addDays(planStart, -1 - buffer);
  const window: string[] = [];
  for (let d = assignedOn; d.getTime() <= lastDay.getTime(); d = addDays(d, 1)) {
    window.push(isoOf(d));
  }

  if (window.length === 0) {
    return { placed: [], skipped: items.map((i) => ({ id: i.id, reason: 'no_window' })), window };
  }

  // Un día se bloquea porque ya tenía algo, porque acabamos de poner una pieza,
  // o porque es el descanso que pidió la pieza anterior.
  const taken = new Set<string>(occupied);
  const placed: ZeroWeekPlacement[] = [];
  const skipped: ZeroWeekSkip[] = [];

  for (const item of items) {
    // El día que el coach pidió, si cae en la ventana y está libre; si no, el
    // primer hueco libre A PARTIR de ahí (nunca hacia atrás: retroceder pondría
    // la pieza antes de donde el coach la quería, y el orden importa).
    const preferredIdx = window.findIndex((iso, i) => {
      const d = addDays(assignedOn, i);
      void iso;
      return dayOfWeek(d) === item.preferredDayOfWeek;
    });
    const startIdx = preferredIdx >= 0 ? preferredIdx : 0;

    // SOLO hacia delante, nunca hacia atrás. Retroceder parece aprovechar mejor
    // el hueco, pero invierte el orden que el coach eligió: sus 4 tests van
    // 1RM → 5K → remo → media simulación, y la media simulación es lo más duro.
    // Colocarla la primera porque «cabía antes» es peor programación que no
    // hacerla. Si desde su día no queda sitio, no entra y se dice.
    let slot = -1;
    for (let i = startIdx; i < window.length; i++) {
      if (!taken.has(window[i]!)) {
        slot = i;
        break;
      }
    }

    if (slot < 0) {
      skipped.push({ id: item.id, reason: 'no_room' });
      continue;
    }

    const iso = window[slot]!;
    taken.add(iso);
    // El descanso que pide detrás bloquea los días siguientes de la ventana.
    for (let r = 1; r <= item.restDaysAfter; r++) {
      const after = window[slot + r];
      if (after) taken.add(after);
    }
    placed.push({
      id: item.id,
      iso,
      moved: preferredIdx < 0 || slot !== preferredIdx,
    });
  }

  return { placed, skipped, window };
}
