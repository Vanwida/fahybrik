'use client';

// EL FLUJO — del vivo al resumen, con cinco botones.
//
//   vivo ─(el motor cierra el último paso, o Terminar → «Guardar lo hecho»)─▶ fin
//   fin ─START Guardar─▶ rpe ─START Confirmar / BACK Saltar─▶ resumen ─START Listo─▶ salida
//   fin ─BACK Seguir─▶ vivo (enfriamiento libre) ─BACK, o 10′ quieto─▶ fin
//
// El vivo es EL DE «Garmin · gramática» (`VistaGarmin`): el mismo motor, la misma
// cara, los mismos botones. Cuando acaba, este flujo toma el relevo con su
// propia carcasa (la de las fases de después, con sus rótulos), y le pasa el
// último aviso para que el lector de debajo siga diciendo qué vibró y qué sonó
// («Sesión hecha»). El relevo tarda lo justo para que el aviso salga del motor
// (`RELEVO_MS`); no es el retraso de la muñeca (700 ms), que aquí dejaría ver
// un instante los rótulos del kit con el «+» y el «−».
//
// Qué NO hacer: decidir aquí si la sesión es completa (es `completitud`);
// reescribir el vivo; guardar sin que el atleta pulse START (G3: nada se cierra
// sin una tecla física).

import { useEffect, useRef, useState } from 'react';
import { VistaGarmin, useVivoGarmin, type EmisionGarmin } from '../../kit-garmin';
import { METODO_RESUMEN_DEFECTO, metodoDe, useQuieto, fmtReloj, type FinDeVivo, type InicioSecuencia, type PlanSesion, type Simulador } from '../../kit-reloj';
import { cuerpo } from '../reloj-correr/casos';
import type { Resultado } from '../reloj-antes-despues/calculo';
import { resultadoDeVivo } from '../reloj-antes-despues/sellar';
import { enfriamientoLibre } from '../reloj-antes-despues/sesiones';
import type { Escena } from './escena';
import { FaseFin, FaseResumen, FaseRpe } from './fases';

/** Lo que tarda el flujo en tomar el relevo del vivo: lo justo para que el motor entregue el aviso de «sesión hecha» (un tic del bucle). */
export const RELEVO_MS = 60;

type Fase =
  | { f: 'vivo'; plan: PlanSesion; inicio: InicioSecuencia; sim: Simulador; enfriamiento: boolean }
  | { f: 'fin'; r: Resultado; natural: boolean; recuperada: boolean; sola: number | null }
  | { f: 'rpe'; r: Resultado }
  | { f: 'resumen'; r: Resultado };

/** Tras «Seguir»: un enfriamiento abierto que sigue grabando en la misma sesión. */
function enfriamiento(r: Resultado, entorno: Escena['sesion']['entorno'], sim: Simulador): Fase {
  return {
    f: 'vivo',
    plan: enfriamientoLibre(entorno),
    inicio: { i: 0, t: 0, sesionT: r.t, sesionM: r.metros ?? 0, ppmMedio: r.ppmMedio ?? undefined, vueltaDesdeT: r.t },
    sim,
    enfriamiento: true,
  };
}

function faseInicial(e: Escena): Fase {
  const a = e.arranque;
  switch (a.en) {
    case 'vivo':
      return { f: 'vivo', plan: e.sesion.plan, inicio: a.inicio, sim: a.sim, enfriamiento: false };
    case 'seguir':
      return enfriamiento(a.r, e.sesion.entorno, a.sim);
    case 'fin':
      return { f: 'fin', r: a.r, natural: a.natural ?? true, recuperada: a.recuperada ?? false, sola: null };
    case 'rpe':
      return { f: 'rpe', r: a.r };
    case 'resumen':
      return { f: 'resumen', r: a.r };
  }
}

