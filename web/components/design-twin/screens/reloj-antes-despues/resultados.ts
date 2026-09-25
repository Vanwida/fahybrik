// LOS RESULTADOS — lo que la muñeca sella al terminar cada sesión de los
// escenarios del «después». Deterministas: el mismo escenario, el mismo
// resumen. Las cifras son las de un atleta de umbral 170 ppm (las mismas zonas
// que «Muñeca · correr») y cuadran entre sí: la suma de las zonas es el tiempo
// total, el ritmo de una serie es su tiempo entre sus metros.

import type { PasoBase, Veredicto } from '../../kit-reloj';
import type { EjercicioHecho, KmHecho, Resultado, SerieFuerza, SerieHecha, TramoHecho } from './calculo';
import { ZONAS, sesion482, sesion493, sesion494Brief, sesion529, sesionSeisPorMil, sesion479Brief, type Sesion } from './sesiones';

const base = (s: Sesion): Omit<Resultado, 't' | 'metros' | 'ppmMedio' | 'ppmMax' | 'zonasS'> => ({
  pasos: s.plan.pasos,
  zonas: ZONAS,
  i: s.plan.pasos.length - 1,
  final: 'natural',
  desnivel: null,
  series: [],
  km: [],
  fuerza: [],
  circuito: [],
  roxzoneS: null,
  rpe: null,
  guardado: 'guardado',
  libreS: 0,
});

/** Las series de carrera de un plan (las de la parte principal con posición), en orden. */
const seriesDe = (pasos: PasoBase[]) =>
  pasos.filter((p) => p.rol === 'trabajo' && p.fase === 'principal' && (p.posicion?.serie || p.posicion?.tramo) && p.clase !== 'estacion');

function series(pasos: PasoBase[], datos: Array<[number, number, Veredicto]>, eje: 'ritmo' | 'zona'): SerieHecha[] {
  return seriesDe(pasos)
    .slice(0, datos.length)
    .map((p, k) => {
      const [segundos, ppm, veredicto] = datos[k]!;
      const m = p.medida.tipo === 'distancia' ? p.medida.prescrito : null;
      return { pasoId: p.id, n: k + 1, clase: 'serie', segundos, metros: m, ritmo: m ? segundos / (m / 1000) : null, ppm, veredicto, eje };
    });
}

// ---------------------------------------------------------------------------
// 6 × 1000 m @3:45–3:55 — la 4 se fue a 3:38: «5 de 6 dentro» (el ejemplo de P13)
// ---------------------------------------------------------------------------

export const SERIES_6X1000: Array<[number, number, Veredicto]> = [
  [231, 169, 'dentro'],
  [228, 171, 'dentro'],
  [229, 172, 'dentro'],
  [218, 176, 'por-encima'],
  [232, 173, 'dentro'],
  [230, 174, 'dentro'],
];

export function resultado6x1000(): Resultado {
  const s = sesionSeisPorMil();
  return {
    ...base(s),
    t: 3318,
    metros: 11620,
    ppmMedio: 152,
    ppmMax: 181,
    zonasS: [610, 1180, 420, 640, 468],
    series: series(s.plan.pasos, SERIES_6X1000, 'ritmo'),
  };
}

/**
 * La misma sesión cortada a los `t` segundos (terminar antes): las zonas en
 * proporción. Solo para el escenario; el reloj de verdad las cuenta segundo a segundo.
 */
export function recortada(r: Resultado, t: number): Resultado {
  const k = t / r.t;
  const zonasS = r.zonasS.map((s) => Math.round(s * k));
  zonasS[1] = zonasS[1]! + (t - zonasS.reduce((a, s) => a + s, 0));
  return { ...r, t, zonasS };
}

// ---------------------------------------------------------------------------
// 479 · 6 × 800 m @Z5 (6 de 6 dentro) + Wall Ball 5 × 12 @9 kg
// ---------------------------------------------------------------------------

export function resultado479(): Resultado {
  const s = sesion479Brief();
  const wb = s.plan.pasos.find((p) => p.nombre === 'Wall Ball')!;
  const sets: SerieFuerza[] = [41, 39, 42, 40, 44].map((seg) => ({ reps: 12, kg: 9, rir: null, confirmada: false, segundos: seg }));
  return {
    ...base(s),
    t: 2676,
    metros: 8242,
    ppmMedio: 158,
    ppmMax: 186,
    zonasS: [300, 520, 610, 520, 726],
    series: series(
      s.plan.pasos,
      [
        [168, 176, 'dentro'],
        [166, 178, 'dentro'],
        [167, 177, 'dentro'],
        [165, 179, 'dentro'],
        [166, 178, 'dentro'],
        [168, 177, 'dentro'],
      ],
      'zona',
    ),
    fuerza: [{ paso: wb, series: sets }],
  };
}

// ---------------------------------------------------------------------------
// 494 · Tirada 80′ @Z2 — splits por km con desnivel
// ---------------------------------------------------------------------------

