// ¿QUÉ MARCAS TENGO? — la lista única de récords de todas las familias, con lo
// nuevo marcado (docs/analiticas/modelo.md §3 fila 6).
//
// UN RÉCORD ES UNA PROGRESIÓN, NO UN MÁXIMO
// ----------------------------------------
// Cada familia ofrece CANDIDATOS: cada esfuerzo, pieza, serie, estación, WOD o
// test que puede ser una marca, en la unidad y el sentido de su prueba. Aquí se
// ordenan por fecha y se queda la progresión: los que mejoraron ESTRICTAMENTE
// a todos los anteriores (un empate no es un récord). El récord es el último de
// la progresión; su anterior, el penúltimo. La serie de la lectura ES esa
// progresión, así que la pantalla puede dibujar «cómo ha ido cayendo mi 5 km»
// sin otra consulta.
//
// LO NUEVO
// --------
// Nuevo = conseguido dentro de la ventana. En `todo` todo es de la ventana, y es
// verdad: para quien empezó hace un mes, cada marca es nueva.
//
// NO OBEDECE LA VENTANA, Y LO DICE (A4): un récord es de siempre. La ventana
// solo decide qué se marca como nuevo, y la procedencia lo explica.
//
// Puro y sin base de datos.

import {
  FAMILIAS,
  lecturaMedida,
  pctCobertura,
  serieDe,
  type Familia,
  type Lectura,
  type Procedencia,
  type Unidad,
  type VeredictoLectura,
} from './lectura';
import { esMejor, type Sentido } from './progreso';
import type { Periodo } from './ventana';

export interface CandidatoRecord {
  /** Clave estable de la prueba (`correr.5000`, `remo.60s`, `fuerza.e1rm.12`, `test.row_2k`). */
  prueba: string;
  familia: Familia;
  /** Cómo se llama la prueba delante del atleta: «5 km», «Remo · 1′», «Sentadilla · 1RM estimado». */
  titulo_es: string;
  valor: number;
  unidad: Unidad;
  sentido: Sentido;
  /** Día local en que se consiguió. */
  dia: string;
  /** De dónde sale ESTE candidato (medido por el aparato, estimado, registrado a mano). */
  procedencia: Procedencia;
}

export interface RecordDePrueba {
  prueba: string;
  familia: Familia;
  titulo_es: string;
  unidad: Unidad;
  sentido: Sentido;
  /** La progresión, en orden: cada uno mejora estrictamente al anterior. El último es el récord. */
  progresion: CandidatoRecord[];
  record: CandidatoRecord;
  /** El récord que había antes de este. Null si es la primera marca. */
  anterior: CandidatoRecord | null;
  /** Cuántos candidatos se miraron (todas las veces que se hizo la prueba). */
  intentos: number;
  /** Días distintos con intento. */
  dias_intentos: string[];
}

/** Los récords por prueba, en el orden en que cada prueba apareció por primera vez en `candidatos`. */
export function recordsPorPrueba(candidatos: readonly CandidatoRecord[]): Map<string, RecordDePrueba> {
  const porPrueba = new Map<string, CandidatoRecord[]>();
  for (const c of candidatos) {
    if (!Number.isFinite(c.valor) || c.valor <= 0) continue;
    const lista = porPrueba.get(c.prueba) ?? [];
    lista.push(c);
    porPrueba.set(c.prueba, lista);
  }
  const out = new Map<string, RecordDePrueba>();
  for (const [prueba, lista] of porPrueba) {
    // Por fecha; en el mismo día, el mejor primero (así un día con dos intentos
    // deja UNA marca, la buena, y no una progresión de dos puntos en el mismo día).
    const orden = [...lista].sort((a, b) =>
      a.dia !== b.dia ? a.dia.localeCompare(b.dia) : esMejor(a.valor, b.valor, a.sentido) ? -1 : esMejor(b.valor, a.valor, a.sentido) ? 1 : 0,
    );
    const progresion: CandidatoRecord[] = [];
    for (const c of orden) {
      const ultimo = progresion[progresion.length - 1];
      if (ultimo == null || esMejor(c.valor, ultimo.valor, c.sentido)) progresion.push(c);
    }
    const record = progresion[progresion.length - 1]!;
    out.set(prueba, {
      prueba,
      familia: record.familia,
      titulo_es: record.titulo_es,
      unidad: record.unidad,
      sentido: record.sentido,
      progresion,
      record,
      anterior: progresion.length >= 2 ? progresion[progresion.length - 2]! : null,
      intentos: lista.length,
      dias_intentos: [...new Set(lista.map((c) => c.dia))].sort(),
    });
  }
  return out;
}

export const VEREDICTO_NUEVO: VeredictoLectura = { code: 'nuevo', etiqueta_es: 'Nuevo récord', frase_es: null, tono: 'bien' };

/** ¿Se consiguió dentro de la ventana? */
export function esNuevo(r: RecordDePrueba, ventana: Pick<Periodo, 'desde' | 'hasta'>): boolean {
  return r.record.dia >= ventana.desde && r.record.dia <= ventana.hasta;
}

/** La lectura de un récord: el valor, contra el récord anterior, con su progresión y lo nuevo marcado. */
export function lecturaRecord(r: RecordDePrueba, ventana: Periodo): Lectura {
  const enVentana = r.dias_intentos.filter((d) => d >= ventana.desde && d <= ventana.hasta).length;
  return lecturaMedida({
    id: `records.${r.prueba}`,
    grupo: 'records',
    familia: r.familia,
    titulo_es: r.titulo_es,
    dato: {
      valor: r.record.valor,
      unidad: r.unidad,
      referencia: r.anterior ? { valor: r.anterior.valor, delta: r.record.valor - r.anterior.valor, de: 'record_anterior' } : null,
    },
    serie: serieDe({ unidad: r.unidad, paso: 'dia', puntos: r.progresion.map((c) => ({ t: c.dia, v: c.valor })) }),
    veredicto: esNuevo(r, ventana) ? VEREDICTO_NUEVO : null,
    cobertura: {
      muestras: r.intentos,
      dias_ventana: ventana.dias,
      dias_con_dato: enVentana,
      pct: pctCobertura(enVentana, ventana.dias),
    },
    procedencia: {
      ...r.record.procedencia,
      explica_es: `${r.record.procedencia.explica_es} Tu mejor marca de siempre; se marca como nueva si la conseguiste en el periodo que miras.`,
    },
  });
}

const ORDEN_FAMILIA = new Map<Familia, number>(FAMILIAS.map((f, i) => [f, i]));

/**
 * La lista única: primero lo nuevo (lo más reciente arriba), después el resto
 * por familia y en el orden en que cada familia ofreció sus pruebas.
 */
export function lecturasRecords(candidatos: readonly CandidatoRecord[], ventana: Periodo): Lectura[] {
  const records = [...recordsPorPrueba(candidatos).values()];
  const posicion = new Map(records.map((r, i) => [r.prueba, i]));
  const nuevos = records.filter((r) => esNuevo(r, ventana)).sort((a, b) => b.record.dia.localeCompare(a.record.dia) || posicion.get(a.prueba)! - posicion.get(b.prueba)!);
  const resto = records
    .filter((r) => !esNuevo(r, ventana))
    .sort((a, b) => (ORDEN_FAMILIA.get(a.familia) ?? 99) - (ORDEN_FAMILIA.get(b.familia) ?? 99) || posicion.get(a.prueba)! - posicion.get(b.prueba)!);
  return [...nuevos, ...resto].map((r) => lecturaRecord(r, ventana));
}
