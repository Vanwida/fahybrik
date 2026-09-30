// LA FORMA CANÓNICA — contra qué se compara «ida y vuelta exacta».
//
// El cable no lleva TODO lo que el objeto del doble lleva, a propósito, y esa
// diferencia se declara aquí en un solo sitio en vez de esconderse en el
// codificador:
//
//   · `id` del paso: en el doble es una clave de la interfaz (`series-7`,
//     `529-A1-s1`) que depende de un contador global. En el cable un paso ES su
//     posición: el reloj lo cita por índice y el servidor lo reconoce por
//     (versión del plan, posición). Canónico: `id = String(índice)`.
//   · `fuerza.ejercicio`: la clave que agrupa las series de un ejercicio. Lo
//     único que importa es qué pasos comparten ejercicio. Canónico: el
//     ordinal (como texto) de su primera aparición.
//   · Dobles: la pareja es de la sesión (`plan.pareja`) y se copia a cada
//     estación; `estacion` es DERIVADA del paso (`estacionDe`); `nota` es el
//     pacto en texto y el cable lleva `alternaCada`: la nota no vuelve.
//   · `bandasRitmo` vacío es lo mismo que ausente.
//   · Un booleano opcional a `false` (`aproximacion`, `lastre`, `corporal`,
//     `corre`) es lo mismo que ausente: el modelo los lee con «si está». El
//     cable solo distingue «es» de «no es».
//   · Una clave a `undefined` es una clave ausente.
//
// Todo lo demás —cada número, cada cadena, cada `null`— tiene que volver
// idéntico: `decodificar(codificar(x))` ≡ `canonico(x)`.
//
// QUÉ NO HACER: no ampliar esta lista para «hacer pasar» un test. Si un campo
// no vuelve igual y no está aquí, es un hueco del formato o del modelo.

import { estacionDe } from '../dobles';
import type { PasoBase } from '../paso';
import type { PlanSesion } from '../plan';

/** Booleanos opcionales del modelo: `false` y ausente significan lo mismo. */
const BOOLEANOS_OPCIONALES: ReadonlySet<string> = new Set(['aproximacion', 'lastre', 'corporal', 'corre']);

function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor !== null && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      if (v === undefined) continue;
      if (v === false && BOOLEANOS_OPCIONALES.has(k)) continue;
      out[k] = limpiar(v);
    }
    return out;
  }
  return valor;
}

/** El plan en su forma canónica: sin ids de UI, con ejercicios ordinales y sin opcionales vacíos. */
export function canonico(plan: PlanSesion): PlanSesion {
  const ordinales = new Map<string, number>();
  const pasos = plan.pasos.map((p, i): PasoBase => {
    const limpio = limpiar(p) as PasoBase;
    limpio.id = String(i);
    if (limpio.dobles) {
      const resto = { ...limpio.dobles };
      delete resto.nota;
      limpio.dobles = { ...resto, ...(plan.pareja !== undefined ? { pareja: plan.pareja } : {}), estacion: estacionDe(limpio) };
    }
    if (limpio.fuerza) {
      if (!ordinales.has(limpio.fuerza.ejercicio)) ordinales.set(limpio.fuerza.ejercicio, ordinales.size);
      limpio.fuerza.ejercicio = String(ordinales.get(limpio.fuerza.ejercicio));
    }
    return limpio;
  });
  const cabecera: Partial<PlanSesion> = { ...plan };
  delete cabecera.pasos;
  const bandasRitmo = plan.bandasRitmo && plan.bandasRitmo.length > 0 ? plan.bandasRitmo : undefined;
  return { ...(limpiar({ ...cabecera, bandasRitmo }) as Omit<PlanSesion, 'pasos'>), pasos };
}
