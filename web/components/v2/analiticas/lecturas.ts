// LEER EL SOBRE — lo que un pintor necesita para encontrar una lectura y saber
// qué decir de ella, sobre el contrato REAL (`shared/domain/analytics/lectura`
// y `panel`). Aquí no se calcula nada del atleta: se busca por id, se lee la
// falta y se decide el tono de lo que el servidor ya juzgó.
//
// «El cliente dibuja lo que conoce e ignora lo que no» (modelo §5): los ids de
// los bloques que otras sesiones están terminando (intensidad, progreso,
// récords, carrera, recuperación, cumplimiento) se conocen ya aquí, y una
// lectura con un id que nadie conoce se pinta genérica (cifra, unidad,
// comparación y ancla) en vez de perderse.
//
// Puro.

import type { Falta } from '@fahybrid/shared/domain/running/progress';
import type { BloquePanel, PanelAnaliticas } from '@fahybrid/shared/domain/analytics/panel';
import type { Ancla, Comparacion, Familia, Lectura, VeredictoLectura } from '@fahybrid/shared/domain/analytics/lectura';
import type { VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import type { UnidadPintable } from './formato';

/**
 * Las faltas que el contrato ya tiene más las que traen los bloques en
 * construcción (el dato viejo con su fecha, la pareja de dobles que falta, las
 * marcas que faltan para una previsión). Se leen por `por`; una desconocida
 * se trata como «no se sabe» sin salida.
 */
export type FaltaPintable = Falta | { por: 'viejo'; ultimo: string } | { por: 'pareja' } | { por: 'marcas'; faltan: number };

export function lectura(ls: readonly Lectura[], id: string): Lectura | undefined {
  return ls.find((l) => l.id === id);
}

/** Solo si está medida y tiene número: una lectura sin dato no afirma nada. */
export function medida(ls: readonly Lectura[], id: string): (Lectura & { dato: NonNullable<Lectura['dato']> }) | null {
  const l = lectura(ls, id);
  return l != null && l.estado === 'medida' && l.dato != null ? (l as Lectura & { dato: NonNullable<Lectura['dato']> }) : null;
}

/** Las lecturas cuyo id empieza por `prefijo` (`semanas.carga.` → una por familia). */
export function conPrefijo(ls: readonly Lectura[], prefijo: string): Lectura[] {
  return ls.filter((l) => l.id.startsWith(prefijo));
}

export function falta(l: Lectura | null | undefined): FaltaPintable | null {
  return (l?.cobertura.falta as FaltaPintable | null | undefined) ?? null;
}

/** ¿Se calla esta falta? (la regla de `seCalla`: lo que en su vida no existe no se pinta). */
export function seCalla(f: FaltaPintable | null): boolean {
  return f != null && (f.por === 'ocasion' || f.por === 'intencion');
}

/** El bloque aún no se sirve (vacío por construcción, no por dato). */
export function pendiente(panel: Pick<PanelAnaliticas, 'pendientes'>, bloque: BloquePanel): boolean {
  return panel.pendientes.includes(bloque);
}

/** El dato con el rango de una estimación, cuando lo trae (la previsión de carrera). */
export function rangoDe(l: Lectura | null | undefined): { bajo: number; alto: number } | null {
  const d = l?.dato as (NonNullable<Lectura['dato']> & { rango?: { bajo: number; alto: number } | null }) | null | undefined;
  return d?.rango ?? null;
}

/** La unidad de un dato como la entiende el formateador (el contrato crece: se lee como pintable). */
export function unidadDe(l: { dato: { unidad: string } | null } | null | undefined): UnidadPintable {
  return (l?.dato?.unidad ?? 'puntos') as UnidadPintable;
}

export function unidadComparacion(c: Comparacion): UnidadPintable {
  return c.unidad as UnidadPintable;
}

// ---------------------------------------------------------------------------
// El tono de un cambio — lo decide el servidor, no la pantalla
// ---------------------------------------------------------------------------

export type TonoCambio = 'mejor' | 'peor' | 'igual' | 'neutro';

/**
 * Cómo se pinta un cambio. Si el servidor dijo la palabra (progreso: mejor ·
 * igual · peor; recuperación: en tu normal / por debajo…), manda su tono. Sin
 * palabra, el cambio se enseña SIN juzgar (neutro), y si no llega al umbral
 * del coach, «igual»: la pantalla no decide si subir la carga es bueno.
 */
export function tonoCambio(l: Pick<Lectura, 'veredicto' | 'comparacion'>): TonoCambio {
  const v = l.veredicto;
  if (v) {
    if (v.code === 'igual' || v.code === 'en_tu_normal') return 'igual';
    if (v.tono === 'bien') return 'mejor';
    if (v.tono === 'atencion' || v.tono === 'aviso') return 'peor';
    return 'neutro';
  }
  if (l.comparacion?.significativo === false) return 'igual';
  return 'neutro';
}

/** El tono de una palabra del servidor, para colorear la palabra (nunca el número). */
export function claseTono(tono: VeredictoLectura['tono'] | null | undefined): string {
  switch (tono) {
    case 'bien':
      return 'text-v2-ok';
    case 'atencion':
      return 'text-v2-warn';
    case 'aviso':
      return 'text-v2-danger';
    default:
      return 'text-v2-fg';
  }
}

// ---------------------------------------------------------------------------
// Vocabulario de la pantalla
// ---------------------------------------------------------------------------

/** Cómo se escribe cada ventana en el selector: corto, sin siglas raras. */
export const VENTANA_ETIQUETA: Record<VentanaClave, string> = {
  '7d': '7 d',
  '4s': '4 sem',
  '12s': '12 sem',
  '6m': '6 m',
  '1a': '1 a',
  todo: 'Todo',
};

/** Cómo se llama cada familia en las filas del panel (las máquinas por su nombre, como en el box). */
export const FAMILIA_NOMBRE: Record<Familia, string> = {
  correr: 'Correr',
  remo: 'Remo',
  ski: 'SkiErg',
  bici: 'BikeErg',
  fuerza: 'Fuerza',
  estaciones: 'Estaciones',
  wod: 'WOD',
  otro: 'Resto',
};

/** El chip de ancla: corto, en la voz del panel (la del atleta la pone el iPhone). */
export const ANCLA_CHIP: Record<Ancla, string> = {
  medida: 'medido',
  declarada: 'declarado',
  estimada: 'estimado',
  poblacional: 'por edad',
};

/** Una línea para el tooltip del chip: de qué peldaño sale la cifra. */
export const ANCLA_GLOSA: Record<Ancla, string> = {
  medida: 'Sale de un test o de un entreno registrado.',
  declarada: 'Lo escribió el atleta o su coach.',
  estimada: 'Estimado de otro dato suyo (0,88 × su pulso máximo, o su VDOT).',
  poblacional: 'Estimado por su edad: no cuenta para la carga.',
};
