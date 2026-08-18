// De dónde sale un kilo. La única lectura del origen de un 1RM.
//
// El problema que resuelve: `athlete_strength_maxes` guarda dos cosas distintas
// que la ficha pintaba como una sola. `source` dice QUIÉN produjo el número
// (el alta, el coach, el atleta) y `assignment_id` (0200) dice SI lo produjo un
// protocolo. Un `coach_test` sin ancla es el coach escribiendo 110 en la ficha;
// con ancla es una batería que alguien hizo. Llamar «medidas» a las dos era la
// contradicción entre un kilo en la ficha y una fila de tests que dice «nadie».
//
// Aquí se combinan una vez y se leen igual en todas partes. La función es pura y
// no formatea fechas: devuelve `recorded_at` tal cual y cada pantalla lo pone en
// su formato (relativo en la ficha, fecha corta en el informe).

/** Las cuatro maneras en que un 1RM llega a existir. */
export type OrigenKilo =
  /** Salió de una batería programada: hay ocurrencia, y con ella un cuándo real. */
  | 'test'
  /** Lo declaró el atleta al darse de alta. Nunca pasó por un protocolo. */
  | 'alta'
  /** Lo anotó el coach en la ficha (a mano o estimado de un set que él vio). */
  | 'coach'
  /** Se lo apuntó el propio atleta desde la app, fuera de una batería. */
  | 'atleta'
  /** Fila sin origen fiable (histórico previo a las etiquetas). No se inventa. */
  | 'desconocido';

/** Lo mínimo que hace falta leer de un 1RM para saber de dónde sale. */
export interface KiloConOrigen {
  source: string;
  /** Ocurrencia de batería (0200). Null = no hubo protocolo. */
  assignment_id?: string | number | null;
  /** El set del que se estimó, si lo hubo. */
  test_weight_kg?: number | null;
  test_reps?: number | null;
}

export interface LecturaOrigen {
  origen: OrigenKilo;
  /** Etiqueta corta para la celda: «del test», «del alta», «lo anotó el coach»… */
  label: string;
  /** El set del que se estimó («de 100 × 5»), o null si fue un número directo. */
  detalle: string | null;
  /** true solo cuando hubo protocolo. Es lo único que autoriza decir «medido». */
  medido: boolean;
  /** La ocurrencia a la que enlazar, o null. */
  assignment_id: string | null;
}

const LABEL: Record<OrigenKilo, string> = {
  test: 'del test',
  alta: 'del alta',
  coach: 'lo anotó el coach',
  atleta: 'lo apuntó el atleta',
  desconocido: 'sin origen',
};

/**
 * El origen de un kilo, a partir de la fila. Orden de evidencia: el ancla manda
 * sobre la etiqueta —si hubo batería, da igual quién tecleó el resultado, el
 * número salió de un protocolo—; sin ancla decide `source`; y un `source` que no
 * reconocemos se lee «sin origen» antes que suponer.
 */
export function leerOrigen(max: KiloConOrigen): LecturaOrigen {
  const anchor = ancla(max.assignment_id);

  const origen: OrigenKilo = anchor
    ? 'test'
    : max.source === 'onboarding'
      ? 'alta'
      : max.source === 'coach_test'
        ? 'coach'
        : max.source === 'athlete_test'
          ? 'atleta'
          : 'desconocido';

  // El set solo se enseña cuando explica el número: un 1RM estimado de 100 × 5 no
  // es un 100 levantado una vez, y el coach necesita ver la diferencia. Con reps=1
  // no hubo estimación (el estimador devuelve el peso tal cual), así que no aporta.
  const w = max.test_weight_kg;
  const r = max.test_reps;
  const detalle =
    origen !== 'test' && w != null && r != null && r > 1
      ? `de ${redondear(w)} × ${r}`
      : null;

  return { origen, label: LABEL[origen], detalle, medido: origen === 'test', assignment_id: anchor };
}

/** La línea que se pinta bajo el kilo. La fecha la pone cada pantalla. */
export function lineaOrigen(lectura: LecturaOrigen, cuando: string | null): string {
  return [lectura.label, lectura.detalle, cuando].filter(Boolean).join(' · ');
}

function ancla(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function redondear(kg: number): string {
  return String(Math.round(kg * 10) / 10);
}
