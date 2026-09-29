'use client';

// LAS CARAS DEL CIRCUITO, PINTADAS — cada una es su disposición (`caras.ts`,
// `paginas.ts`) sobre el reloj del contexto: un componente de una línea que
// pide su `D` al kit y le pasa la disposición a `PintaDisposicion`.
//
//   CaraCircuito   el paso vivo: carrera, estación, Roxzone, AMRAP, campana,
//                  descanso o relevo (`disponerCaraCircuito` decide cuál)
//   CapaCuenta     el 3-2-1 y el GO, a pantalla entera
//   CapaEntras     «entras a…» al llegar a una estación que nada anunció
//   PaginaDatosC · PaginaVueltasC · PaginaEstructuraC   las páginas UP/DOWN
//
// Y `entrasA`, el predicado de «entras a…» (puro: lo prueba el examen).
//
// Qué NO hacer: calcular aquí qué va en cada fila; pintar el héroe de otra
// cosa que lo que dice `laminaDelPaso`.

import { PintaDisposicion, Tapa, disponerDatos, disponerEstructura, useGarmin } from '../../kit-garmin';
import type { Secuencia } from '../../kit-reloj/gancho';
import type { PasoBase } from '../../kit-reloj/paso';
import { esEstacion, type Circuito } from '../reloj-circuito/planes';
import { totalDe } from '../reloj-circuito/vista';
import { disponerCaraCircuito, disponerCuentaC, disponerEntrasC, type DatosCara } from './caras';
import { disponerVueltasC, filasDatosC, filasEstructuraC, filasVueltasC, type RepsDe } from './paginas';

/** Lo que dura la capa «entras a…», en s. */
export const ENTRAS_S = 3;

/**
 * «Entras a…» cuando nada ha anunciado la estación: ni una Roxzone de entrada
 * ni el GO de un descanso o de un cierre a mano (el motor deja `goHasta` a 0
 * si no hubo GO). Sin voz en Garmin, es lo que dice a qué entras.
 */
export function entrasA(seq: Pick<Secuencia, 'paso' | 'estado' | 'plan'>): boolean {
  const { paso, estado, plan } = seq;
  const anterior = plan.pasos[estado.i - 1];
  return esEstacion(paso) && !estado.terminado && estado.goHasta === 0 && estado.t < ENTRAS_S && anterior?.roxzone !== 'entrada' && estado.i > 0;
}

/** Lo que una cara necesita saber de la secuencia en marcha. */
export function datosDe(seq: Secuencia, c: Circuito, dial: DatosCara['dial']): Omit<DatosCara, 'D'> {
  return { paso: seq.paso, lecturas: seq.lecturas, zonas: seq.plan.zonas, reglas: seq.plan.reglas, c, total: totalDe(seq.estado, c), dial };
}

export function CaraCircuito(p: Omit<DatosCara, 'D'>) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerCaraCircuito({ ...p, D })} />;
}

/** 3-2-1 (n > 0) o GO (n = 0), a pantalla entera. */
export function CapaCuenta({ n, paso, c }: { n: number; paso: PasoBase; c: Circuito }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerCuentaC(n, paso, c, D)} />
    </>
  );
}

export function CapaEntras({ paso, c, total }: { paso: PasoBase; c: Circuito; total: number | null }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerEntrasC(paso, c, total, D)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Las páginas (UP/DOWN)
// ---------------------------------------------------------------------------

export function PaginaDatosC({ seq, c }: { seq: Secuencia; c: Circuito }) {
  const { D } = useGarmin();
  const filas = filasDatosC(c, seq.estado, seq.lecturas, totalDe(seq.estado, c));
  return <PintaDisposicion d={disponerDatos(filas, seq.plan.zonas, D)} />;
}

export function PaginaVueltasC({ seq, c, reps }: { seq: Secuencia; c: Circuito; reps: RepsDe }) {
  const { D } = useGarmin();
  const { titulo, filas } = filasVueltasC(c, seq.estado, reps);
  return <PintaDisposicion d={disponerVueltasC(titulo, filas, D)} />;
}

export function PaginaEstructuraC({ seq, c }: { seq: Secuencia; c: Circuito }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerEstructura(filasEstructuraC(c, seq.estado.i), D)} />;
}
