// LOS DATOS DE EJEMPLO de «Carreras»: los ladrillos con los que se montan los
// veinte casos y lo que devuelven las dos hojas de entrada (el calendario y la
// búsqueda por nombre). NINGUNO sale de la base de producción (CONTRATO-UI §7;
// memoria «no hay atletas reales»): personas y tiempos inventados, pero con las
// cuentas cuadradas (un total = correr + estaciones + RoxZone, siempre), porque
// un ejemplo que no suma le enseña al diseño una carrera que no existe.

import type {
  AnalisisCarrera,
  CandidatoHyresult,
  CarreraPasada,
  CompaneroDeEquipo,
  EstacionVsReferencia,
  EventoCalendario,
  ParcialEstacion,
  ProximaCarrera,
  VueltaRitmo,
} from './contrato';
import { diasEntre, INDICES_ESTACION, sumaDias, ESTACION } from './formato';

/** El «hoy» de todos los casos: martes 29 de septiembre de 2026. */
export const HOY = '2026-09-29';
export const en = (dias: number) => sumaDias(HOY, dias);

// ── Ladrillos ─────────────────────────────────────────────────────────────────

export function proxima(
  raceId: number,
  nombre: string,
  dias: number | null,
  extra: Partial<ProximaCarrera> = {},
): ProximaCarrera {
  return {
    raceId,
    nombre,
    tipoEvento: 'hyrox',
    formato: 'singles',
    division: 'open',
    categoria: 'men',
    fecha: dias == null ? null : en(dias),
    lugar: null,
    metaS: null,
    diasHasta: dias,
    prioridad: 'target',
    ...extra,
  };
}

const estaciones = (segundos: Array<number | null>): ParcialEstacion[] =>
  INDICES_ESTACION.map((indice, i) => ({ indice, segundos: segundos[i] ?? null }));

export function pasada(
  raceId: number,
  nombre: string,
  fecha: string | null,
  resultadoS: number | null,
  extra: Partial<CarreraPasada> = {},
): CarreraPasada {
  return {
    raceId,
    nombre,
    fecha,
    tipoEvento: 'hyrox',
    formato: 'singles',
    division: 'open',
    resultadoS,
    correrS: null,
    roxzoneS: null,
    vueltas: [],
    estaciones: [],
    companeros: [],
    puesto: null,
    campo: null,
    ...extra,
  };
}

const equipo = (...nombres: string[]): CompaneroDeEquipo[] => nombres.map((nombre, i) => ({ posicion: i + 1, nombre }));

// ── El historial de Nora (todo cuadra: correr + estaciones + RoxZone = total) ──

export const INDIVIDUAL_2024_BCN = pasada(101, 'HYROX Barcelona', '2024-11-09', 4390, {
  correrS: 2284,
  roxzoneS: 310,
  vueltas: [262, 268, 274, 281, 288, 296, 303, 312],
  estaciones: estaciones([262, 196, 265, 248, 251, 132, 214, 228]),
  puesto: 690,
  campo: 1240,
});

export const INDIVIDUAL_2025_MAD = pasada(102, 'HYROX Madrid', '2025-03-08', 4268, {
  correrS: 2245,
  roxzoneS: 296,
  vueltas: [258, 265, 270, 276, 284, 290, 297, 305],
  estaciones: estaciones([252, 190, 255, 240, 246, 128, 206, 210]),
  puesto: 588,
  campo: 1310,
});

export const INDIVIDUAL_2025_BCN = pasada(103, 'HYROX Barcelona', '2025-11-02', 4166, {
  correrS: 2216,
  roxzoneS: 288,
  vueltas: [256, 262, 267, 272, 279, 286, 293, 301],
  estaciones: estaciones([244, 182, 247, 228, 240, 124, 198, 199]),
  puesto: 502,
  campo: 1204,
});

export const INDIVIDUAL_2026_VLC = pasada(105, 'HYROX Valencia', '2026-05-16', 4012, {
  correrS: 2170,
  roxzoneS: 280,
  vueltas: [252, 258, 262, 268, 271, 279, 286, 294],
  estaciones: estaciones([232, 168, 231, 210, 236, 118, 182, 185]),
  puesto: 412,
  campo: 1180,
});