/** El vivo de una fase: el de la gramática, con su motor, más el relevo al acabar y el guardado solo tras un rato quieto. */
function FaseVivo(p: { fase: Extract<Fase, { f: 'vivo' }>; escena: Escena; onFin: (fin: FinDeVivo, ultimo: EmisionGarmin | null) => void; onLog: (l: string) => void }) {
  const { fase, escena } = p;
  const metodo = escena.metodo ?? metodoDe(fase.plan).resumen;
  const { seq, avisos } = useVivoGarmin(fase.plan, fase.sim, fase.inicio, { onLog: p.onLog });
  const ultimoAviso = useRef(avisos.ultimo);
  useEffect(() => {
    ultimoAviso.current = avisos.ultimo;
  });
  const salio = useRef(false);
  const salir = (fin: FinDeVivo) => {
    if (salio.current) return;
    salio.current = true;
    p.onFin(fin, ultimoAviso.current);
  };
  // El enfriamiento libre se guarda solo tras un rato quieto y sin tocar nada (dato del coach).
  const tocado = useQuieto(seq, fase.enfriamiento ? { s: metodo.guardarQuietoS, compresion: escena.compresion } : null, (desde) => salir({ estado: seq.estado, final: 'natural', quietoDesde: desde }));
  // El motor cerró el último paso: el flujo toma el relevo.
  const terminado = seq.estado.terminado;
  useEffect(() => {
    if (!terminado) return;
    const t = setTimeout(() => salir({ estado: seq.estado, final: 'natural' }), RELEVO_MS);
    return () => clearTimeout(t);
    // Una vez por fin de sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminado]);
  return (
    <VistaGarmin
      seq={seq}
      avisos={avisos}
      inicial={escena.inicialVivo}
      guion={escena.guiones?.vivo}
      alAccion={() => {
        tocado();
        return false;
      }}
      onFin={(fin) => salir(fin)}
      onLog={p.onLog}
    />
  );
}

export function Flujo({ escena, onLog }: { escena: Escena; onLog: (l: string) => void }) {
  const metodo = escena.metodo ?? METODO_RESUMEN_DEFECTO;
  const [fase, setFase] = useState<Fase>(() => faseInicial(escena));
  // La sesión ya cerrada a la que se le sigue añadiendo enfriamiento libre.
  const [previo, setPrevio] = useState<Resultado | null>(() => (escena.arranque.en === 'seguir' ? escena.arranque.r : null));
  // El último aviso que dio el vivo: el lector de debajo lo conserva en todas las fases.
  const [ultimo, setUltimo] = useState<EmisionGarmin | null>(null);
  const g = escena.guiones ?? {};

  const alFin = (fin: FinDeVivo, aviso: EmisionGarmin | null) => {
    if (fase.f !== 'vivo') return;
    setUltimo(aviso);
    const r = resultadoDeVivo(fase.plan, fin, escena.base ?? null);
    if (fase.enfriamiento && previo) {
      // Guardada sola por inactividad: el enfriamiento llega hasta que se paró, no hasta que saltó el guardado.
      const hasta = fin.quietoDesde ?? r.t;
      const libreS = Math.max(0, hasta - previo.t);
      const sola = fin.quietoDesde != null ? metodo.guardarQuietoS : null;
      if (sola != null) onLog(`Quieto y sin tocar nada ${fmtReloj(sola)} → la sesión se guarda sola (dato del coach)`);
      setFase({ f: 'fin', r: { ...previo, t: hasta, metros: r.metros, ppmMedio: r.ppmMedio, km: [...previo.km, ...r.km], libreS }, natural: true, recuperada: false, sola });
      return;
    }
    setFase({ f: 'fin', r, natural: fin.final === 'natural', recuperada: false, sola: null });
  };

  switch (fase.f) {
    case 'vivo':
      return <FaseVivo fase={fase} escena={escena} onFin={alFin} onLog={onLog} />;
    case 'fin':
      return (
        <FaseFin
          r={fase.r}
          natural={fase.natural}
          recuperada={fase.recuperada}
          sola={fase.sola}
          metodo={metodo}
          ultimo={ultimo}
          guion={g.fin}
          onGuardar={() => {
            onLog('Guardar → se sella la sesión (lo decide lo hecho, no la pantalla) y sigue el RPE');
            setFase({ f: 'rpe', r: fase.r });
          }}
          onSeguir={() => {
            onLog('Seguir → sigue grabando: enfriamiento libre, dentro de la misma sesión');
            setPrevio(fase.r);
            setFase(enfriamiento(fase.r, escena.sesion.entorno, cuerpo({ ppmDesde: 150 })));
          }}
          onSigue={() => setFase({ f: 'rpe', r: fase.r })}
          onLog={onLog}
        />
      );
    case 'rpe':
      return <FaseRpe ultimo={ultimo} guion={g.rpe} onHecho={(rpe) => setFase({ f: 'resumen', r: { ...fase.r, rpe } })} onLog={onLog} />;
    case 'resumen':
      return (
        <FaseResumen
          r={fase.r}
          familia={escena.sesion.familia}
          metodo={metodo}
          envio={{ inicial: escena.envio?.inicial ?? 'en-reloj', acuses: escena.envio?.acuses ?? [] }}
          inicial={escena.inicialResumen}
          ultimo={ultimo}
          guion={g.resumen}
          onLog={onLog}
        />
      );
  }
}
