'use client';

// EL VIVO DEL CIRCUITO EN GARMIN — `useVivoGarmin` + `VistaGarmin` del kit,
// configurados. El motor es el de la muñeca (un parcial por paso, un cierre
// por medida o por el atleta); lo que pone el circuito encima:
//
//   · sus caras (carrera, estación, Roxzone, AMRAP, campana, descanso, relevo)
//     y sus capas (3-2-1 y GO con la posición, «entras a…»);
//   · las cuatro páginas UP/DOWN con lo que un circuito pide: Datos (el total
//     y los km CORRIDOS), Vueltas (cada paso, la suya) y Estructura por rondas;
//   · el aro, dividido en sus rondas (`aro.ts`): 31 arcos de un simulacro serían migas;
//   · los botones: la campana del AMRAP es `anotar` (UP/DOWN dicen las reps,
//     START las guarda) y la ventana, un paso más (§5, `mandos.ts`);
//   · el final: la puntuación es el crono TOTAL (sin el calentamiento).
//
// Qué NO hacer: resolver una tecla con un `if` propio (el estado lo decide
// `estadoMandosC`; las acciones de la campana, `alAccion`); pintar el coste de
// la carrera comprometida en vivo (va al resumen, P10).

import { useState, type ReactNode } from 'react';
import {
  AroGarmin,
  CaraCompletada,
  ComparaTamanos,
  VistaGarmin,
  hechoDe,
  useVivoGarmin,
  type EmisionGarmin,
  type IdAccion,
  type PaginaGarmin,
} from '../../kit-garmin';
import { completitud } from '../../kit-reloj/despues';
import type { Secuencia } from '../../kit-reloj/gancho';
import { girarDial, type Dial } from '../../kit-reloj/tarea';
import { tinteDelPaso } from '../../kit-reloj/reglas';
import { dibujoDe, esPuntuacion } from '../reloj-circuito/planes';
import { totalDe } from '../reloj-circuito/vista';
import { aroPorRondas } from './aro';
import type { CasoGarmin } from './casos';
import { estadoMandosC, avisoCierreC } from './mandos';
import { CapaCuenta, CapaEntras, CaraCircuito, PaginaDatosC, PaginaEstructuraC, PaginaVueltasC, datosDe, entrasA } from './pantalla';

const PUNTUACION_VACIA: Dial = { rondas: 0, reps: null };

export function VivoCircuito({ caso, onLog }: { caso: CasoGarmin; onLog: (linea: string) => void }) {
  const { c, sim, inicio } = caso;
  // La puntuación dicha en cada campana, por índice de paso.
  const [diales, setDiales] = useState<Record<number, Dial>>(caso.diales ?? {});
  const reps = (i: number) => diales[i]?.reps ?? null;
  const { seq, avisos } = useVivoGarmin(c.plan, sim, inicio, { onLog });
  const { paso, estado } = seq;
  const dial = esPuntuacion(paso) ? (diales[estado.i] ?? PUNTUACION_VACIA) : null;

  /** Las acciones de la campana (§5 `anotar`): UP/DOWN mueven las reps, START las guarda. El resto es del kit. */
  const alAccion = (a: IdAccion, s: Secuencia): boolean => {
    if (!esPuntuacion(s.paso)) return false;
    const i = s.estado.i;
    if (a === 'valor-mas' || a === 'valor-menos') {
      setDiales((d) => ({ ...d, [i]: girarDial(d[i] ?? PUNTUACION_VACIA, a === 'valor-mas' ? 1 : -1, 0) }));
      onLog(`${a === 'valor-mas' ? 'UP → reps +1' : 'DOWN → reps −1'} (lo que no se diga queda sin declarar, nunca 0)`);
      return true;
    }
    if (a === 'confirmar-campo') {
      onLog(`START → reps guardadas: ${reps(i) ?? 'sin declarar'}`);
      s.cerrar();
      return true;
    }
    if (a === 'campo-anterior') {
      onLog('BACK → solo hay un campo (las reps)');
      return true;
    }
    return false;
  };

  const capa = (s: Secuencia, kit: ReactNode | null): ReactNode | null => {
    if (s.cuenta != null && s.paso.siguiente) return <CapaCuenta n={s.cuenta} paso={s.paso.siguiente} c={c} />;
    if (s.go) return <CapaCuenta n={0} paso={s.paso} c={c} />;
    if (entrasA(s)) return <CapaEntras paso={s.paso} c={c} total={totalDe(s.estado, c)} />;
    return kit;
  };

  const paginas = (s: Secuencia, cara: ReactNode): PaginaGarmin[] => [
    { id: 'paso', titulo: 'Paso', contenido: cara },
    { id: 'datos', titulo: 'Datos', contenido: <PaginaDatosC seq={s} c={c} /> },
    { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaVueltasC seq={s} c={c} reps={reps} /> },
    { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructuraC seq={s} c={c} /> },
  ];

  return (
    <VistaGarmin
      seq={seq}
      avisos={avisos}
      cara={(s) => <CaraCircuito {...datosDe(s, c, dial)} />}
      paginas={paginas}
      estadoMandos={(s, base) => estadoMandosC(s.paso, base)}
      alAccion={alAccion}
      capa={capa}
      aro={(s) => <AroDeRondas seq={s} destello={destelloDe(avisos.ultimo)} />}
      avisoCierre={(p) => avisoCierreC(p, c)}
      final={(s) => <FinalCircuito seq={s} c={c} />}
      inicial={caso.inicial}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

/** El aro destella (con la misma cuenta que el del kit) cuando el último aviso fue «afloja» o «aprieta». */
const destelloDe = (u: EmisionGarmin | null): number | null => (u && (u.suena === 'afloja' || u.suena === 'aprieta') ? u.n : null);

/** El aro dividido en sus rondas: el mismo `AroGarmin`, con una ronda por «paso». */
function AroDeRondas({ seq, destello }: { seq: Secuencia; destello: number | null }) {
  const a = aroPorRondas(seq, dibujoDe);
  return <AroGarmin pasos={a.pasos} i={a.i} paso={a.paso} lecturas={a.lecturas} duracion={a.duracion} destello={destello} />;
}

/**
 * El final de un circuito: la puntuación es el crono TOTAL del circuito (sin
 * el calentamiento), y la completitud la decide lo hecho. Natural si el último
 * paso llegó a cerrarse; si no, el atleta terminó antes.
 */
function FinalCircuito({ seq, c }: { seq: Secuencia; c: CasoGarmin['c'] }) {
  const { estado, plan } = seq;
  const natural = estado.parciales.some((x) => x.i === plan.pasos.length - 1);
  return (
    <CaraCompletada
      natural={natural}
      t={totalDe(estado, c) ?? estado.sesionT}
      completitud={completitud(hechoDe(plan, estado, natural ? 'natural' : 'atleta'))}
      metros={estado.sesionM > 0 ? estado.sesionM : null}
    />
  );
}

/** El vivo sin estado propio, para la comparación de los cuatro tamaños. */
export function ComparacionCircuito({ caso, onLog }: { caso: CasoGarmin; onLog: (linea: string) => void }) {
  const { c, sim, inicio } = caso;
  const { seq } = useVivoGarmin(c.plan, sim, inicio, { onLog, corriendo: false });
  return (
    <ComparaTamanos tinte={tinteDelPaso(seq.paso, seq.lecturas, seq.plan.zonas)}>
      {() => (
        <>
          <CaraCircuito {...datosDe(seq, c, null)} />
          <AroDeRondas seq={seq} destello={null} />
        </>
      )}
    </ComparaTamanos>
  );
}
