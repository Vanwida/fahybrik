'use client';

// LAS VISTAS DEL CIRCUITO — el vivo del kit, configurado. Ninguna repinta
// nada: la familia pone la cabecera en dos preguntas (`tituloDe`, `formatoDe`),
// el crono total (la puntuación), la acción del momento del circuito, su
// voz (el parcial de cada tramo y estación), lo que dura cada estación en la
// tira y la Estructura con los parciales (`RutaCircuito`). El bloque continuo
// no es un circuito: es el kit tal cual con el chip de la máquina siguiendo
// al paso.

import { VistaIphone, claveDesdeEtiqueta, type Dispositivos } from '../../kit-iphone-vivo';
import { useVivo, type Secuencia } from '../../kit-reloj';
import { dibujoDe } from '../reloj-circuito/planes';
import { accionDe, avisoDe } from '../reloj-circuito/texto';
import { totalDe } from '../reloj-circuito/vista';
import { traductorCircuito } from '../reloj-circuito/voz';
import type { CasoCircuitoIphone } from './casos';
import { RutaCircuito } from './ruta';
import { formatoDe, tituloDe } from './texto';

type Vista = { caso: CasoCircuitoIphone; onLog: (l: string) => void };

/** Con todas las máquinas emparejadas, el chip es el de la máquina del paso; sin ninguna, el que diga el caso. */
function dispositivosDe(caso: CasoCircuitoIphone, seq: Secuencia): Dispositivos {
  return caso.maquinaDelPaso ? { ...caso.dispositivos, maquina: seq.paso.maquina?.tipo ?? null } : caso.dispositivos;
}

/** En un chipper las reps del AMRAP se dicen en la campana; esta familia no lo enseña (es de la del WOD). */
const SIN_REPS = () => null;

export function VivoCircuitoIphone({ caso, onLog }: Vista) {
  const c = caso.c!;
  const { seq, eventos } = useVivo(c.plan, caso.sim, caso.inicio, { traducir: traductorCircuito(c, SIN_REPS), onLog });
  return (
    <VistaIphone
      seq={seq}
      eventos={eventos}
      dispositivos={dispositivosDe(caso, seq)}
      posicion={(s) => tituloDe(s.paso, c)}
      formato={(s, kit) => formatoDe(s.paso, c, kit)}
      cronoTotal={(s) => totalDe(s.estado, c)}
      duracion={dibujoDe}
      primaria={(s, kit) => {
        if (!kit) return kit;
        const etiqueta = accionDe(s.paso);
        return etiqueta ? { ...kit, clave: claveDesdeEtiqueta(etiqueta) } : null;
      }}
      avisoCierre={(s) => avisoDe(s.paso, c)}
      estructura={(s) => <RutaCircuito c={c} seq={s} />}
      paginaInicial={caso.paginaInicial}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

export function VivoContinuo({ caso, onLog }: Vista) {
  const { seq, eventos } = useVivo(caso.plan!, caso.sim, caso.inicio, { onLog });
  return <VistaIphone seq={seq} eventos={eventos} dispositivos={dispositivosDe(caso, seq)} paginaInicial={caso.paginaInicial} guion={caso.guion} onLog={onLog} />;
}
