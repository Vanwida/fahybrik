// SELLAR LA SESIÓN — del estado final del motor al `Resultado` que se guarda.
//
// El vivo es el del kit (`VivoDePlan` con `onFin`): cuando la sesión acaba
// sola o el atleta confirma «Terminar y guardar», no se congela la lámina ni
// sale un «guardando…» antes de tiempo: se pasa al final con lo HECHO (P0-1,
// P0-2). El motor ya lleva el tiempo en cada zona del coach y el pulso máximo.

import { principal, type FinDeVivo, type PlanSesion, type SerieHecha } from '../../kit-reloj';
import type { KmHecho, Resultado } from './calculo';

/** Las vueltas del motor, con el paso al que pertenecen (el motor las deja en orden, una por paso cerrado). */
export function resultadoDeVivo(plan: PlanSesion, fin: FinDeVivo, base: Resultado | null): Resultado {
  const e = fin.estado;
  const conPosicion = plan.pasos.filter((p) => p.rol === 'trabajo' && p.fase === 'principal' && (p.posicion?.serie || p.posicion?.tramo));
  const series: SerieHecha[] = e.vueltas
    .filter((v) => v.clase !== 'km')
    .map((v, k) => ({ ...v, pasoId: conPosicion[k]?.id ?? `sin-paso-${k}` }));
  // Terminada a mitad de una serie: lo corrido de esa serie también es dato (cortada, sin juicio).
  const actual = plan.pasos[e.i];
  const cuenta = actual?.posicion?.serie ?? actual?.posicion?.tramo;
  if (fin.final === 'atleta' && actual?.rol === 'trabajo' && actual.fase === 'principal' && cuenta && e.t > 0) {
    series.push({
      pasoId: actual.id,
      n: cuenta.n,
      tanda: actual.posicion?.tanda?.n,
      clase: actual.posicion?.tramo ? 'tramo' : 'serie',
      segundos: e.t,
      metros: e.midio ? Math.round(e.metros) : null,
      ritmo: e.midio && e.metros > 50 ? e.t / (e.metros / 1000) : null,
      ppm: e.pasoPpmN > 0 ? Math.round(e.pasoPpmSuma / e.pasoPpmN) : null,
      veredicto: null,
      eje: principal(actual)?.eje,
    });
  }
  const km: KmHecho[] = e.vueltas.filter((v) => v.clase === 'km').map((v) => ({ ...v, desnivel: null }));
  return {
    pasos: plan.pasos,
    zonas: plan.zonas ?? { techos: [] },
    i: e.i,
    final: fin.final,
    t: e.sesionT,
    metros: e.sesionM > 0 ? Math.round(e.sesionM) : null,
    ppmMedio: e.ppmN > 0 ? e.ppmSuma / e.ppmN : null,
    ppmMax: Math.max(base?.ppmMax ?? 0, e.ppmMax) || null,
    desnivel: base?.desnivel ?? null,
    // Si el escenario empezó con la sesión ya avanzada, las zonas salen del resultado de base (la sesión entera).
    zonasS: base ? base.zonasS : e.zonasS,
    series,
    km,
    fuerza: base?.fuerza ?? [],
    circuito: base?.circuito ?? [],
    roxzoneS: base?.roxzoneS ?? null,
    rpe: null,
    guardado: 'en-reloj',
    libreS: 0,
  };
}
