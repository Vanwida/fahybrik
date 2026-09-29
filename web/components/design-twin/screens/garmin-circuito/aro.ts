// EL ARO DEL CIRCUITO, POR RONDAS — la sesión en el borde, como el atleta la
// cuenta. Un simulacro de HYROX tiene 31 pasos (1 km, Roxzone, estación,
// Roxzone, ×8): dibujar un arco por paso deja el aro hecho migas. El atleta
// cuenta OCHO cosas —las rondas—, así que el aro se divide en ocho.
//
// No es un aro nuevo: es el de `AroGarmin` con otros «pasos». Cada ronda pasa
// por él como un paso de tiempo (su peso es lo que dura, estimado; el de lo de
// ahora, lo que lleva de esa estimación). El aro dice DÓNDE ESTÁS, nunca
// cuánto has tardado: por eso vale el estimador de dibujo y no un dato.
//
// Candidato a consolidar en el kit (`aroPorGrupos`) si otra familia cuenta por
// rondas: por ahora vive aquí.
//
// Qué NO hacer: pintar en el aro un tiempo como si fuera medido; dividir por
// rondas un plan sin contador de ronda (cae a un arco por paso).

import type { Estimador } from '../../kit-reloj/aro';
import { fraccionDelPaso } from '../../kit-reloj/aro';
import type { Secuencia } from '../../kit-reloj/gancho';
import type { Lecturas, PasoBase } from '../../kit-reloj/paso';

/** Lo que `AroGarmin` necesita: los «pasos» (uno por ronda) y dónde estás en ellos. */
export interface AroDeRondas {
  pasos: PasoBase[];
  i: number;
  paso: PasoBase;
  lecturas: Lecturas;
  duracion: Estimador;
}

interface Grupo {
  /** Índices, en el plan, de los pasos de este grupo. */
  idx: number[];
  /** ¿Es una ronda (trabajo de la parte principal)? Lo demás (el calentamiento) va en gris. */
  ronda: boolean;
  peso: number;
}

/** Los pasos seguidos que comparten ronda; lo que no tiene ronda (el calentamiento) es un grupo aparte. */
function gruposDe(pasos: ReadonlyArray<PasoBase>, duracion: Estimador): Grupo[] {
  const grupos: Grupo[] = [];
  let clave: number | null | undefined;
  pasos.forEach((p, i) => {
    const n = p.posicion?.ronda?.n ?? null;
    if (grupos.length === 0 || n !== clave) {
      grupos.push({ idx: [], ronda: n != null, peso: 0 });
      clave = n;
    }
    const g = grupos[grupos.length - 1]!;
    g.idx.push(i);
    g.peso += Math.max(0, duracion(p));
  });
  return grupos;
}

/** Un «paso» que vale por toda una ronda: de tiempo, con su peso como duración. */
const pasoDeRonda = (g: Grupo, k: number): PasoBase => ({
  id: `ronda-${k}`,
  clase: 'carrera',
  rol: g.ronda ? 'trabajo' : 'recuperacion',
  fase: g.ronda ? 'principal' : 'calentamiento',
  medida: { tipo: 'tiempo', prescrito: g.peso, mide: 'reloj' },
  objetivos: [],
  cierre: 'medida',
});

/** El aro por rondas de una sesión en marcha. `duracion` es el estimador de dibujo del circuito. */
export function aroPorRondas(seq: Pick<Secuencia, 'plan' | 'estado' | 'paso' | 'lecturas'>, duracion: Estimador): AroDeRondas {
  const { plan, estado } = seq;
  const grupos = gruposDe(plan.pasos, duracion);
  const pasos = grupos.map(pasoDeRonda);
  const dentro = Math.max(0, grupos.findIndex((g) => g.idx.includes(estado.i)));
  // Al acabar, todas hechas: ninguna en curso.
  const i = estado.terminado ? grupos.length : dentro;
  const g = grupos[dentro]!;
  // Lo que lleva de esa ronda, en su propia estimación: lo hecho antes y lo que va del paso de ahora.
  const antes = g.idx.filter((j) => j < estado.i).reduce((a, j) => a + Math.max(0, duracion(plan.pasos[j]!)), 0);
  const ahora = fraccionDelPaso(seq.paso, seq.lecturas) * Math.max(0, duracion(plan.pasos[estado.i]!));
  const lecturas: Lecturas = { t: Math.min(g.peso, antes + ahora), hecho: null, ritmo: null, ppm: null, gps: 'no-aplica' };
  return { pasos, i, paso: pasos[dentro]!, lecturas, duracion: (p) => p.medida.prescrito ?? 0 };
}
