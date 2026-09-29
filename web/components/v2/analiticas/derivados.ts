// LOS DERIVADOS DE VISTA — lo que un bloque necesita del sobre y no viene
// listo para dibujar: los cubos de una barra apilada, las series de una línea
// con su proyección y sus marcas, la frase del veredicto de forma, las filas de
// una tabla. Viven aquí y no en el bloque para que el panel del coach y el doble
// pinten LO MISMO desde el mismo JSON (A1).
//
// NO SE CALCULA NADA DEL ATLETA. Se agrupa lo que el servidor ya calculó (las
// familias finas en sus familias grandes, las semanas de 2 en 2 cuando no
// caben) y se escribe lo que el servidor ya dijo. Un veredicto que el servidor
// retiró se explica con SU falta; no se reemplaza por uno de la pantalla.
//
// Puro. Lo único que toma de la piel es el color de cada parte.

import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Familia, Lectura, PuntoSerie } from '@fahybrid/shared/domain/analytics/lectura';
import { esDecimal } from '@/lib/formato';
import { agruparPuntos, lunesDe, sumarDias } from './escala';
import type { Cubo, MarcaVertical, SerieLinea } from './graficos';
import { conPrefijo, falta, lectura, medida } from './lecturas';
import { FAMILIA_GRANDE, FAMILIA_GRANDE_NOMBRE, ORDEN_FAMILIAS, colorZonaDe, type FamiliaGrande, type Piel } from './piel';

// ---------------------------------------------------------------------------
// Forma y fatiga
// ---------------------------------------------------------------------------

export interface VistaForma {
  series: SerieLinea[];
  marcas: MarcaVertical[];
  frescura: { puntos: PuntoSerie[]; proyeccion: PuntoSerie[] | null } | null;
}

/**
 * Las dos curvas (forma, fatiga) con su proyección hasta la carrera, la
 * frescura debajo y las marcas: «hoy» cuando hay proyección, y la carrera en el
 * último día proyectado (su nombre, si la carrera de la ficha cae ese día).
 */
export function vistaForma(forma: readonly Lectura[], piel: Piel, hoy: string, carrera: { nombre: string; fecha: string } | null): VistaForma {
  const fondo = medida(forma, 'carga.fondo');
  const reciente = medida(forma, 'carga.reciente');
  const fres = medida(forma, 'carga.frescura');
  const series: SerieLinea[] = [];
  const entero = (v: number) => String(Math.round(v));
  const futuro = (p: PuntoSerie[] | null | undefined) => (p ?? []).filter((q) => q.t > hoy);
  if (fondo?.serie) series.push({ id: 'forma', etiqueta: 'Forma', puntos: fondo.serie.puntos, color: piel.tinta, proyeccion: futuro(fondo.serie.plan), formato: entero, rotuloFinal: true });
  if (reciente?.serie) series.push({ id: 'fatiga', etiqueta: 'Fatiga', puntos: reciente.serie.puntos, color: piel.tinta2, proyeccion: futuro(reciente.serie.plan), formato: entero });
  const marcas: MarcaVertical[] = [];
  const proyeccion = series.find((s) => s.proyeccion && s.proyeccion.length > 0)?.proyeccion ?? null;
  if (proyeccion && proyeccion.length > 0) {
    marcas.push({ t: hoy, etiqueta: 'hoy', tipo: 'hoy' });
    const ultimo = proyeccion[proyeccion.length - 1]!.t;
    marcas.push({ t: ultimo, etiqueta: carrera && carrera.fecha === ultimo ? carrera.nombre : 'Carrera', tipo: 'evento' });
  }
  return {
    series,
    marcas,
    frescura: fres?.serie ? { puntos: fres.serie.puntos, proyeccion: futuro(fres.serie.plan) } : null,
  };
}

/**
 * La frase del veredicto de forma, en la voz del coach, con LO QUE DIJO EL
 * SERVIDOR: la palabra de la subida (sostenible · rápido · bajando) y su
 * número, y el porcentaje de carga con umbral estimado cuando lo hay. Si el
 * servidor retiró la palabra, se dice por qué con su falta — nunca otra palabra.
 */
