// LOS DERIVADOS DE VISTA — lo que un pintor necesita del panel y no viene
// listo en el contrato: los cubos de una barra apilada, las series de una
// línea, el resumen de las sesiones, los tramos con más hueco. Viven aquí y
// no en la pantalla para que el iPhone y el panel del coach dibujen LO MISMO
// desde el mismo JSON (A1): dos pintores, un derivado.
//
// Puro. Lo único que toma de la piel es el color de cada parte.

import { FAMILIA_GRANDE, FAMILIA_GRANDE_NOMBRE, FAMILIAS_GRANDES, TRAMO_CARRERA_NOMBRE, type Bloque, type EstadoBloque, type FamiliaGrande, type LecturaPanel, type PanelAnaliticas, type PrevisionCarrera, type PuntoSerie, type SesionResumen } from './contrato';
import type { Cubo, MarcaVertical, SerieLinea } from './graficos';
import { agruparPuntos, estadoDeBloque, estadoDeCarrera, estadoDeRecords } from './mecanismo';
import type { MetodoAnaliticas } from './metodo';
import { ORDEN_FAMILIAS, colorZonaDe, type Piel } from './tokens';

// ---------------------------------------------------------------------------
// Estados de los ocho bloques, de una vez
// ---------------------------------------------------------------------------

export function estadosDe(p: PanelAnaliticas, metodo: MetodoAnaliticas): Record<Bloque, EstadoBloque> {
  const hoy = p.atleta.hoy;
  const ultimoRecord = p.records.length ? p.records.map((r) => r.fecha).reduce((a, b) => (a > b ? a : b)) : null;
  return {
    estado: estadoDeBloque(p.estado.lecturas, hoy, metodo),
    forma: estadoDeBloque(p.forma.lecturas, hoy, metodo),
    semanas: estadoDeBloque(p.semanas.lecturas, hoy, metodo),
    intensidad: estadoDeBloque(p.intensidad.lecturas, hoy, metodo),
    progreso: estadoDeBloque(p.progreso, hoy, metodo),
    records: estadoDeRecords(p.records, hoy, metodo),
    carrera: estadoDeCarrera(p.carrera, ultimoRecord, hoy, metodo),
    recuperacion: estadoDeBloque(p.recuperacion, hoy, metodo),
  };
}

export const lectura = (ls: readonly LecturaPanel[], id: string): LecturaPanel | undefined => ls.find((l) => l.id === id);
export const valorDe = (ls: readonly LecturaPanel[], id: string): number | null => lectura(ls, id)?.dato?.valor ?? null;

// ---------------------------------------------------------------------------
// Forma y fatiga: las series de la línea y las marcas
// ---------------------------------------------------------------------------

export function seriesForma(p: PanelAnaliticas, piel: Piel, formato: (v: number) => string): { series: SerieLinea[]; marcas: MarcaVertical[] } {
  const forma = lectura(p.forma.lecturas, 'forma.forma');
  const fatiga = lectura(p.forma.lecturas, 'forma.fatiga');
  const series: SerieLinea[] = [];
  if (forma?.serie) series.push({ id: 'forma', etiqueta: 'Forma', puntos: forma.serie.hecho, color: piel.tinta, proyeccion: forma.serie.proyeccion, formato, rotuloFinal: true });
  if (fatiga?.serie) series.push({ id: 'fatiga', etiqueta: 'Fatiga', puntos: fatiga.serie.hecho, color: piel.tinta2, proyeccion: fatiga.serie.proyeccion, formato });
  const marcas: MarcaVertical[] = [];
  if (series.some((s) => s.proyeccion?.length)) marcas.push({ t: p.atleta.hoy, etiqueta: 'hoy', tipo: 'hoy' });
  if (p.atleta.carrera && series.some((s) => s.proyeccion?.some((q) => q.t === p.atleta.carrera!.fecha))) marcas.push({ t: p.atleta.carrera.fecha, etiqueta: p.atleta.carrera.nombre_es, tipo: 'evento' });
  return { series, marcas };
}

// ---------------------------------------------------------------------------
// Semana a semana: cubos con plan (contorno) y hecho (apilado por familia)
// ---------------------------------------------------------------------------

/** Cuántos cubos caben legibles: el mecanismo es del producto (`components/v2/analiticas/escala.ts`). */
export { agrupacionDe } from '@/components/v2/analiticas/escala';

