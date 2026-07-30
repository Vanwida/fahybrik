// (5) FUERZA — el único formato donde el reloj TIENE QUE CALLARSE.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. Y se acaba ahí. La carga no la mide nadie, las repeticiones
// tampoco, y el RIR y el RPE son NULL en las 56 filas de `set_executions` de
// toda la base. Todo lo que se ve en esta vista salvo el pulso y el crono lo
// declara el atleta o lo escribió el coach.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Durante la serie, el reloj está en la muñeca que sostiene la barra: **ni
// mirar ni tocar** (`ciego`). Un reloj que en ese momento pide algo está mal
// diseñado por definición. Así que no pide: enuncia la serie que estás
// haciendo, sin cuenta atrás, sin urgencia y con la oferta de cerrar atenuada,
// porque esa oferta es para DESPUÉS, cuando sueltes la barra.
//
// En el descanso, en cambio, estás de pie mirando el reloj con las manos
// libres: **mirar y tocar** (`mando`). Ahí sí van la cuenta atrás, la serie que
// viene y la acción a plena luz.
//
// Ése es el giro entero de esta vista: NO son dos estados de una pantalla, son
// dos pantallas, y lo que las separa no es el formato — es lo que el cuerpo del
// atleta puede hacer en ese momento.

import {
  NOTA,
  countdown,
  kg,
  paginaPulso,
  tonoUrgente,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import {
  ANCLA_MEDIDA,
  FUERZA_DOSIS_NULA,
  FUERZA_SIN_FC,
  FUERZA_TIPICA,
  SIN_ANCLA,
  rampa,
  type CasoFuerza,
} from '../../datos-reloj';

export type Fase = 'serie' | 'descanso';

export interface Estado {
  caso: CasoFuerza;
  ancla: Ancla;
  fase: Fase;
  /** La serie que toca. Durante el descanso, la que VIENE. */
  serie: number;
  /** Segundos dentro de la fase. */
  t: number;
}

export interface Gestos {
  /** Cerrar la serie: se pulsa al soltar la barra, nunca durante. */
  cerrarSerie: () => void;
  /** Adelantar el descanso. */
  empezarYa: () => void;
}

/**
 * La FC. Sube hacia la máxima mientras empujas y baja hacia la media mientras
 * descansas. `null` cuando la ejecución no registró pulso — y entonces esta
 * vista se queda en UNA página, que es exactamente lo que hay que enseñar.
 */
export function bpmDe(e: Estado): number | null {
  const { fcDesde, fcHasta } = e.caso;
  if (fcDesde == null || fcHasta == null) return null;
  return e.fase === 'serie' ? rampa(fcDesde, fcHasta, e.t, 40) : rampa(fcHasta, fcDesde, e.t, 80);
}

/**
 * La dosis de una serie, con la grafía canónica (§2.1). **Nula cuando el coach
 * no escribió las repeticiones**, y entonces no se pinta NADA: ni «— reps», ni
 * un 0, ni un «4×» colgando. Eso sería fabricar la mitad de un dato (§7).
 */
export function dosis(caso: CasoFuerza): string | null {
  return caso.reps == null ? null : `${caso.reps} × ${kg(caso.cargaKg)} kg`;
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const bpm = bpmDe(e);
  const pulso = paginaPulso({ bpm, ancla: e.ancla });
  const restoDePaginas = pulso ? [pulso] : [];

  if (e.fase === 'descanso') {
    const queda = Math.max(0, e.caso.descansoS - e.t);
    const linea = dosis(e.caso);
    return [
      {
        id: 'descanso',
        contexto: `Descanso · viene la ${e.serie}`,
        // De pie, manos libres, mirando el reloj. Aquí SÍ se decide.
        modo: 'mando',
        sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
        segundo: linea ? { etiqueta: 'Luego', valor: linea } : undefined,
        accion: { etiqueta: 'Toca · empezar ya', onToca: g.empezarYa },
      },
      ...restoDePaginas,
    ];
  }

  const linea = e.caso.reps == null ? null : `${e.caso.reps} reps`;
  return [
    {
      id: 'serie',
      contexto: `Serie ${e.serie} / ${e.caso.series}`,
      // La barra está en las manos. El reloj enuncia y espera.
      modo: 'ciego',
      // La CARGA es el sujeto y no las repeticiones: las reps las llevas tú en
      // la cabeza y no puedes equivocarte a mitad de serie; los kilos son lo
      // único que se puede haber cargado mal, y es lo que miras antes de entrar.
      sujeto: { texto: kg(e.caso.cargaKg), unidad: 'kg' },
      segundo: linea ? { valor: linea } : undefined,
      // No es una petición: es una oferta para cuando sueltes. El lienzo la
      // pinta atenuada porque el modo es `ciego`.
      accion: { etiqueta: 'Al acabar · toca', onToca: g.cerrarSerie },
      nota: NOTA.loDicesTu,
    },
    ...restoDePaginas,
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { cerrarSerie: () => {}, empezarYa: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  caso('sin-fc · serie', { caso: FUERZA_SIN_FC, ancla: SIN_ANCLA, fase: 'serie', serie: 2, t: 8 }),
  caso('sin-fc · descanso', { caso: FUERZA_SIN_FC, ancla: SIN_ANCLA, fase: 'descanso', serie: 3, t: 4 }),
  caso('dosis nula · serie', { caso: FUERZA_DOSIS_NULA, ancla: SIN_ANCLA, fase: 'serie', serie: 2, t: 8 }),
  caso('típica · serie', { caso: FUERZA_TIPICA, ancla: SIN_ANCLA, fase: 'serie', serie: 3, t: 8 }),
  caso('típica · descanso', { caso: FUERZA_TIPICA, ancla: SIN_ANCLA, fase: 'descanso', serie: 4, t: 2 }),
  // El último segundo del descanso, que es cuando el numeral es más grande.
  caso('típica · último segundo', {
    caso: FUERZA_TIPICA,
    ancla: ANCLA_MEDIDA,
    fase: 'descanso',
    serie: 4,
    t: 88,
  }),
] as const;