export function fraseForma(forma: readonly Lectura[], metodo: Pick<CoachAnalyticsMethod, 'ramp_alert_tss_per_week' | 'cobertura_veredicto_min_pct'>): { texto: string; retirada: boolean } | null {
  const fres = lectura(forma, 'carga.frescura');
  if (!fres || fres.estado !== 'medida') return null;
  const subida = medida(forma, 'carga.subida');
  const aviso = `+${metodo.ramp_alert_tss_per_week}`;
  const partes: string[] = [];
  let retirada = false;
  if (subida?.veredicto) {
    const x = esDecimal(Math.abs(subida.dato.valor), 1);
    const et = subida.veredicto.etiqueta_es;
    if (subida.veredicto.code === 'sube_rapido') partes.push(`${et}: la forma sube ${x} por semana, por encima de tu aviso (${aviso}).`);
    else if (subida.veredicto.code === 'baja') partes.push(`${et}: la forma baja ${x} por semana.`);
    else partes.push(`${et}: la forma ${subida.dato.valor < 0 ? 'baja' : 'sube'} ${x} por semana, por debajo de tu aviso (${aviso}).`);
  }
  if (fres.veredicto == null) {
    retirada = true;
    const f = falta(fres);
    const cobertura = medida(forma, 'carga.cobertura');
    if (f?.por === 'historia') {
      partes.push(`Todavía sin palabra: la forma es la media de ${f.hacen} días y lleva ${f.llevas} ${f.llevas === 1 ? 'día' : 'días'} de historia.`);
    } else if (f?.por === 'ancla') {
      partes.push('Sin palabra: tiene pulso en sus entrenos pero ningún umbral que cuente. Con su umbral de pulso, esa carga se calcula.');
    } else if (f?.por === 'esfuerzo') {
      const pct = cobertura ? `${Math.round(cobertura.dato.valor)} %` : 'menos';
      partes.push(
        `Sin palabra: se ha podido calcular el ${pct} de su carga y pides el ${Math.round(metodo.cobertura_veredicto_min_pct)} %${f.sesiones > 0 ? `; ${f.sesiones} ${f.sesiones === 1 ? 'sesión no tiene' : 'sesiones no tienen'} ni pulso ni esfuerzo puntuado` : ''}.`,
      );
    } else {
      partes.push('Sin palabra: la cobertura de la carga no la sostiene.');
    }
  } else if (fres.veredicto.frase_es) {
    partes.push(fres.veredicto.frase_es);
  }
  return partes.length > 0 ? { texto: partes.join(' '), retirada } : null;
}

/** El pie de «Carga calculada»: qué parte no es medida ni declarada, en dos trozos como mucho. */
export function pieCobertura(forma: readonly Lectura[]): string | null {
  const c = medida(forma, 'carga.cobertura');
  if (!c?.reparto) return null;
  const pct = (code: string) => c.reparto!.partes.find((p) => p.code === code)?.pct ?? 0;
  const trozos: string[] = [];
  if (pct('estimada') >= 0.5) trozos.push(`${Math.round(pct('estimada'))} % con umbral estimado`);
  if (pct('esfuerzo') >= 0.5) trozos.push(`${Math.round(pct('esfuerzo'))} % por esfuerzo`);
  if (pct('sin_saber') >= 0.5) trozos.push(`${Math.round(pct('sin_saber'))} % sin medir ni puntuar`);
  return trozos.length > 0 ? trozos.slice(0, 2).join(' · ') : 'todo medido o declarado';
}

// ---------------------------------------------------------------------------
// Semana a semana
// ---------------------------------------------------------------------------

/** ¿Está en curso la semana que empieza en `lunes`? (no ha llegado su domingo). */
function semanaEnCurso(lunes: string, hoy: string): boolean {
  return lunesDe(hoy) === lunes && hoy < sumarDias(lunes, 6);
}

function sumarAgrupado(series: ReadonlyArray<PuntoSerie[]>, i: number): number | null {
  let hay = false;
  let s = 0;
  for (const p of series) {
    const v = p[i]?.v;
    if (v != null) {
      hay = true;
      s += v;
    }
  }
  return hay ? s : null;
}

/**
 * Los cubos de «Semana a semana». En carga, lo hecho apilado por familia grande
 * (las finas se suman: remo + ski + bici = ergo) y el plan en contorno; en
 * horas, el motor sirve el total por semana (no por familia): una sola barra.
 */
