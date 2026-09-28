'use client';

// EL VIVO DE FUERZA EN EL IPHONE — `useVivo` + `VistaIphone` del kit,
// configurados. Lo que añade la familia, y nada más:
//   · el `Registro` (solo lo declarado) y la anotación del descanso (I7,
//     patrón Hevy/Strong): la tarjeta del kit con los ± y un dato encendido;
//   · lo extra de la rejilla: la carga que está en la barra (la cascada), la
//     última serie anotada del mismo ejercicio;
//   · «Luego ·» y «Viene:» con la carga que está en la barra, no la del plan;
//   · la primaria: «Serie hecha» (kit), «Confirmar» mientras quede algo
//     propuesto, «Empezar ya» después;
//   · la voz de la muñeca (`vozFuerza`): un estado, dos pintores, una voz.
// La anatomía (cabecera, sujeto, rejilla, franja, cuenta atrás, deshacer,
// terminar) es la del kit: aquí no se pinta nada.

import { useEffect, useRef, useState } from 'react';
import { useTimeline } from '../../sim';
import { AnotarSerie, VistaIphone, type Foco, type PrimariaVista, type SerieAnotable } from '../../kit-iphone-vivo';
import {
  anotacionDe,
  cargaArrastrada,
  confirmar,
  esFuerza,
  fmtKg,
  girar,
  luegoDe,
  medidaDe,
  num,
  pendiente,
  seriesDelDescanso,
  seriesQueHeredan,
  ultimaSerieAnotada,
  useVivo,
  type Campo,
  type PasoFuerza,
  type Registro,
  type Secuencia,
} from '../../kit-reloj';
import { vozFuerza } from '../reloj-fuerza/textos';
import type { AccionAnotar, CasoFuerzaIphone } from './casos';

const NOMBRE_CAMPO: Record<Campo, string> = { reps: 'reps', kg: 'carga', esfuerzo: 'esfuerzo' };

/** A qué series llega la carga que acabas de declarar: «también en las series 3–5». */
function textoCascada(siguen: number[]): string | null {
  if (siguen.length === 0) return null;
  if (siguen.length === 1) return `también en la serie ${siguen[0]}`;
  return `también en las series ${siguen[0]}–${siguen[siguen.length - 1]}`;
}

export function VivoFuerzaIphone({ caso, onLog }: { caso: CasoFuerzaIphone; onLog: (linea: string) => void }) {
  const { plan, sim } = caso;
  const [registro, setRegistro] = useState<Registro>(caso.registro);
  const [focoGuardado, setFoco] = useState<Foco | null>(null);
  const { seq, eventos } = useVivo(plan, sim, caso.inicio, { traducir: vozFuerza(plan, registro), onLog });
  const { paso, estado } = seq;
  const i = estado.i;

  // ── El descanso: qué se anota ───────────────────────────────────────────
  const series: SerieAnotable[] =
    paso.rol === 'descanso'
      ? seriesDelDescanso(plan, i).flatMap((j) => {
          const q = plan.pasos[j];
          const anot = anotacionDe(plan, j, registro, medidaDe(plan, estado, j, sim));
          return esFuerza(q) && anot ? [{ paso: q, anot }] : [];
        })
      : [];
  const pendientes = series.filter((s) => pendiente(s.anot));
  // El dato encendido vive en este descanso: en otro paso se olvida.
  const foco = focoGuardado && series.some((s) => s.paso.id === focoGuardado.id) ? focoGuardado : null;

  const mover = (p: PasoFuerza, campo: Campo, dir: 1 | -1) => {
    const j = plan.pasos.indexOf(p);
    const anot = anotacionDe(plan, j, registro, null);
    const actual = anot?.[campo]?.valor ?? null;
    const nv = girar(p, campo, actual, dir);
    const siguiente = { ...registro, [p.id]: { ...registro[p.id], [campo]: nv } };
    setRegistro(siguiente);
    setFoco({ id: p.id, campo });
    const texto = campo === 'kg' ? fmtKg(nv) : num(nv);
    const cascada = campo === 'kg' ? textoCascada(seriesQueHeredan(plan, j, siguiente)) : null;
    onLog(`${dir > 0 ? '+' : '−'} ${NOMBRE_CAMPO[campo]} → ${texto}: declarado${cascada ? ` · ${cascada}` : ''}`);
  };
  const confirmarTodo = () => {
    let r = registro;
    series.forEach((s) => {
      r = confirmar(r, s.paso.id, s.anot);
    });
    setRegistro(r);
    eventos.emitir('accion');
    onLog(`Confirmar → ${series.map((s) => s.paso.posicion?.slot ?? `serie ${s.paso.posicion?.serie?.n ?? ''}`.trim()).join(' + ')}: lo propuesto pasa a declarado`);
  };

  // ── Los gestos guionizados de la anotación (los de la carcasa van por `guion`) ──
  const hacer = useRef<(a: AccionAnotar) => void>(() => undefined);
  useEffect(() => {
    hacer.current = (a) => {
      if (a.tipo === 'confirmar') confirmarTodo();
      else if (series[a.serie]) mover(series[a.serie]!.paso, a.campo, a.dir);
    };
  });
  useTimeline((caso.acciones ?? []).map((x) => ({ at: x.en, run: () => hacer.current(x.accion) })));

  // ── Lo que la familia configura del kit ─────────────────────────────────
  const cargaDe = (j: number) => cargaArrastrada(plan, j, registro);
  const primaria = (s: Secuencia, kit: PrimariaVista | null): PrimariaVista | null =>
    s.paso.rol === 'descanso' && pendientes.length > 0 ? { clave: 'confirmar', hacer: confirmarTodo } : kit;

  return (
    <VistaIphone
      seq={seq}
      eventos={eventos}
      dispositivos={caso.dispositivos}
      extra={(s) => ({ cargaKg: cargaDe(s.estado.i), ultimaSerie: ultimaSerieAnotada(plan, s.estado.i, registro) })}
      luego={(s) => luegoDe(plan.pasos, s.estado.i, cargaDe)}
      primaria={primaria}
      anotar={series.length > 0 ? <AnotarSerie series={series} onCambia={mover} onLog={onLog} foco={foco ?? undefined} onFoco={setFoco} /> : null}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}
