// El DOMINIO del ergo: qué se prescribe, cómo se nombra y cómo se escribe.
// No sabe nada de curvas ni de física — eso es `curvas.ts`. Importar siempre
// desde `data.ts`, que es el único sitio público de la familia.
//
// PROCEDENCIA — qué es fila de producción y qué es forma del intervalo:
//
//  · remo 5×500 · la FORMA sale de la ejecución 179 (remo 5×500 con monitor,
//    `source: pm5`), que **solo capturó 1 split de 5**. Ese fallo es justo el
//    que obliga a reanclar la ventana de medida en cada serie. El objetivo
//    1:52/500m es el `value_s: 112` de la prescripción de la asignación 352
//    (`{"scheme":"steady","target":{"kind":"pace","unit":"per_500m",
//    "value_s":112}}`), el mismo que ya cita `datos-reales.REMO_500` — NO es
//    el 1:52 por defecto que el §7 del contrato prohíbe, es un objetivo
//    escrito por el coach. El descanso de 2:00 es forma del intervalo, no una
//    columna leída, y va declarado como tal.
//
//  · ski 400 m · la ejecución 173: 400 m en 4 parciales de 100, **165,7 W**
//    medios y **38 paladas/min**. La curva de abajo está calibrada para
//    reproducir esos dos agregados al integrarla segundo a segundo. De la
//    misma fila viene el pulso: NO hubo. La primera lectura del reloj llegó
//    media hora después de acabar la pieza, así que el ski se pinta sin pulso
//    y sin zona — que es lo que manda el §7.
//
//  · bici 3×20 cal · caso de DISEÑO de la medida caloría (no hay fila de
//    producción con esta prescripción). Lo que sí es regla del dominio es todo
//    lo demás: sin objetivo escrito no se inventa uno, y sin descanso escrito
//    el reloj cuenta hacia arriba.
//
export type Maquina = 'remo' | 'ski' | 'bici';
export type Medida = 'metros' | 'calorias';

/** Cómo se le nombra la máquina al atleta. Jamás el modelo del monitor (§3). */
export const MAQUINA_NOMBRE: Record<Maquina, string> = {
  remo: 'el remo',
  ski: 'el esquí',
  bici: 'la bici',
};

/** Cadencia: una palada no es una pedalada (§3, la unidad se escribe entera). */
export const CADENCIA_UNIDAD: Record<Maquina, string> = {
  remo: 'paladas/min',
  ski: 'paladas/min',
  bici: 'pedaladas/min',
};

export const MEDIDA_UNIDAD: Record<Medida, string> = { metros: 'm', calorias: 'cal' };

/** El objetivo contra el que se mide el esfuerzo. Nulo = la prescripción no lo trae. */
export type Objetivo =
  | { clase: 'ritmo'; segundosPor500: number }
  | { clase: 'vatios'; vatios: number };

export interface Prescripcion {
  maquina: Maquina;
  medida: Medida;
  /** Cuántas veces se repite el MISMO tramo. 1 = pieza continua. */
  series: number;
  /** La cantidad de la medida que CIERRA cada serie. */
  cantidad: number;
  objetivo: Objetivo | null;
  /** Descanso prescrito, en segundos. Nulo = el coach no lo escribió. */
  descansoS: number | null;
  titulo: string;
}

export const PRESCRIPCION: Record<Maquina, Prescripcion> = {
  remo: {
    maquina: 'remo',
    medida: 'metros',
    series: 5,
    cantidad: 500,
    objetivo: { clase: 'ritmo', segundosPor500: 112 },
    descansoS: 120,
    titulo: 'Remo 5×500',
  },
  ski: {
    maquina: 'ski',
    medida: 'metros',
    series: 1,
    cantidad: 400,
    objetivo: null,
    descansoS: null,
    titulo: 'Esquí 400 m',
  },
  bici: {
    maquina: 'bici',
    medida: 'calorias',
    series: 3,
    cantidad: 20,
    objetivo: null,
    descansoS: null,
    titulo: 'Bici 3×20 cal',
  },
};

/**
 * Lo que la app YA midió de la serie 1 de la bici. Sin objetivo escrito, la
 * única referencia honesta es lo que tú mismo acabas de hacer: no se fabrica un
 * objetivo de vatios que nadie prescribió (§7).
 */
export const BICI_SERIE_1 = { vatiosMedios: 291 } as const;

/**
 * El monitor que aparece al buscar, con lo que la app le manda.
 *
 * `programa` es lo que `PM5WorkoutProgrammer` resuelve DE VERDAD para un 5×500
 * con descanso: intervalos nativos de distancia con su descanso, que el propio
 * monitor corre (el contador de series lo lleva la app, porque el monitor repite
 * hasta que paras). Y el objetivo de ritmo viaja con la pieza: es el barco
 * marcapasos del monitor. Nada de esto se inventa aquí, y por eso el doble puede
 * enseñar la programación en vez de saltársela.
 */
export const MONITOR = {
  /** El ID que el monitor enseña en su pantalla, que es como se reconoce. */
  serial: '430512345',
  /** Factor de resistencia del ventilador: dato del monitor, no ajuste de la app. */
  drag: 118,
  /** Metros que el monitor traía de una pieza a medias (escenario sucio). */
  metrosSucios: 100,
} as const;

/** El menú físico del monitor, tal cual está impreso en él. */
export const MENU_MONITOR = ['Just Row', 'Select Workout', 'Connect', 'Memory', 'More Options'] as const;
export const MENU_DIANA = 'Connect';

// ---------------------------------------------------------------------------
// Grafías — una por concepto, y las que faltaban se declaran aquí
// ---------------------------------------------------------------------------

/** «1:52/500m» — sin espacio y con la m (§2). La usa el texto corrido. */
export function ritmoConUnidad(segundosPor500: number): string {
  const total = Math.max(0, Math.round(segundosPor500));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/500m`;
}

/** «5×500 m» · «3×20 cal» · «400 m» — la dosis de una prescripción de ergo. */
export function dosisDePrescripcion(pres: Prescripcion): string {
  const unidad = MEDIDA_UNIDAD[pres.medida];
  return pres.series > 1
    ? `${pres.series}×${pres.cantidad} ${unidad}`
    : `${pres.cantidad} ${unidad}`;
}

/** La línea de objetivo, o nulo cuando la prescripción no trae ninguno. */
export function objetivoTexto(pres: Prescripcion): string | null {
  if (!pres.objetivo) return null;
  return pres.objetivo.clase === 'ritmo'
    ? ritmoConUnidad(pres.objetivo.segundosPor500)
    : `${pres.objetivo.vatios} vatios`;
}
