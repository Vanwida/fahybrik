'use client';

// EL VIVO DEL CIRCUITO — `useVivo` + `VistaVivo` del kit, configurados. El
// motor del kit ya hace lo que el circuito necesitaba en local (P10): un
// parcial por paso, la Roxzone de salida cerrada por detección, el preaviso
// que no se repite al arrancar dentro de él. Lo que pone el circuito encima:
//   · su voz (`traductorCircuito`): el parcial de cada tramo y estación y la
//     entrada dicha en circuito;
//   · sus caras (estación, Roxzone, AMRAP; la carrera es la de correr del kit),
//     su descanso con su «Viene:» y sus capas (3-2-1 con la posición, «Entras a…»);
//   · la corona de la Ruta: Paso → Ruta → Datos;
//   · el crono total (la puntuación) y el aro con lo que dura cada estación;
//   · la puntuación del AMRAP en la campana, con la corona.

import { useState } from 'react';
import {
  Descanso,
  VistaVivo,
  girarDial,
  segundosDeParciales,
  useVivo,
  type AccionPrimaria,
  type Dial,
  type EstadoSecuencia,
  type Secuencia,
} from '../../kit-reloj';
import { CapaCuenta, CapaEntras } from './capas';
import { caraDelPaso } from './caras';
import type { CasoCircuito } from './casos';
import { PaginaDatosCircuito, PaginaRuta } from './paginas';
import { dibujoDe, esEstacion, esPuntuacion, type Circuito } from './planes';
import { accionDe, avisoDe, vieneDe } from './texto';
import { traductorCircuito } from './voz';

/** Lo que dura la capa «Entras a…». */
const ENTRAS_S = 3;

/** El crono total (la puntuación): desde el primer paso del circuito. `null` = aún en el calentamiento. */
export function totalDe(e: EstadoSecuencia, c: Circuito): number | null {
  if (e.i < c.inicio) return null;
  return e.sesionT - segundosDeParciales(e.parciales.filter((x) => x.i < c.inicio));
}

/**
 * «Entras a…» cuando nada ha anunciado la estación: ni una Roxzone de entrada
 * ni el GO de un descanso (el motor deja `goHasta` a 0 si no hubo GO).
 */
function entras(seq: Secuencia): boolean {
  const { paso, estado, plan } = seq;
  const anterior = plan.pasos[estado.i - 1];
  return esEstacion(paso) && !estado.terminado && estado.goHasta === 0 && estado.t < ENTRAS_S && anterior?.roxzone !== 'entrada' && estado.i > 0;
}

export function VivoCircuito({ caso, onLog }: { caso: CasoCircuito; onLog: (linea: string) => void }) {
  const { c, sim, inicio } = caso;
  const zonas = c.plan.zonas;
  // La puntuación dicha en cada campana, por índice de paso.
  const [diales, setDiales] = useState<Record<number, Dial>>(caso.diales ?? {});
  const reps = (i: number) => diales[i]?.reps ?? null;
  const { seq, eventos } = useVivo(c.plan, sim, inicio, { traducir: traductorCircuito(c, reps), onLog });
  const { paso, lecturas, estado } = seq;
  const total = totalDe(estado, c);
  const dial = esPuntuacion(paso) ? (diales[estado.i] ?? { rondas: 0, reps: null }) : null;

  // La corona, en la campana: arriba es «más».
  const corona = (_s: Secuencia, dir: 1 | -1) => {
    if (!esPuntuacion(paso)) return false;
    const i = estado.i;
    setDiales((d) => ({ ...d, [i]: girarDial(d[i] ?? { rondas: 0, reps: null }, dir === 1 ? -1 : 1, 0) }));
    return true;
  };

  const cara = () =>
    paso.rol === 'descanso' ? (
      <Descanso paso={paso} lecturas={lecturas} onMas30={seq.sumar30} viene={paso.siguiente ? vieneDe(paso.siguiente, c) : null} />
    ) : (
      caraDelPaso({ paso, lecturas, zonas, c, total, dial })
    );

  const capa = (s: Secuencia) =>
    s.cuenta != null && paso.siguiente ? (
      <CapaCuenta n={s.cuenta} paso={paso.siguiente} c={c} />
    ) : s.go ? (
      <CapaCuenta n={0} paso={paso} c={c} />
    ) : entras(s) ? (
      <CapaEntras paso={paso} c={c} />
    ) : null;

  const accion = (_s: Secuencia, kit: AccionPrimaria | null): AccionPrimaria | null => {
    const etiqueta = accionDe(paso);
    return kit && etiqueta ? { ...kit, etiqueta } : null;
  };

  return (
    <VistaVivo
      seq={seq}
      eventos={eventos}
      cara={cara}
      paginas={(_s, contenido) => [
        { id: 'paso', titulo: 'Paso', contenido },
        { id: 'ruta', titulo: 'Ruta', contenido: <PaginaRuta c={c} e={estado} reps={reps} /> },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatosCircuito c={c} e={estado} total={total} lecturas={lecturas} zonas={zonas} /> },
      ]}
      capa={capa}
      accion={accion}
      corona={corona}
      avisoCierre={(p) => avisoDe(p, c)}
      duracion={dibujoDe}
      inicial={caso.inicial}
      guion={caso.guion}
      modelo={caso.modelo}
      onLog={onLog}
    />
  );
}
