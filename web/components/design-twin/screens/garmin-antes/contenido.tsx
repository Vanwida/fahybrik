'use client';

// LO QUE SE PINTA EN CADA PANTALLA DE «ANTES» — la disposición pura (faces.ts,
// brief.ts, previo.ts, vinculo.ts) sobre el reloj del contexto, con su aro
// cuando la sesión ya está elegida (brief y 3-2-1), y nada más.
//
// `Contenido` es lo que el flujo pone dentro de la carcasa y lo que la comparación
// de tamaños pone dentro de cada reloj: UN pintor. No decide nada de dominio (qué
// entorno, si hay GPS, qué avisos): eso lo resuelven `datosBrief` y compañía, de
// `estado.ts`.
//
// Qué NO hacer: calcular aquí qué va en una fila; pintar el GPS o el pulso de otro
// sitio que `Sistema`; tocar el motor.

import type { ReactNode } from 'react';
import { AroGarmin, CaraCompletada, CaraCuenta, CaraMenu, PintaDisposicion, useGarmin, type Disposicion } from '../../kit-garmin';
import { completitud, contextoDe, estadoInicial, hoyDe, lecturasDe, pasoVivo, type Entorno, type PlanSesion } from '../../kit-reloj';
import { cuerpo } from '../reloj-correr/casos';
import { contextoDelBrief, disponerBrief, disponerEspera, type DatosBrief } from './brief';
import {
  ENTORNOS,
  NOMBRE_ENTORNO,
  entornoEfectivo,
  entornoElegible,
  necesitaGps,
  tituloDe,
  type Ajustes,
  type Hoy,
  type Sistema,
} from './estado';
import { OPCIONES_LIBRES, TEXTO_FRANJA, disponerGlance, disponerLista, disponerNoToca, disponerSinDetalle, disponerSinPlan, filasDeLista, glanceDe } from './faces';
import type { EscenaRescate, Pantalla } from './pantallas';
import { disponerPrevio, type DatosPrevio } from './previo';
import { disponerInterrumpida, disponerVincular } from './vinculo';

/** Todo lo que una pantalla de antes necesita saber del reloj y del día. */
export interface Contexto {
  hoy: Hoy;
  sistema: Sistema;
  ajustes: Ajustes;
  /** El entorno elegido con UP/DOWN en el brief (`null` = el que diga la prescripción o Ajustes). */
  elegido: Entorno | null;
  rescate?: EscenaRescate;
  /** Un toque en una línea (solo fuera del vivo y con su tecla equivalente). */
  alTocar?: (rol: string, k: number) => void;
}

export const TITULO_LIBRE = 'Entreno libre · fuera de plan';
export const TITULO_AJUSTES = 'Ajustes';
export const TITULO_ENTORNO = 'Entorno por defecto';
export const TITULO_DESVINCULAR = '¿Desvincular?';
export const TEXTO_DESVINCULAR = 'Desvincular reloj';
export const TEXTO_SI_DESVINCULAR = 'Sí, desvincular';

/** Las opciones de Ajustes en su raíz: el entorno por defecto (con su valor) y desvincular. */
export const opcionesDeAjustes = (a: Ajustes) => [
  { id: 'entorno', texto: `Entorno · ${NOMBRE_ENTORNO[a.entornoPorDefecto]}` },
  { id: 'desvincular', texto: TEXTO_DESVINCULAR },
];

export const opcionesDeEntorno = ENTORNOS.map((e) => ({ id: e, texto: NOMBRE_ENTORNO[e] }));
export const opcionesDeDesvincular = [{ id: 'si', texto: TEXTO_SI_DESVINCULAR }];

type Base = Pick<Contexto, 'hoy' | 'sistema' | 'ajustes' | 'elegido'>;

/** Los datos del brief de la sesión `k` del día, ya resueltos: entorno, si es elegible, contexto. */
export function datosBrief(c: Base, k: number): DatosBrief {
  const sd = c.hoy.sesiones[k]!;
  const s = sd.sesion;
  const varias = c.hoy.sesiones.length > 1;
  return {
    sesion: s,
    contexto: contextoDelBrief(s, sd.franja && varias ? TEXTO_FRANJA[sd.franja] : 'Hoy'),
    entorno: entornoEfectivo(s, c.elegido, c.ajustes.entornoPorDefecto),
    elegible: entornoElegible(s),
    sistema: c.sistema,
    frescura: c.hoy.plan,
  };
}

/** ¿Hay que esperar al GPS para salir en esta sesión, con este entorno y con lo que lee el reloj? */
export function hayQueEsperarGps(c: Base, k: number): boolean {
  const d = datosBrief(c, k);
  return necesitaGps(d.sesion, d.entorno) && c.sistema.gps !== 'listo';
}

/** El aro de la sesión (su forma: naranja el trabajo), quieto: la sesión aún no ha empezado. */
export function AroDeAntes({ plan, i }: { plan: PlanSesion; i: number }) {
  const est = estadoInicial(plan, cuerpo(), { i: Math.max(i, 0) });
  const paso = pasoVivo(plan, est);
  return <AroGarmin pasos={plan.pasos} i={i} paso={paso} lecturas={lecturasDe(paso, est)} />;
}

