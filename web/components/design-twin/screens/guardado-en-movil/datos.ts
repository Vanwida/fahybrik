// Los casos del rechazo — el circuito de pierna del atleta 67 y su mes.
//
// COMPUESTO, y se dice: el circuito de pierna del 15-jul (ejecución 103,
// asignación 297) SÍ se subió en producción. Aquí se enseña COMO SI el servidor
// lo hubiese rechazado, y se elige a propósito: es una sesión del coach, que es
// justo el caso por el que Alex descartó «subirlo como entreno libre» — el
// libre perdería el vínculo con la sesión que el coach escribió. Todo lo demás
// es producción tal cual (la semana del 13 al 19 de julio de `plan/datos.ts`).
//
// Un rechazo, hoy, es casi siempre un fallo NUESTRO: el servidor acepta
// cualquier entreno terminado (docs/DECISIONS.md, 2026-09-25). Por eso el caso
// de diseño no es «el atleta hizo algo mal», es «nosotros lo hicimos mal y su
// trabajo no puede pagarlo».

import { CIRCUITO_PIERNA, MEDIDO_CIRCUITO, type MedidoReal, type SesionReal } from '../../datos-reales';
import { METCON, TEMPO_CONTINUO } from '../../plan/datos';

/** El entreno rechazado — el mismo en el resumen y en el historial. */
export const RECHAZADO: { sesion: SesionReal; medido: MedidoReal } = {
  sesion: CIRCUITO_PIERNA,
  medido: MEDIDO_CIRCUITO,
};

/**
 * El día desde el que se mira el historial: el MISMO miércoles del circuito.
 * El atleta acaba de cerrar el resumen y abre el historial — es el momento en
 * que tiene que encontrarlo, y encontrarlo arriba.
 */
export const HOY_HISTORIAL = '2026-07-15';

/**
 * Una fila del historial — lo que trae `GET /api/athlete/history`
 * (`AthleteHistorySession`), más la marca local.
 */
export interface FilaHistorial {
  /** YYYY-MM-DD, hora del box. */
  fecha: string;
  titulo: string;
  /** `total_duration_seconds`. Es lo que la fila pinta como «duración». */
  duracionS: number;
  /**
   * Solo existe en el teléfono: el servidor contestó 4xx y la cola lo guardó en
   * `RequestQueue.rejected`. El servidor no lo tiene, así que el historial lo
   * cose en local con lo que el teléfono guardó (el mismo cuerpo que se envió).
   */
  sinSubir?: boolean;
  procedencia: string;
}

/**
 * Julio de 2026 del atleta 67 hasta el día 15. El martes 14 (Series de carrera,
 * asignación 236) no tiene ejecución, así que no sale. Del 1 al 12 el calendario
 * va sin marcas: su único microciclo publicado («Acumulación», 13→26 de julio)
 * empieza el lunes 13 y de antes no se leyó nada — es la parte COMPUESTA del
 * mes, y no toca lo que aquí se juzga, que es la fila.
 *
 * El orden dentro del día: el rechazado va PRIMERO en su miércoles porque es lo
 * último que hizo — la app lo cose en local y lo pone donde cae por hora, no al
 * final de la lista del servidor.
 */
export const JULIO: FilaHistorial[] = [
  {
    fecha: '2026-07-15',
    titulo: RECHAZADO.sesion.titulo,
    duracionS: RECHAZADO.medido.duracionS,
    sinSubir: true,
    procedencia: 'ejecución 103 · asignación 297 — COMPUESTO: en producción sí se subió',
  },
  { fecha: '2026-07-15', titulo: METCON.titulo, duracionS: 120, procedencia: 'ejecución 64 · asignación 237' },
  // `FUERZA_PIERNA` vive privada en plan/datos.ts; su título es este, literal.
  { fecha: '2026-07-13', titulo: 'Fuerza de pierna', duracionS: 960, procedencia: 'ejecución 57 · asignación 235' },
  { fecha: '2026-07-13', titulo: TEMPO_CONTINUO.titulo, duracionS: 2174, procedencia: 'ejecución 38 · asignación 245' },
];

// ---------------------------------------------------------------------------
// El calendario del mes — espejo de `HistoryCalendar` (HistoryModels.swift)
// ---------------------------------------------------------------------------

/** Una celda de la rejilla, lunes primero: hueco o día del mes. */
export type Celda = { tipo: 'hueco' } | { tipo: 'dia'; n: number };

export function partesISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** 0 = lunes … 6 = domingo, en UTC para que el huso del navegador no decida. */
function diaSemana(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** `HistoryCalendar.grid`: huecos hasta el día 1, los días, y huecos hasta cerrar semana. */
export function rejillaDelMes(y: number, m: number): Celda[] {
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const celdas: Celda[] = Array.from({ length: diaSemana(y, m, 1) }, () => ({ tipo: 'hueco' as const }));
  for (let n = 1; n <= dias; n++) celdas.push({ tipo: 'dia', n });
  while (celdas.length % 7 !== 0) celdas.push({ tipo: 'hueco' });
  return celdas;
}

/**
 * Los días con trabajo. Un día cuyo ÚNICO entreno estuviera «Sin subir» también
 * cuenta: el trabajo se hizo, y el calendario pinta lo hecho, no lo que el
 * servidor confirmó. Por eso sale de las filas ya cosidas, no del mes del servidor.
 */
export function diasConTrabajo(filas: FilaHistorial[], y: number, m: number): Set<number> {
  const out = new Set<number>();
  for (const f of filas) {
    const p = partesISO(f.fecha);
    if (p.y === y && p.m === m) out.add(p.d);
  }
  return out;
}

const DIAS_ABREV = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «mié» — `HistoryCalendar.dowAbbrev`. */
export function diaAbrev(iso: string): string {
  const p = partesISO(iso);
  return DIAS_ABREV[diaSemana(p.y, p.m, p.d)]!;
}

/** El número del día del sello de la fila. */
export function numeroDia(iso: string): number {
  return partesISO(iso).d;
}

/** «Julio 2026» — `YearMonth.displayLabel.capitalizedFirst`. */
export function etiquetaMes(y: number, m: number): string {
  const nombre = MESES[m - 1]!;
  return `${nombre[0]!.toUpperCase()}${nombre.slice(1)} ${y}`;
}
