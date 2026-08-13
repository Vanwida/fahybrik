// LOS ESCENARIOS — datos inventados, realistas, JAMÁS del seed real.
//
// `HOY` fija el punto desde el que cuentan los periodos móviles (7d/Mes/Año).
// Es el mismo 13-ago-2026 en el que se diseñó esta pantalla; las fechas de las
// filas son reales de agosto de 2026 (verificadas día a día, no aproximadas),
// así que «mar 11» cae en martes de verdad y no es un rótulo de attrezzo.

import type { CarreraFila, Periodo, TipoRun } from './modelo';

export const HOY = '2026-08-13';

// ---------------------------------------------------------------------------
// ① El mes lleno — 4 semanas, 14 salidas, los siete tipos representados
// ---------------------------------------------------------------------------

const MES_LLENO: CarreraFila[] = [
  // Semana del 20-jul
  { fecha: '2026-07-21', tipo: 'rodaje', km: 8.2, ritmoSKm: 320, fcMedia: 148, origen: 'coach', veredicto: 'ok' },
  {
    fecha: '2026-07-23',
    tipo: 'series',
    nombre: '6×800',
    km: 9.1,
    ritmoSKm: 312,
    fcMedia: 168,
    origen: 'coach',
    veredicto: 'ok',
  },
  { fecha: '2026-07-25', tipo: 'largo', km: 16, ritmoSKm: 345, fcMedia: 152, origen: 'coach', veredicto: 'ok' },

  // Semana del 27-jul
  { fecha: '2026-07-28', tipo: 'rodaje', km: 7.5, ritmoSKm: 325, fcMedia: 145, origen: 'coach', veredicto: 'ok' },
  {
    fecha: '2026-07-29',
    tipo: 'cuesta',
    nombre: '8×200',
    km: 6.3,
    ritmoSKm: 350,
    fcMedia: 162,
    origen: 'coach',
    veredicto: 'ok',
  },
  // Sesgo rápido: el veredicto ámbar de la maqueta.
  { fecha: '2026-07-31', tipo: 'tempo', km: 10, ritmoSKm: 275, fcMedia: 168, origen: 'coach', veredicto: 'aviso' },
  // Importada del reloj: sin veredicto, nadie le pidió nada.
  { fecha: '2026-08-02', tipo: 'largo', km: 18, ritmoSKm: 340, fcMedia: 150, origen: 'garmin' },

  // Semana del 03-ago
  { fecha: '2026-08-03', tipo: 'rodaje', km: 6, ritmoSKm: 330, fcMedia: 142, origen: 'coach', veredicto: 'ok' },
  {
    fecha: '2026-08-05',
    tipo: 'series',
    nombre: '5×1000',
    km: 10.4,
    ritmoSKm: 290,
    fcMedia: 170,
    origen: 'coach',
    veredicto: 'ok',
    record: true,
  },
  // Cinta importada: la correa, no el coach.
  { fecha: '2026-08-06', tipo: 'cinta', km: 8, ritmoSKm: 300, fcMedia: 155, origen: 'garmin' },
  {
    fecha: '2026-08-08',
    tipo: 'fartlek',
    nombre: '10×1′',
    km: 9,
    ritmoSKm: 305,
    fcMedia: 160,
    origen: 'coach',
    veredicto: 'ok',
  },
  { fecha: '2026-08-09', tipo: 'largo', km: 14, ritmoSKm: 335, fcMedia: 148, origen: 'coach', veredicto: 'ok' },

  // Semana del 10-ago (en curso: solo lunes y miércoles, hoy es jueves)
  { fecha: '2026-08-10', tipo: 'rodaje', km: 7, ritmoSKm: 315, fcMedia: 144, origen: 'coach', veredicto: 'ok' },
  { fecha: '2026-08-12', tipo: 'tempo', km: 8, ritmoSKm: 280, fcMedia: 165, origen: 'coach', veredicto: 'ok' },
];

// ---------------------------------------------------------------------------
// ③ El recién llegado — 2 semanas escasas, 3 salidas, todas rodaje
// ---------------------------------------------------------------------------

const NUEVO: CarreraFila[] = [
  { fecha: '2026-08-05', tipo: 'rodaje', km: 4, ritmoSKm: 375, fcMedia: 138, origen: 'coach', veredicto: 'ok' },
  { fecha: '2026-08-11', tipo: 'rodaje', km: 5, ritmoSKm: 365, fcMedia: 140, origen: 'coach', veredicto: 'ok' },
  { fecha: '2026-08-13', tipo: 'rodaje', km: 5.5, ritmoSKm: 355, fcMedia: 143, origen: 'coach', veredicto: 'ok' },
];

// ---------------------------------------------------------------------------
// ④ Cero carreras
// ---------------------------------------------------------------------------

const VACIO: CarreraFila[] = [];

export const DATASETS: Record<string, CarreraFila[]> = {
  'mes-lleno': MES_LLENO,
  nuevo: NUEVO,
  vacio: VACIO,
};

// ---------------------------------------------------------------------------
// Qué estado inicial de UI enciende cada escenario del panel
// ---------------------------------------------------------------------------

export interface ConfigEscenario {
  datasetId: string;
  periodoInicial: Periodo;
  tipoInicial: TipoRun | 'todos';
  filtroAbiertoInicial: boolean;
}

export const CONFIG_ESCENARIO: Record<string, ConfigEscenario> = {
  'mes-lleno': { datasetId: 'mes-lleno', periodoInicial: 'mes', tipoInicial: 'todos', filtroAbiertoInicial: false },
  // Mismo mes, mismos datos: lo único que cambia es el filtro, para que se vea
  // que los agregados de arriba se RECALCULAN sobre lo filtrado.
  filtrado: { datasetId: 'mes-lleno', periodoInicial: 'mes', tipoInicial: 'series', filtroAbiertoInicial: true },
  nuevo: { datasetId: 'nuevo', periodoInicial: 'mes', tipoInicial: 'todos', filtroAbiertoInicial: false },
  vacio: { datasetId: 'vacio', periodoInicial: 'mes', tipoInicial: 'todos', filtroAbiertoInicial: false },
};