export function cubosCarga(p: PanelAnaliticas, modo: 'carga' | 'horas', piel: Piel, agrupar = 1): Cubo[] {
  const porFamilia = new Map<FamiliaGrande, LecturaPanel>();
  for (const l of p.semanas.lecturas) {
    const f = FAMILIA_GRANDE[l.familia === 'todas' ? 'correr' : l.familia];
    if ((modo === 'carga' && l.id.startsWith('semanas.carga.')) || (modo === 'horas' && l.id.startsWith('semanas.horas.'))) porFamilia.set(f, l);
  }
  const alguna = [...porFamilia.values()][0];
  if (!alguna?.serie) return [];
  const t = agruparPuntos(alguna.serie.hecho, agrupar).map((q) => q.t);
  const hechoPor = new Map<FamiliaGrande, PuntoSerie[]>();
  const planPor = new Map<FamiliaGrande, PuntoSerie[]>();
  for (const [f, l] of porFamilia) {
    hechoPor.set(f, agruparPuntos(l.serie!.hecho, agrupar));
    if (l.serie!.plan) planPor.set(f, agruparPuntos(l.serie!.plan, agrupar));
  }
  const hoy = p.atleta.hoy;
  return t.map((fecha, i) => {
    let plan: number | null = null;
    for (const [, s] of planPor) {
      const v = s[i]?.v;
      if (v != null) plan = (plan ?? 0) + v;
    }
    return {
      t: fecha,
      plan: modo === 'carga' ? plan : null,
      partes: ORDEN_FAMILIAS.filter((f) => hechoPor.has(f)).map((f) => ({ code: f, etiqueta: FAMILIA_GRANDE_NOMBRE[f], valor: hechoPor.get(f)![i]?.v ?? 0, color: piel.familia[f] })),
      enCurso: i === t.length - 1 && fecha <= hoy,
    };
  });
}

export function leyendaFamilias(p: PanelAnaliticas, piel: Piel): Array<{ etiqueta: string; color: string }> {
  const presentes = new Set(p.semanas.lecturas.map((l) => FAMILIA_GRANDE[l.familia === 'todas' ? 'correr' : l.familia]));
  return ORDEN_FAMILIAS.filter((f) => presentes.has(f)).map((f) => ({ etiqueta: FAMILIA_GRANDE_NOMBRE[f], color: piel.familia[f] }));
}

export interface ResumenSesiones {
  total: number;
  hechas: number;
  dentro: number;
  sinPlan: number;
}

export function resumenSesiones(sesiones: readonly SesionResumen[]): ResumenSesiones {
  return {
    total: sesiones.length,
    hechas: sesiones.filter((s) => s.cumplimiento !== 'no-hecha').length,
    dentro: sesiones.filter((s) => s.cumplimiento === 'dentro').length,
    sinPlan: sesiones.filter((s) => s.cumplimiento === 'sin-plan').length,
  };
}

// ---------------------------------------------------------------------------
// Intensidad: cubos por zona y el reparto
// ---------------------------------------------------------------------------

export function cubosZonas(p: PanelAnaliticas, piel: Piel, agrupar = 1): Cubo[] {
  const zonas = p.intensidad.lecturas.filter((l) => l.serie && l.id.startsWith('intensidad.zona.'));
  if (zonas.length === 0) return [];
  const series = zonas.map((l) => ({ l, puntos: agruparPuntos(l.serie!.hecho, agrupar) }));
  const t = series[0]!.puntos.map((q) => q.t);
  return t.map((fecha, i) => ({
    t: fecha,
    plan: null,
    partes: series.map(({ l, puntos }, k) => ({ code: l.id, etiqueta: l.titulo_es, valor: puntos[i]?.v ?? 0, color: colorZonaDe(piel, k + 1) })),
    enCurso: i === t.length - 1,
  }));
}

export function leyendaZonas(p: PanelAnaliticas, piel: Piel): Array<{ etiqueta: string; color: string }> {
  return p.intensidad.lecturas.filter((l) => l.id.startsWith('intensidad.zona.')).map((l, k) => ({ etiqueta: l.titulo_es, color: colorZonaDe(piel, k + 1) }));
}

/** Las tres partes del reparto con su color: suave en Z1, media en Z3, dura en Z5 — el mismo espectro, plegado. */
export function partesPolarizacion(p: PanelAnaliticas, piel: Piel): Array<{ code: string; etiqueta: string; pct: number; color: string }> {
  const r = p.intensidad.polarizacion;
  if (!r) return [];
  const color: Record<string, string> = { baja: colorZonaDe(piel, 1), media: colorZonaDe(piel, 3), alta: colorZonaDe(piel, 5) };
  return r.partes.map((x) => ({ code: x.code, etiqueta: x.etiqueta_es, pct: x.pct ?? 0, color: color[x.code] ?? piel.tinta2 }));
}

// ---------------------------------------------------------------------------
// Carrera: los tramos con más hueco
// ---------------------------------------------------------------------------

export function huecosTop(c: PrevisionCarrera, n: number): Array<{ id: string; etiqueta: string; valor: number | null; nota?: string }> {
  return [...c.tramos]
    .filter((t) => t.hueco_s != null)
    .sort((a, b) => (b.hueco_s ?? 0) - (a.hueco_s ?? 0))
    .slice(0, n)
    .map((t) => ({ id: t.tramo, etiqueta: TRAMO_CARRERA_NOMBRE[t.tramo], valor: t.hueco_s }));
}

export function tramosEnOrden(c: PrevisionCarrera): Array<{ id: string; etiqueta: string; valor: number | null; nota?: string }> {
  return c.tramos.map((t) => ({ id: t.tramo, etiqueta: TRAMO_CARRERA_NOMBRE[t.tramo], valor: t.hueco_s ?? (t.previsto_s == null ? null : 0), nota: t.previsto_s == null ? 'sin marca' : undefined }));
}

/** Los tramos que faltan para tener un tiempo previsto. */
export function tramosSinDato(c: PrevisionCarrera): string[] {
  return c.tramos.filter((t) => t.previsto_s == null).map((t) => TRAMO_CARRERA_NOMBRE[t.tramo]);
}

export { FAMILIAS_GRANDES };