export const DOBLES_2026_GIR = pasada(104, 'HYROX Girona', '2026-02-14', 3745, {
  formato: 'doubles',
  division: 'open',
  correrS: 1960,
  roxzoneS: 245,
  vueltas: [232, 238, 241, 245, 246, 249, 253, 256],
  estaciones: estaciones([200, 150, 204, 190, 210, 112, 236, 238]),
  companeros: equipo('Aina Ferrer'),
  puesto: 88,
  campo: 420,
});

export const DOBLES_2025_MAD = pasada(106, 'HYROX Madrid', '2025-06-21', 3822, {
  formato: 'doubles',
  correrS: 2003,
  roxzoneS: 258,
  vueltas: [236, 243, 246, 250, 252, 255, 259, 262],
  estaciones: estaciones([204, 152, 208, 193, 215, 114, 238, 237]),
  companeros: equipo('Aina Ferrer'),
  puesto: 121,
  campo: 388,
});

export const RELEVO_2025_VLC = pasada(107, 'HYROX Valencia', '2025-05-17', 3410, {
  formato: 'relay',
  correrS: 1780,
  roxzoneS: 200,
  vueltas: [215, 218, 220, 222, 224, 226, 227, 228],
  estaciones: estaciones([185, 138, 190, 175, 195, 98, 212, 237]),
  companeros: equipo('Aina Ferrer', 'Joan Puig', 'Pau Serra'),
  puesto: 34,
  campo: 152,
});

/** Una carrera importada con las estaciones que sí trajo y nada más: sin vueltas, sin RoxZone, sin puesto. */
export const INDIVIDUAL_SIN_VUELTAS = pasada(108, 'HYROX Girona', '2025-01-25', 4520, {
  correrS: null,
  roxzoneS: null,
  vueltas: [],
  estaciones: estaciones([255, 200, 262, 250, 258, 136, 220, 232]),
  puesto: null,
  campo: null,
});

// ── El análisis de Valencia (la última individual) ────────────────────────────

/**
 * Una estación: tiempo, delta contra el entreno, y el puesto entre el campo como
 * `fraccion`+`severidad` (más corta = mejor puesto; el servidor la fija con el
 * cuarto y la mitad de arriba del campo).
 */
const estacion = (
  indice: number,
  tiempoS: number | null,
  deltaS: number | null,
  fraccion: number | null,
  severidad: EstacionVsReferencia['severidad'],
): EstacionVsReferencia => ({ estacion: ESTACION[indice], tiempoS, deltaS, fraccion, severidad });

export const ESTACIONES_VALENCIA: EstacionVsReferencia[] = [
  estacion(2, 232, 5, 0.38, 'slightly_worse'),
  estacion(4, 168, -6, 0.22, 'better'),
  estacion(6, 231, 31, 0.58, 'worse'),
  estacion(8, 210, -4, 0.33, 'slightly_worse'),
  estacion(10, 236, -8, 0.19, 'better'),
  estacion(12, 118, 2, 0.15, 'better'),
  estacion(14, 182, 12, 0.47, 'slightly_worse'),
  estacion(16, 185, 26, 0.66, 'worse'),
];

const ritmo = (km: number, ritmoS: number, altura: number, severidad: VueltaRitmo['severidad']): VueltaRitmo => ({ km, ritmoS, altura, severidad });

/**
 * El análisis de una carrera que solo trajo los tiempos: sin puesto por estación
 * ni entreno con el que comparar, así que cada fila es SOLO su tiempo.
 */
export function analisisSoloTiempos(carrera: CarreraPasada, conVueltas: VueltaRitmo[] = []): AnalisisCarrera {
  return {
    deCarrera: { raceId: carrera.raceId, nombre: carrera.nombre, fecha: carrera.fecha },
    estaciones: carrera.estaciones.map((e) => ({ estacion: ESTACION[e.indice], tiempoS: e.segundos, deltaS: null, fraccion: null, severidad: null })),
    caidaRitmoS: null,
    ritmoPorKm: conVueltas,
    informe: null,
    predichoVsReal: null,
  };
}

export const RITMO_VALENCIA: VueltaRitmo[] = [
  ritmo(1, 252, 0.857, 'better'),
  ritmo(2, 258, 0.878, 'better'),
  ritmo(3, 262, 0.891, 'better'),
  ritmo(4, 268, 0.912, 'slightly_worse'),
  ritmo(5, 271, 0.922, 'slightly_worse'),
  ritmo(6, 279, 0.949, 'worse'),
  ritmo(7, 286, 0.973, 'worse'),
  ritmo(8, 294, 1, 'worse'),
];

