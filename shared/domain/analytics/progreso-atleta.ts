// PROGRESO Y RÉCORDS DE UN ATLETA — las familias, juntas (modelo §3 filas 5-6).
//
// UN CÁLCULO, TRES VISTAS (A1). El bloque `progreso` del panel (una fila por
// familia), el bloque `records` (la lista única) y los detalles por familia
// salen de UNA llamada a `progresoAtleta`: la fila que abre cada detalle es el
// MISMO objeto que la del panel, y los récords que citan los detalles salen de
// los mismos candidatos que la lista.
//
// Puro y sin base de datos.

import type { Familia, Lectura } from './lectura';
import { progresoCorrer, type EntradaCorrer } from './progreso-correr';
import { progresoErgo, type EntradaErgo, type Maquina } from './progreso-ergo';
import { progresoEstaciones, type EntradaEstaciones } from './progreso-estaciones';
import { progresoFuerza, type EntradaFuerza } from './progreso-fuerza';
import { progresoTests, type EntradaTests } from './progreso-tests';
import { lecturasRecords } from './records';
import type { VentanaResuelta } from './ventana';

/** Las familias con detalle propio (estaciones lleva también los WOD). */
export const FAMILIAS_DETALLE = ['correr', 'remo', 'ski', 'bici', 'fuerza', 'estaciones'] as const;
export type FamiliaDetalle = (typeof FAMILIAS_DETALLE)[number];

export function familiaDetalleAdmisible(raw: string | null | undefined): FamiliaDetalle | null {
  return raw != null && (FAMILIAS_DETALLE as readonly string[]).includes(raw) ? (raw as FamiliaDetalle) : null;
}

export interface EntradaProgresoAtleta {
  ventana: VentanaResuelta;
  correr: EntradaCorrer;
  ergo: Record<Maquina, EntradaErgo>;
  fuerza: EntradaFuerza;
  estaciones: EntradaEstaciones;
  tests: EntradaTests;
}

export interface ProgresoAtleta {
  /** Una fila por familia, en el orden del panel: correr, remo, ski, bici, fuerza, estaciones, WOD. */
  progreso: Lectura[];
  /** La lista única de récords, lo nuevo primero. */
  records: Lectura[];
  /** La evolución de cada test (`test.<slug>`), con su familia. */
  tests: Lectura[];
  /** El «¿mejoro?» a fondo de cada familia, con sus tests al final. */
  detalles: Record<FamiliaDetalle, Lectura[]>;
}

export function progresoAtleta(e: EntradaProgresoAtleta): ProgresoAtleta {
  const correr = progresoCorrer(e.correr);
  const remo = progresoErgo(e.ergo.row);
  const ski = progresoErgo(e.ergo.ski);
  const bici = progresoErgo(e.ergo.bike);
  const fuerza = progresoFuerza(e.fuerza);
  const { estaciones, wod } = progresoEstaciones(e.estaciones);
  const tests = progresoTests(e.tests);

  const testsDe = (...familias: Familia[]) => tests.lecturas.filter((l) => l.familia != null && familias.includes(l.familia));

  return {
    progreso: [correr.fila, remo.fila, ski.fila, bici.fila, fuerza.fila, estaciones.fila, wod.fila],
    records: lecturasRecords(
      [...correr.candidatos, ...remo.candidatos, ...ski.candidatos, ...bici.candidatos, ...fuerza.candidatos, ...estaciones.candidatos, ...wod.candidatos, ...tests.candidatos],
      e.ventana,
    ),
    tests: tests.lecturas,
    detalles: {
      correr: [...correr.detalle, ...testsDe('correr')],
      remo: [...remo.detalle, ...testsDe('remo')],
      ski: [...ski.detalle, ...testsDe('ski')],
      bici: [...bici.detalle, ...testsDe('bici')],
      fuerza: [...fuerza.detalle, ...testsDe('fuerza')],
      estaciones: [...estaciones.detalle, ...wod.detalle, ...testsDe('estaciones', 'wod')],
    },
  };
}
