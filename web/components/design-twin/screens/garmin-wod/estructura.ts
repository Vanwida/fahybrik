// LA ESTRUCTURA DE UN AMRAP EN LOS CONTROLES — PURO.
//
// En un AMRAP UP/DOWN cuentan reps (§5), así que Datos, Vueltas y Estructura se
// abren desde Controles y las pinta el kit. La Estructura del kit lee
// `FilaEstructura[]` y las escribe con `textoFila`, que solo sabe leer un paso:
// aquí se le da un paso por tarea (o por bloque de un chipper) para que diga
// «Wall Ball · 12 reps» con «9 kg» debajo, sin texto libre. En un chipper, la
// ventana del AMRAP sale como «Pull-up · 4′» (su movimiento y su ventana: «AMRAP
// Walking Lunge» no cabe en una fila a 218 y el contexto de la cara ya dice
// AMRAP). Los demás formatos pintan su lista con sus propias páginas
// (`paginas.ts`) y no pasan por aquí.
//
// Qué NO hacer: escribir aquí el texto de una tarea (lo escribe `textoFila` desde
// el paso); usar esto para un formato con páginas de UP/DOWN.

import type { FilaEstructura, PasoBase, Tarea } from '../../kit-reloj';
import { wodDe } from '../../kit-reloj';
import type { PlanWod } from '../reloj-wod/planes';

const estado = (i: number, desde: number, hasta: number): FilaEstructura['estado'] => (i > hasta ? 'hecho' : i >= desde ? 'ahora' : 'pendiente');

/** Una tarea como un paso que `textoFila` sabe leer: su nombre, su dosis y su carga (que va de «objetivo» para salir debajo). */
function pasoDeTarea(t: Tarea, base: PasoBase): PasoBase {
  return {
    id: `${base.id}-${t.nombre}`,
    clase: 'amrap',
    rol: 'trabajo',
    fase: 'principal',
    nombre: t.nombre,
    medida: t.dosis ?? { tipo: 'abierta', prescrito: null, mide: 'atleta' },
    objetivos: t.carga ? [{ eje: 'kg', min: t.carga.kg, max: t.carga.kg, papel: 'principal' }] : [],
    carga: t.carga,
    cierre: 'atleta',
  };
}

/** Las filas de Estructura de un AMRAP (una por tarea) o de un chipper (Run y AMRAP de cada ronda); `undefined` = el kit usa la suya. */
export function estructuraDeWod(datos: PlanWod): ((i: number) => FilaEstructura[]) | undefined {
  const pasos = datos.plan.pasos;
  if (datos.formato === 'amrap') {
    const ventana = pasos[0]!;
    const w = wodDe(ventana);
    if (w?.formato !== 'amrap') return undefined;
    return (i) => w.tareas.map((t) => ({ fase: 'principal', trabajo: pasoDeTarea(t, ventana), estado: i === 0 ? 'ahora' : 'hecho' }));
  }
  if (datos.formato === 'chipper') {
    return (i) =>
      pasos.flatMap((p, k): FilaEstructura[] => {
        // Cada ronda son tres pasos: Run, ventana del AMRAP y su puntuación.
        if (k % 3 === 0) return [{ fase: 'principal', trabajo: p, estado: estado(i, k, k) }];
        if (k % 3 === 1) return [{ fase: 'principal', trabajo: { ...p, objetivos: [] }, estado: estado(i, k, k + 1) }];
        return [];
      });
  }
  return undefined;
}