/** Una cara pura en una línea: la disposición sobre el reloj del contexto, con su toque si lo hay. */
export function CaraDe({ hacer, alTocar }: { hacer: (D: number) => Disposicion; alTocar?: Contexto['alTocar'] }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={hacer(D)} alTocar={alTocar} />;
}

/** Lo que queda al «Guardar lo hecho» de una sesión rescatada: lo decide lo hecho, como en toda sesión. */
export function completitudDelRescate(r: EscenaRescate) {
  const plan = r.sesion.plan;
  const series = r.vueltas.map((v, k) => ({ ...v, pasoId: plan.pasos[2 * k + 1]!.id }));
  return completitud({ pasos: plan.pasos, i: r.control.i, final: 'atleta', series });
}

/** En qué palabras del contexto iba la sesión rescatada («Serie 4/6»). */
export function dondeIba(r: EscenaRescate): string | null {
  return contextoDe(r.sesion.plan.pasos[r.control.i]!)[0] ?? null;
}

/** Un toque en una opción de un menú: su rol y su lugar. */
const tocaOpcion = (alTocar: Contexto['alTocar'], opciones: Array<{ id: string }>) => (alTocar ? (k: number) => alTocar(`opcion:${opciones[k]!.id}`, k) : undefined);

export function Contenido({ p, ctx }: { p: Pantalla; ctx: Contexto }): ReactNode {
  const { hoy, sistema, ajustes, alTocar } = ctx;
  switch (p.p) {
    case 'glance':
      return <CaraDe hacer={(D) => disponerGlance(glanceDe(hoy), D)} alTocar={alTocar} />;
    case 'lista':
      return <CaraDe hacer={(D) => disponerLista(filasDeLista(hoy), p.foco, D)} alTocar={alTocar} />;
    case 'brief': {
      const d = datosBrief(ctx, p.k);
      return (
        <>
          <CaraDe hacer={(D) => disponerBrief(d, D).disposicion} alTocar={alTocar} />
          <AroDeAntes plan={d.sesion.plan} i={-1} />
        </>
      );
    }
    case 'previo': {
      const s = hoy.sesiones[p.k]!.sesion;
      const datos: DatosPrevio = { bateriaPct: sistema.bateriaPct, duracion: hoyDe(s.plan.pasos).dur };
      return <CaraDe hacer={(D) => disponerPrevio(p.cola[0]!, datos, D)} alTocar={alTocar} />;
    }
    case 'espera':
      return <CaraDe hacer={(D) => disponerEspera({ entorno: p.entorno, gps: sistema.gps, pulso: sistema.pulso }, D)} alTocar={alTocar} />;
    case 'cuenta':
      return (
        <>
          <CaraCuenta n={p.n} paso={p.plan.pasos[p.inicio.i]!} />
          <AroDeAntes plan={p.plan} i={p.inicio.i} />
        </>
      );
    case 'no-toca':
      return <CaraDe hacer={(D) => disponerNoToca(hoy.manana, D)} alTocar={alTocar} />;
    case 'sin-plan':
      return <CaraDe hacer={(D) => disponerSinPlan(D)} alTocar={alTocar} />;
    case 'sin-detalle': {
      const s = hoy.sesiones[0]!.sesion;
      return <CaraDe hacer={(D) => disponerSinDetalle([tituloDe(s), hoyDe(s.plan.pasos).dur], D)} alTocar={alTocar} />;
    }
    case 'libre':
      return <CaraMenu titulo={[TITULO_LIBRE]} opciones={OPCIONES_LIBRES} foco={p.foco} onTocar={tocaOpcion(alTocar, OPCIONES_LIBRES)} />;
    case 'ajustes':
      if (p.capa === 'entorno') return <CaraMenu titulo={[TITULO_ENTORNO]} opciones={opcionesDeEntorno} foco={p.foco} onTocar={tocaOpcion(alTocar, opcionesDeEntorno)} />;
      if (p.capa === 'desvincular') return <CaraMenu titulo={[TITULO_DESVINCULAR]} opciones={opcionesDeDesvincular} foco={0} onTocar={tocaOpcion(alTocar, opcionesDeDesvincular)} />;
      return <CaraMenu titulo={[TITULO_AJUSTES]} opciones={opcionesDeAjustes(ajustes)} foco={p.foco} onTocar={tocaOpcion(alTocar, opcionesDeAjustes(ajustes))} />;
    case 'vincular':
      return <CaraDe hacer={(D) => disponerVincular(p.estado, D)} alTocar={alTocar} />;
    case 'interrumpida': {
      const r = ctx.rescate!;
      return <CaraDe hacer={(D) => disponerInterrumpida({ sesionT: r.control.sesionT, donde: dondeIba(r), foco: p.foco }, D)} alTocar={alTocar} />;
    }
    case 'guardada': {
      const r = ctx.rescate!;
      return <CaraCompletada natural={false} t={r.control.sesionT} completitud={completitudDelRescate(r)} metros={r.control.sesionM} />;
    }
    case 'vivo':
      return null;
  }
}
