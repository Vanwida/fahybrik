// LA SESIÓN COMO EJERCICIOS — la hoja del coach agrupada por ejercicio (P11).
//
// La ficha de la serie (los dos ejes de la dosis: carga y esfuerzo, por lado,
// aproximación, kg por clic de corona) es del kit: `PasoBase.fuerza`,
// `FichaFuerza`, y sus textos en `kit-reloj/fuerza.ts` (`textoCarga`,
// `dosisSerie`, `avisoSerie`…). Aquí queda lo que solo necesita esta familia:
// recorrer la sesión por ejercicios para «Viene:», «Luego ·» y la página
// Ejercicios.
//
// Lo que es DATO y no constante (HARD RULE Nº0):
//   · `pasoKg` y `vaciaKg` de la ficha — del gimnasio y del implemento.
//   · `rmKg`, `ultimaKg` — son del atleta, no del plan.
//   · `COLOCATE_S_DEFECTO` (en planes.ts) — el tiempo para colocarse antes de
//     una isometría que no viene de un descanso.

import { esFuerza, type PasoBase, type PlanSesion } from '../../kit-reloj';

/** 4280 → «4.280»: miles con punto, como se escriben en España. */
export function fmtMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---------------------------------------------------------------------------
// La sesión como ejercicios (página «Ejercicios», «Viene:», «Luego ·»)
// ---------------------------------------------------------------------------

export interface Ejercicio {
  clave: string;
  nombre: string;
  slot?: string;
  bloque: number;
  /** Índices de los pasos de trabajo del ejercicio, aproximaciones incluidas. */
  pasos: number[];
  /** Series de trabajo (sin aproximaciones). */
  series: number;
}

function claveDe(p: PasoBase): string | null {
  if (esFuerza(p)) return p.fuerza.ejercicio;
  if (p.rol !== 'trabajo') return null;
  return `${p.bloque ?? 0}-${p.nombre ?? p.clase}`;
}

/** Los ejercicios de la sesión, en el orden de la hoja del coach. */
export function ejerciciosDe(plan: PlanSesion): Ejercicio[] {
  const out: Ejercicio[] = [];
  plan.pasos.forEach((p, i) => {
    const clave = claveDe(p);
    if (!clave) return;
    let e = out.find((x) => x.clave === clave);
    if (!e) {
      e = { clave, nombre: p.nombre ?? 'Movilidad', slot: p.posicion?.slot, bloque: p.bloque ?? 0, pasos: [], series: 0 };
      out.push(e);
    }
    e.pasos.push(i);
    if (!(esFuerza(p) && p.fuerza.aproximacion)) e.series += 1;
  });
  return out;
}

/** El ejercicio al que pertenece el paso `i`, si es de trabajo. */
export function ejercicioDe(plan: PlanSesion, i: number): Ejercicio | null {
  const clave = claveDe(plan.pasos[i]!);
  return clave ? (ejerciciosDe(plan).find((e) => e.clave === clave) ?? null) : null;
}

/** El siguiente paso de trabajo a partir de `desde` (incluido), saltando descansos y «colócate». */
export function siguienteTrabajo(plan: PlanSesion, desde: number): number | null {
  for (let j = desde; j < plan.pasos.length; j++) if (plan.pasos[j]!.rol === 'trabajo') return j;
  return null;
}

/** El último paso de trabajo antes de `i`. */
export function anteriorTrabajo(plan: PlanSesion, i: number): number | null {
  for (let j = i - 1; j >= 0; j--) if (plan.pasos[j]!.rol === 'trabajo') return j;
  return null;
}

/** ¿Es `j` la primera serie de trabajo de su ejercicio (lo que abre un ejercicio nuevo)? */
export function abreEjercicio(plan: PlanSesion, j: number): boolean {
  const p = plan.pasos[j]!;
  const clave = claveDe(p);
  if (!clave) return false;
  for (let k = j - 1; k >= 0; k--) if (claveDe(plan.pasos[k]!) === clave) return false;
  return true;
}