export function cubosSemanas(semanas: readonly Lectura[], modo: 'carga' | 'horas', piel: Piel, agrupar: number, hoy: string): Cubo[] {
  const total = medida(semanas, modo === 'carga' ? 'semanas.carga' : 'semanas.horas');
  if (!total?.serie || total.serie.puntos.length === 0) return [];
  const t = agruparPuntos(total.serie.puntos, agrupar).map((p) => p.t);
  const plan = total.serie.plan ? agruparPuntos(total.serie.plan, agrupar) : null;
  let partesPor: Array<{ code: string; etiqueta: string; color: string; puntos: PuntoSerie[] }>;
  if (modo === 'carga') {
    const porGrande = new Map<FamiliaGrande, PuntoSerie[][]>();
    for (const l of conPrefijo(semanas, 'semanas.carga.')) {
      if (l.estado !== 'medida' || !l.serie || !l.familia) continue;
      const g = FAMILIA_GRANDE[l.familia as Familia] ?? 'otro';
      const lista = porGrande.get(g) ?? [];
      lista.push(agruparPuntos(l.serie.puntos, agrupar));
      porGrande.set(g, lista);
    }
    partesPor = ORDEN_FAMILIAS.filter((g) => porGrande.has(g)).map((g) => {
      const series = porGrande.get(g)!;
      return { code: g, etiqueta: FAMILIA_GRANDE_NOMBRE[g], color: piel.familia[g], puntos: t.map((f, i) => ({ t: f, v: sumarAgrupado(series, i) })) };
    });
  } else {
    partesPor = [{ code: 'horas', etiqueta: 'Horas hechas', color: piel.tinta2, puntos: agruparPuntos(total.serie.puntos, agrupar) }];
  }
  return t.map((fecha, i) => ({
    t: fecha,
    plan: plan?.[i]?.v ?? null,
    partes: partesPor.map((p) => ({ code: p.code, etiqueta: p.etiqueta, valor: p.puntos[i]?.v ?? 0, color: p.color })),
    enCurso: i === t.length - 1 && agrupar === 1 && semanaEnCurso(fecha, hoy),
  }));
}

/** La leyenda de las familias que de verdad aparecen (en el orden de apilado). */
export function leyendaSemanas(cubos: readonly Cubo[]): Array<{ etiqueta: string; color: string }> {
  const vistas = new Map<string, { etiqueta: string; color: string }>();
  for (const c of cubos) for (const p of c.partes) if (p.valor > 0 && !vistas.has(p.code)) vistas.set(p.code, { etiqueta: p.etiqueta, color: p.color });
  const orden = [...ORDEN_FAMILIAS, 'horas'];
  return [...vistas.entries()].sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0])).map(([, v]) => v);
}

/**
 * La media por semana del periodo anterior, para la línea de «comparar»: el
 * total que el servidor sirve en la comparación, entre las semanas de ese
 * periodo (tiene la misma longitud que la ventana).
 */
export function mediaAnteriorPorSemana(semanas: readonly Lectura[], modo: 'carga' | 'horas', diasPeriodo: number, agrupar: number): number | null {
  const l = medida(semanas, modo === 'carga' ? 'semanas.carga' : 'semanas.horas');
  const anterior = l?.comparacion?.anterior;
  if (anterior == null || diasPeriodo <= 0) return null;
  return (anterior / (diasPeriodo / 7)) * agrupar;
}

export interface ResumenSesiones {
  /** El número de la cifra: las sesiones del plan que tocaban, o los entrenos hechos si no hay cumplimiento servido. */
  valor: number | null;
  etiqueta: string;
  pie: string | null;
}

/**
 * «Sesiones en la ventana». Con el cumplimiento servido (bloque `semanas`,
 * lecturas `semanas.adherencia` y `semanas.cumplimiento`): las que tocaban, las
 * hechas y las cumplidas. Sin él: los entrenos hechos, que es lo que hay.
 */
export function resumenSesiones(semanas: readonly Lectura[]): ResumenSesiones {
  const adherencia = medida(semanas, 'semanas.adherencia');
  const cumplimiento = medida(semanas, 'semanas.cumplimiento');
  const parte = (l: Lectura | null, code: string) => l?.reparto?.partes.find((p) => p.code === code)?.valor ?? null;
  if (adherencia?.reparto) {
    const hechas = parte(adherencia, 'hechas') ?? 0;
    const sin = parte(adherencia, 'no_hechas') ?? 0;
    const cumplidas = parte(cumplimiento, 'cumplida');
    return {
      valor: hechas + sin,
      etiqueta: 'Sesiones del plan',
      pie: `${hechas} hechas${cumplidas != null ? ` · ${cumplidas} dentro de lo pedido` : ''}`,
    };
  }
  const entrenos = medida(semanas, 'semanas.sesiones');
  return { valor: entrenos ? Math.round(entrenos.dato.valor) : null, etiqueta: 'Entrenos en la ventana', pie: entrenos ? 'hechos, del plan o libres' : null };
}