export const ANALISIS_VALENCIA: AnalisisCarrera = {
  deCarrera: { raceId: 105, nombre: 'HYROX Valencia', fecha: '2026-05-16' },
  estaciones: ESTACIONES_VALENCIA,
  caidaRitmoS: 23,
  ritmoPorKm: RITMO_VALENCIA,
  informe: null,
  predichoVsReal: { predijimosS: 4050, hicisteS: 4012, precisionPct: 99, precisionPalabra: 'clavado' },
};

// ── El calendario (lo que devuelve «Buscar carrera») ──────────────────────────

const evento = (
  id: string,
  nombre: string,
  familia: EventoCalendario['familia'],
  serie: string | null,
  ciudad: string,
  pais: string,
  dias: number | null,
  extra: Partial<EventoCalendario> = {},
): EventoCalendario => ({
  id,
  nombre,
  familia,
  serie,
  pais,
  ciudad,
  fecha: dias == null ? null : en(dias),
  provisional: dias == null,
  tipoEvento: familia === 'hybrid' ? 'hyrox' : 'other',
  ...extra,
});

export const CALENDARIO: EventoCalendario[] = [
  evento('e1', 'HYROX Barcelona', 'hybrid', 'HYROX', 'Barcelona', 'ES', 39),
  evento('e2', 'HYROX Madrid', 'hybrid', 'HYROX', 'Madrid', 'ES', 12),
  evento('e3', 'HYROX Girona', 'hybrid', 'HYROX', 'Girona', 'ES', 71),
  evento('e4', 'DEKA Mile Sevilla', 'hybrid', 'DEKA', 'Sevilla', 'ES', 96, { tipoEvento: 'deka' }),
  evento('e5', 'HYROX Lisboa', 'hybrid', 'HYROX', 'Lisboa', 'PT', 124),
  evento('e6', 'HYROX Valencia', 'hybrid', 'HYROX', 'Valencia', 'ES', null),
  evento('e7', 'Mitja Marató de Barcelona', 'running', 'RFEA', 'Barcelona', 'ES', 141),
  evento('e8', 'CrossFit Open Iberia', 'crossfit', 'CrossFit', 'Madrid', 'ES', 168),
];

export const FAMILIAS: Array<{ id: EventoCalendario['familia']; etiqueta: string }> = [
  { id: 'running', etiqueta: 'Running' },
  { id: 'hybrid', etiqueta: 'Híbrida' },
  { id: 'crossfit', etiqueta: 'CrossFit' },
  { id: 'ocr', etiqueta: 'OCR' },
  { id: 'other', etiqueta: 'Otro' },
];

/** Hasta cuándo mira cada chip de «Fecha» (en meses; null = sin límite). */
export const VENTANAS_FECHA: Array<{ id: string; etiqueta: string; meses: number | null }> = [
  { id: 'todas', etiqueta: 'Cualquiera', meses: null },
  { id: '3m', etiqueta: '3 meses', meses: 3 },
  { id: '6m', etiqueta: '6 meses', meses: 6 },
  { id: '12m', etiqueta: '12 meses', meses: 12 },
];

// ── La búsqueda por nombre (lo que devuelve «Importar carrera») ───────────────

export const CANDIDATOS: CandidatoHyresult[] = [
  { id: 'c1', nombre: 'Marc Vila Soler', slug: 'marc-vila-soler', nCarreras: 5, pais: 'ESP', nivel: null },
  { id: 'c2', nombre: 'Marc Vila', slug: 'marc-vila', nCarreras: 2, pais: 'ESP', nivel: 'PRO' },
  { id: 'c3', nombre: 'Marco Vilá', slug: 'marco-vila', nCarreras: 9, pais: 'ITA', nivel: 'ELITE' },
];

/** El historial que trae importar el perfil `marc-vila-soler` (el del atleta de ejemplo). */
export const HISTORIAL_IMPORTABLE = {
  pasadas: [INDIVIDUAL_2026_VLC, DOBLES_2026_GIR, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD, INDIVIDUAL_2024_BCN],
  analisis: ANALISIS_VALENCIA,
};

/** Reglas de la búsqueda de ejemplo, dichas en la propia hoja: qué escribir para ver cada estado. */
export const PISTAS_BUSQUEDA = {
  vacio: 'zzz',
  error: 'error',
} as const;

