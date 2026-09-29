// LAS MUTACIONES, sobre la semana — la demo las aplica para que el prototipo esté
// vivo (marcar hoy como hecho cambia la card de naranja a verde); el servidor
// decidirá lo suyo. Cada una recalcula el sello del día (`estadoDeDia`).

import type { DiaDelPlan, SemanaDelPlan, SesionDelPlan } from './contrato';
import { estadoDeDia, puedeMoverse } from './dias';

// ---------------------------------------------------------------------------
// Las mutaciones, sobre la semana (la demo las aplica; el servidor decidirá lo suyo)
// ---------------------------------------------------------------------------

function rehacer(semana: SemanaDelPlan, hoyIso: string, dias: DiaDelPlan[]): SemanaDelPlan {
  return {
    ...semana,
    dias: dias.map((d) => ({ ...d, estado: estadoDeDia(d.sesiones, d.iso, hoyIso), esHoy: d.iso === hoyIso })),
  };
}

function cambiar(semana: SemanaDelPlan, hoyIso: string, id: string, f: (s: SesionDelPlan) => SesionDelPlan | null): SemanaDelPlan {
  return rehacer(
    semana,
    hoyIso,
    semana.dias.map((d) => ({
      ...d,
      sesiones: d.sesiones.flatMap((s) => {
        if (s.id !== id) return [s];
        const nueva = f(s);
        return nueva ? [nueva] : [];
      }),
    })),
  );
}

/** «Marcar como hecha» afirma el HECHO sin inventar ninguna métrica: no hay minutos medidos. */
export const marcarHecha = (sem: SemanaDelPlan, id: string, hoyIso: string): SemanaDelPlan =>
  cambiar(sem, hoyIso, id, (s) => ({ ...s, estado: 'hecha' }));

/** «Deshacer hecho»: la sesión vuelve a pendiente. */
export const deshacerHecho = (sem: SemanaDelPlan, id: string, hoyIso: string): SemanaDelPlan =>
  cambiar(sem, hoyIso, id, (s) => ({ ...s, estado: 'pendiente' }));

export const borrarSesion = (sem: SemanaDelPlan, id: string, hoyIso: string): SemanaDelPlan =>
  cambiar(sem, hoyIso, id, () => null);

/** Mueve la sesión a otro día de la MISMA semana (fuera de ella el servidor responde 422). */
export function moverSesion(sem: SemanaDelPlan, id: string, aIso: string, hoyIso: string): SemanaDelPlan {
  const origen = sem.dias.find((d) => d.sesiones.some((s) => s.id === id));
  const sesion = origen?.sesiones.find((s) => s.id === id);
  if (!origen || !sesion || origen.iso === aIso || !puedeMoverse(sesion)) return sem;
  return rehacer(
    sem,
    hoyIso,
    sem.dias.map((d) => {
      if (d.iso === origen.iso) return { ...d, sesiones: d.sesiones.filter((s) => s.id !== id) };
      if (d.iso === aIso) {
        const ocupada = d.sesiones.some((s) => s.franja === sesion.franja);
        const franja = ocupada ? (sesion.franja === 'AM' ? 'PM' : 'AM') : sesion.franja;
        return { ...d, sesiones: [...d.sesiones, { ...sesion, franja }] };
      }
      return d;
    }),
  );
}
