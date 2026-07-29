// La batería de calibración REAL del coach 60 (Pablo Amigo), leída de
// `coach_calibration_tests` + `coach_test_results` + `coach_test_schedule` el
// 28-jul-2026. Cuatro tests, todos habilitados, todos programados en la semana 1.
//
// El detalle que hace honesto el escenario del atleta 64: la Batería 1RM pide
// TRES resultados obligatorios (`optional = false`) y él solo tiene dos —
// sentadilla y peso muerto—, así que no está calibrado, está a medias. Con la
// pantalla de hoy eso no se ve por ningún sitio.

import type { Modalidad } from '../../kit-composicion/chrome';

export interface ResultadoTest {
  label: string;
  /** La cifra medida, SOLO la cifra (el monoespaciado es voz de readout). */
  valor?: string;
  /** Su unidad, que va en sans al lado. */
  unidad?: string;
}

export interface TestCalibracion {
  slug: string;
  nombre: string;
  /** Cubo canónico de Theme.Modality.Kind — el remo es `ergo`, no «row». */
  modalidad: Modalidad;
  /** Qué desbloquea (columna `derives`). */
  desbloquea: string | null;
  /** Día programado, tal cual lo publica el coach. */
  dia: string;
  resultados: ResultadoTest[];
}

export interface EstadoTests {
  id: string;
  /** ¿El coach ha publicado ya la programación? Si no, no hay nada que hacer. */
  programado: boolean;
  tests: TestCalibracion[];
  /** Umbral resuelto, si alguna evidencia lo ancla. Sin ancla no hay zonas. */
  umbralPpm: number | null;
  modalidadesConZona: number;
}

const CATALOGO: TestCalibracion[] = [
  {
    slug: 'one_rm_battery',
    nombre: 'Batería 1RM',
    modalidad: 'strength',
    desbloquea: 'tus cargas de fuerza',
    dia: 'martes',
    resultados: [{ label: 'Sentadilla' }, { label: 'Peso muerto' }, { label: 'Press banca' }],
  },
  {
    slug: 'tt_5k',
    nombre: '5K control',
    modalidad: 'run',
    desbloquea: 'tus zonas de correr',
    dia: 'miércoles',
    resultados: [{ label: 'Tiempo 5K' }],
  },
  {
    slug: 'tt_2k_row',
    nombre: 'Remo 2K',
    modalidad: 'ergo',
    desbloquea: 'tus zonas de remo',
    dia: 'viernes',
    resultados: [{ label: 'Tiempo 2K remo' }],
  },
  {
    slug: 'hyrox_half_sim',
    nombre: 'HYROX half-sim',
    modalidad: 'hyrox',
    desbloquea: null,
    dia: 'sábado',
    resultados: [{ label: 'Tiempo half-sim' }],
  },
];

function conValores(slug: string, valores: Record<string, [string, string?]>): TestCalibracion {
  const base = CATALOGO.find((t) => t.slug === slug);
  if (!base) throw new Error(`test desconocido: ${slug}`);
  return {
    ...base,
    resultados: base.resultados.map((r) => {
      const v = valores[r.label];
      return v ? { ...r, valor: v[0], unidad: v[1] } : { ...r };
    }),
  };
}

/** Atleta recién dado de alta: el coach aún no ha publicado nada. */
export const NUEVO: EstadoTests = {
  id: 'nuevo',
  programado: false,
  tests: CATALOGO,
  umbralPpm: null,
  modalidadesConZona: 0,
};

/** Atleta 64, tal cual está hoy: la batería 1RM a medias y nada más. */
export const ALEX: EstadoTests = {
  id: 'alex',
  programado: true,
  tests: [
    conValores('one_rm_battery', { Sentadilla: ['186,7', 'kg'], 'Peso muerto': ['245', 'kg'] }),
    ...CATALOGO.filter((t) => t.slug !== 'one_rm_battery'),
  ],
  umbralPpm: null,
  modalidadesConZona: 0,
};

/** Un año dentro: los cuatro con resultado y las zonas ancladas en el umbral. */
export const VETERANO: EstadoTests = {
  id: 'veterano',
  programado: true,
  tests: [
    conValores('one_rm_battery', {
      Sentadilla: ['190', 'kg'],
      'Peso muerto': ['250', 'kg'],
      'Press banca': ['122,5', 'kg'],
    }),
    conValores('tt_5k', { 'Tiempo 5K': ['20:48'] }),
    conValores('tt_2k_row', { 'Tiempo 2K remo': ['7:02'] }),
    conValores('hyrox_half_sim', { 'Tiempo half-sim': ['34:12'] }),
  ],
  umbralPpm: 163,
  modalidadesConZona: 3,
};

export const ESTADOS: Record<string, EstadoTests> = { nuevo: NUEVO, alex: ALEX, veterano: VETERANO };

/** Un test está calibrado cuando TODOS sus resultados obligatorios tienen valor. */
export function estaCompleto(t: TestCalibracion): boolean {
  return t.resultados.every((r) => r.valor !== undefined);
}

export function estaEmpezado(t: TestCalibracion): boolean {
  return !estaCompleto(t) && t.resultados.some((r) => r.valor !== undefined);
}

export function completos(e: EstadoTests): number {
  return e.tests.filter(estaCompleto).length;
}

export function empezados(e: EstadoTests): number {
  return e.tests.filter(estaEmpezado).length;
}

/** El siguiente acto concreto, o null si no hay ninguno en su mano. */
export function siguienteAccion(e: EstadoTests): { texto: string; slug: string; falta?: string } | null {
  if (!e.programado) return null;
  const aMedias = e.tests.find(estaEmpezado);
  if (aMedias) {
    const falta = aMedias.resultados.find((r) => r.valor === undefined);
    return { texto: `Completar la ${aMedias.nombre}`, slug: aMedias.slug, falta: falta?.label.toLowerCase() };
  }
  const sinHacer = e.tests.find((t) => !estaCompleto(t));
  if (sinHacer) return { texto: `Probarme · ${sinHacer.nombre}`, slug: sinHacer.slug };
  return null;
}