/** Días que faltan de `hoy` a una fecha (para la hoja «Fijar objetivo», que la puede mover). */
export const diasHasta = (fecha: string) => Math.max(0, diasEntre(HOY, fecha));

// ── Las reglas del prototipo de las dos hojas de entrada ──────────────────────

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export type ResultadoBusqueda = { tipo: 'ok'; candidatos: CandidatoHyresult[] } | { tipo: 'vacio' } | { tipo: 'error' };

/**
 * La búsqueda por nombre del doble: «error» falla, «zzz» no encuentra nada y el
 * resto casa por trozos del nombre sin mirar acentos. En la app es
 * `GET /race-results/search`, que exige al menos dos letras.
 */
export function buscarCandidatos(consulta: string): ResultadoBusqueda {
  const q = sinAcentos(consulta.trim());
  if (q.length < 2) return { tipo: 'vacio' };
  if (q.includes(PISTAS_BUSQUEDA.error)) return { tipo: 'error' };
  const trozos = q.split(/\s+/).filter(Boolean);
  const candidatos = CANDIDATOS.filter((c) => trozos.every((t) => sinAcentos(c.nombre).includes(t)));
  return candidatos.length > 0 ? { tipo: 'ok', candidatos } : { tipo: 'vacio' };
}

/** Importar `marco-vila` falla (perfil ilegible) para poder ver el error del paso de confirmar. */
export const SLUG_QUE_FALLA = 'marco-vila';

/** Lo que el cliente comprueba antes de mandar un enlace: https y el host de resultados de HYROX. */
export const HOST_RESULTADOS = 'results.hyrox.com';
export function pareceEnlaceHyrox(texto: string): boolean {
  try {
    const u = new URL(texto.trim());
    return u.protocol === 'https:' && u.hostname.toLowerCase() === HOST_RESULTADOS;
  } catch {
    return false;
  }
}

export interface FiltroCalendario {
  consulta: string;
  familia: EventoCalendario['familia'] | null;
  /** Meses que cubre el chip de «Fecha»; `null` = sin límite. */
  meses: number | null;
  serie?: string | null;
  pais?: string | null;
}

/**
 * Lo que devuelve el calendario para un filtro: el texto, la familia y la ventana de
 * fechas los aplica el SERVIDOR; la serie y el país son facetas del cliente, derivadas de
 * lo ya cargado (nunca una lista escrita a mano), como en la app.
 */
export function eventosVisibles(eventos: EventoCalendario[], f: FiltroCalendario): EventoCalendario[] {
  return eventosCargados(eventos, f).filter((e) => (f.serie == null || e.serie === f.serie) && (f.pais == null || e.pais === f.pais));
}

/** Lo que trae el servidor: texto, familia y fechas, sin las facetas del cliente. */
export function eventosCargados(eventos: EventoCalendario[], f: FiltroCalendario): EventoCalendario[] {
  const q = sinAcentos(f.consulta.trim());
  const tope = f.meses == null ? null : sumaDias(HOY, Math.round(f.meses * 30.4));
  return eventos
    .filter((e) => (f.familia == null || e.familia === f.familia) && (q.length < 2 || sinAcentos(`${e.nombre} ${e.ciudad ?? ''}`).includes(q)))
    .filter((e) => tope == null || e.fecha == null || e.fecha <= tope)
    .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'));
}

/** Las series y los países que hay en lo cargado, ordenados. Una faceta con un solo valor no se ofrece. */
export function facetas(cargados: EventoCalendario[]): { series: string[]; paises: string[] } {
  const distintos = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  return { series: distintos(cargados.map((e) => e.serie)), paises: distintos(cargados.map((e) => e.pais)) };
}

// ── La meta: los peldaños con los que habla el atleta ─────────────────────────

/**
 * «Sub-60 … Sub-90» y su etiqueta, tal cual están en la app (`GoalPreset`). Los
 * descriptores («élite», «top 25 %») son de la app y no citan fuente: se copian, no se
 * avalan (queda dicho en el informe).
 */
export const PELDANOS_META: Array<{ segundos: number; titulo: string; descriptor: string }> = [
  { segundos: 3600, titulo: 'Sub-60', descriptor: 'élite' },
  { segundos: 4200, titulo: 'Sub-70', descriptor: 'avanzado' },
  { segundos: 4800, titulo: 'Sub-80', descriptor: 'top 25 %' },
  { segundos: 5400, titulo: 'Sub-90', descriptor: 'la referencia' },
];