const KM_494: Array<[number, number, number]> = [
  // [segundos, desnivel m, ppm]
  [296, 12, 139], [293, 4, 141], [291, -6, 141], [295, 18, 143], [298, 22, 145], [289, -8, 143],
  [286, -14, 142], [292, 6, 144], [294, 10, 145], [285, -20, 144], [287, -16, 145], [293, 8, 147],
  [296, 14, 148], [290, 2, 148], [288, -12, 147], [286, -18, 148],
];

export function resultado494(): Resultado {
  const s = sesion494Brief();
  const km: KmHecho[] = KM_494.map(([seg, d, ppm], k) => ({ n: k + 1, clase: 'km', segundos: seg, metros: 1000, ritmo: seg, ppm, veredicto: null, desnivel: d }));
  // Lo que queda hasta los 80′: 141 s a 4:50 → 486 m.
  km.push({ n: 17, clase: 'km', segundos: 141, metros: 486, ritmo: 141 / 0.486, ppm: 149, veredicto: null, desnivel: 4 });
  const sube = km.reduce((a, k) => a + Math.max(0, k.desnivel ?? 0), 0);
  return { ...base(s), t: 4800, metros: 16486, ppmMedio: 144, ppmMax: 152, desnivel: sube, zonasS: [900, 3800, 100, 0, 0], km };
}

// ---------------------------------------------------------------------------
// 529 · fuerza: lo anotado, lo que quedó por defecto
// ---------------------------------------------------------------------------

const f = (reps: number | null, kg: number | null, rir: number | null, confirmada = true, extra: Partial<SerieFuerza> = {}): SerieFuerza => ({ reps, kg, rir, confirmada, ...extra });

export function resultado529(): Resultado {
  const s = sesion529();
  const primero = (nombre: string) => s.plan.pasos.find((p) => p.nombre === nombre)!;
  const fuerza: EjercicioHecho[] = [
    { paso: primero('Back Squat'), series: [f(8, 121, 3), f(8, 126, 2), f(8, 131, 2), f(8, 131, 1)] },
    { paso: primero('Box Jump'), series: [f(6, null, null), f(6, null, null), f(6, null, null, false), f(6, null, null, false)] },
    { paso: primero('Deadlift'), series: [f(8, 140, 3), f(8, 145, 3), f(8, 150, 2), f(8, 150, 2)] },
    {
      paso: primero('Bulgarian Split Squat'),
      series: [f(6, 20, 2, true, { implementos: 2 }), f(6, 20, 2, true, { implementos: 2 }), f(6, 20, 1, true, { implementos: 2 }), f(6, 20, 1, false, { implementos: 2 })],
    },
    { paso: primero('Sled Push'), series: [14, 13, 14, 15, 15, 16].map((seg) => f(null, 150, null, true, { segundos: seg })) },
  ];
  return { ...base(s), t: 3160, metros: null, ppmMedio: 118, ppmMax: 164, zonasS: [2300, 520, 200, 120, 20], fuerza };
}

// ---------------------------------------------------------------------------
// 493 / 482 · carrera comprometida
// ---------------------------------------------------------------------------

function tramos(s: Sesion, carreras: number[], estaciones: number[]): TramoHecho[] {
  const out: TramoHecho[] = [];
  let r = 0;
  let tras: string | null = null;
  s.plan.pasos.forEach((p) => {
    if (p.rol !== 'trabajo' || p.fase !== 'principal') return;
    const ronda = p.posicion?.ronda?.n ?? 0;
    if (p.clase === 'carrera') {
      out.push({ paso: p, ronda, segundos: carreras[r]!, metros: p.medida.prescrito, tras });
    } else {
      out.push({ paso: p, ronda, segundos: estaciones[r]!, metros: p.medida.tipo === 'distancia' ? p.medida.prescrito : null, tras: null });
      tras = p.nombre ?? null;
      r += 1;
    }
  });
  return out;
}

export function resultado493(): Resultado {
  const s = sesion493();
  return {
    ...base(s),
    t: 2862,
    metros: 6090,
    ppmMedio: 162,
    ppmMax: 184,
    zonasS: [200, 420, 380, 1100, 762],
    circuito: tramos(s, [261, 278, 273, 276, 273], [112, 125, 109, 81, 134]),
    roxzoneS: 44 + 41 + 47 + 43 + 45,
  };
}

export function resultado482(): Resultado {
  const s = sesion482();
  return {
    ...base(s),
    t: 2153,
    metros: 5090,
    ppmMedio: 160,
    ppmMax: 183,
    zonasS: [210, 400, 330, 800, 413],
    circuito: tramos(s, [262, 279, 272, 277], [113, 127, 110, 83]),
  };
}

/** Segundos de circuito (desde la primera ronda): la puntuación, sin el calentamiento. */
export function tiempoCircuito(r: Resultado): number {
  const cal = r.pasos.filter((p) => p.fase === 'calentamiento').reduce((a, p) => a + (p.medida.tipo === 'tiempo' ? (p.medida.prescrito ?? 0) : 0), 0);
  return r.t - cal;
}