// ---------------------------------------------------------------------------
// Intensidad
// ---------------------------------------------------------------------------

/** Las cinco zonas por semana (horas), apiladas de Z1 abajo a Z5 arriba. */
export function cubosZonas(intensidad: readonly Lectura[], piel: Piel, agrupar: number, hoy: string): Cubo[] {
  const zonas = [1, 2, 3, 4, 5].map((z) => medida(intensidad, `intensidad.z${z}`)).filter((l): l is NonNullable<typeof l> => l?.serie != null);
  if (zonas.length === 0) return [];
  const series = zonas.map((l) => ({ l, puntos: agruparPuntos(l.serie!.puntos, agrupar) }));
  const t = series[0]!.puntos.map((q) => q.t);
  return t.map((fecha, i) => ({
    t: fecha,
    plan: null,
    partes: series.map(({ l, puntos }) => ({ code: l.id, etiqueta: l.titulo_es, valor: puntos[i]?.v ?? 0, color: colorZonaDe(piel, Number(l.id.slice(-1))) })),
    enCurso: i === t.length - 1 && agrupar === 1 && semanaEnCurso(fecha, hoy),
  }));
}

export function leyendaZonas(intensidad: readonly Lectura[], piel: Piel): Array<{ etiqueta: string; color: string }> {
  return [1, 2, 3, 4, 5]
    .map((z) => lectura(intensidad, `intensidad.z${z}`))
    .filter((l): l is Lectura => l != null)
    .map((l) => ({ etiqueta: l.titulo_es, color: colorZonaDe(piel, Number(l.id.slice(-1))) }));
}

export interface VistaReparto {
  partes: Array<{ code: string; etiqueta: string; pct: number; color: string }>;
  /** El % de fácil que pide el coach (la marca sobre la barra). */
  objetivo_pct: number | null;
  /** Horas con pulso que se repartieron. */
  total_h: number;
}

/** Fácil · medio · duro con el color del espectro plegado (Z1, Z3, Z5) y el objetivo del coach. */
export function vistaReparto(intensidad: readonly Lectura[], piel: Piel): VistaReparto | null {
  const l = medida(intensidad, 'intensidad.polarizacion');
  if (!l?.reparto) return null;
  const color: Record<string, string> = { facil: colorZonaDe(piel, 1), medio: colorZonaDe(piel, 3), duro: colorZonaDe(piel, 5) };
  return {
    partes: l.reparto.partes.map((p) => ({ code: p.code, etiqueta: p.etiqueta_es, pct: p.pct ?? 0, color: color[p.code] ?? piel.tinta2 })),
    objetivo_pct: l.dato.referencia?.valor ?? null,
    total_h: l.reparto.total,
  };
}

// ---------------------------------------------------------------------------
// Récords
// ---------------------------------------------------------------------------

export interface FilaRecord {
  id: string;
  familia: Familia | null;
  prueba: string;
  l: Lectura & { dato: NonNullable<Lectura['dato']> };
  /** El día del récord: el último punto de su progresión. */
  fecha: string | null;
  nuevo: boolean;
}

export function filasRecords(records: readonly Lectura[]): FilaRecord[] {
  return records
    .filter((l): l is Lectura & { dato: NonNullable<Lectura['dato']> } => l.estado === 'medida' && l.dato != null)
    .map((l) => ({
      id: l.id,
      familia: l.familia,
      prueba: l.titulo_es,
      l,
      fecha: l.serie?.puntos.length ? l.serie.puntos[l.serie.puntos.length - 1]!.t : null,
      nuevo: l.veredicto?.code === 'nuevo',
    }));
}

// ---------------------------------------------------------------------------
// Carrera
// ---------------------------------------------------------------------------

export interface FilaTramoCarrera {
  id: string;
  etiqueta: string;
  /** El hueco: previsto − presupuesto del objetivo. Positivo = le falta. */
  valor: number | null;
  nota?: string;
}

/** Los tramos de la previsión con su hueco contra el reparto del objetivo, en el orden del recorrido. */
export function tramosCarrera(carrera: readonly Lectura[]): FilaTramoCarrera[] {
  return conPrefijo(carrera, 'carrera.tramo.').map((l) => {
    if (l.estado !== 'medida' || !l.dato) return { id: l.id, etiqueta: l.titulo_es, valor: null, nota: 'sin marca' };
    const ref = l.dato.referencia;
    return ref ? { id: l.id, etiqueta: l.titulo_es, valor: ref.delta } : { id: l.id, etiqueta: l.titulo_es, valor: null, nota: 'sin objetivo' };
  });
}
