'use client';

// LAS VISTAS DEL WOD — cada escenario monta el vivo del kit con lo ÚNICO que
// la familia pone encima: su estado (las tareas marcadas del EMOM y del death
// by, las rondas y la puntuación del AMRAP) y su acción primaria del
// vocabulario, con su deshacer. Ninguna repinta nada: la anatomía es la del
// kit; el héroe, la rejilla y los textos, del kit compartido (`kit-reloj`).

import { useEffect, useRef, useState } from 'react';
import { useTimeline } from '../../sim';
import { AnotarPuntuacion, ListaAlrededor, VistaIphone, VivoIphoneDePlan, type CampoPuntuacion, type PrimariaVista } from '../../kit-iphone-vivo';
import {
  alrededorDe,
  cazadoEn,
  deathByDe,
  fmtReloj,
  girarPuntuacion,
  heroeDeathBy,
  repsPorRonda,
  resultadoDeathBy,
  useVivo,
  wodDe,
  type Dial,
  type PlanSesion,
  type Secuencia,
  type Traductor,
} from '../../kit-reloj';
import type { CasoWodIphone } from './casos';

type Vista = { caso: CasoWodIphone; onLog: (l: string) => void };

/** Del estado de partida por ÍNDICE de paso (los ids se generan) a un estado por id. */
function porId(plan: PlanSesion, porIndice: Record<number, number> | undefined): Record<string, number> {
  const r: Record<string, number> = {};
  for (const [k, v] of Object.entries(porIndice ?? {})) {
    const p = plan.pasos[Number(k)];
    if (p) r[p.id] = v;
  }
  return r;
}

/** El estado sin una ventana (deshacer un «hecho»). */
function sin(h: Record<string, number>, id: string): Record<string, number> {
  const r = { ...h };
  delete r[id];
  return r;
}

/** Lo normal: el kit tal cual (el Tabata). */
export function VivoBasico({ caso, onLog }: Vista) {
  return <VivoIphoneDePlan plan={caso.plan} sim={caso.sim} inicio={caso.inicio} dispositivos={caso.dispositivos} guion={caso.guion} onLog={onLog} />;
}

// ---------------------------------------------------------------------------
// EMOM: «hecho» marca la tarea (no cierra el minuto) y se deshace 5 s
// ---------------------------------------------------------------------------

/** Cuánto tardó la MISMA tarea la última vez que se marcó (por nombre, hacia atrás). */
function ultimaVezDe(plan: PlanSesion, i: number, hechas: Record<string, number>, nombre: string | undefined): number | null {
  for (let k = i - 1; k >= 0; k--) {
    const q = plan.pasos[k]!;
    if (q.nombre === nombre && hechas[q.id] != null) return hechas[q.id]!;
  }
  return null;
}

export function VivoEmom({ caso, onLog }: Vista) {
  const [hechas, setHechas] = useState<Record<string, number>>(() => porId(caso.plan, caso.hechas));
  const primaria = (seq: Secuencia): PrimariaVista | null => {
    const w = wodDe(seq.paso);
    const id = seq.paso.id;
    if (w?.formato !== 'emom' || !w.tarea.dosis || hechas[id] != null || seq.estado.terminado) return null;
    return {
      clave: 'hecho',
      hacer: () => {
        const t = seq.lecturas.t;
        setHechas((h) => ({ ...h, [id]: t }));
        onLog(`Hecho → ${w.tarea.nombre} en ${fmtReloj(t)}: lo que queda del minuto es respiro`);
      },
      deshacer: {
        aviso: `${w.tarea.nombre} hecho`,
        hacer: () => setHechas((h) => sin(h, id)),
      },
    };
  };
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      extra={(seq) => ({ ultimaVentana: ultimaVezDe(caso.plan, seq.estado.i, hechas, seq.paso.nombre) })}
      heroe={(seq, base) => (hechas[seq.paso.id] != null ? { ...base, etiqueta: 'respiro' } : base)}
      primaria={primaria}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Death by: las reps de este minuto; si el reloj te caza, se acabó
// ---------------------------------------------------------------------------

export function VivoDeathBy({ caso, onLog }: Vista) {
  const [hechas, setHechas] = useState<Record<string, number>>(() => porId(caso.plan, caso.hechas));
  // El traductor lee el estado MÁS RECIENTE (se llama desde el tic del motor).
  const hechasRef = useRef(hechas);
  useEffect(() => {
    hechasRef.current = hechas;
  }, [hechas]);
  const { plan } = caso;
  const completos = () => Object.keys(hechasRef.current).length;
  const resultado = () => resultadoDeathBy(completos(), deathByDe(plan.pasos[0])?.tope ?? null);

  // Un minuto que se cierra sin «Hecho» es el último: en vez del GO del
  // siguiente, la sesión hecha con la puntuación (el mismo evento y háptico).
  const traducir: Traductor = (t) =>
    t.despues.i > t.antes.i && cazadoEn(plan.pasos, t.antes.i, hechasRef.current) ? [{ evento: 'sesion', voz: `Te ha cazado el reloj. ${resultado()}.` }] : t.eventos;

  const primaria = (seq: Secuencia): PrimariaVista | null => {
    const w = deathByDe(seq.paso);
    const id = seq.paso.id;
    if (!w || hechas[id] != null || seq.estado.terminado) return null;
    const reps = w.tarea.dosis?.prescrito ?? 0;
    return {
      clave: 'hecho',
      hacer: () => {
        const t = seq.lecturas.t;
        setHechas((h) => ({ ...h, [id]: t }));
        onLog(`Hecho → ${reps} ${w.tarea.nombre} en ${fmtReloj(t)}: respiro hasta el minuto que viene`);
      },
      deshacer: {
        aviso: `${reps} ${w.tarea.nombre} hechos`,
        hacer: () => setHechas((h) => sin(h, id)),
      },
    };
  };
  // Con estado propio que decide el final (el reloj te caza): el motor y la vista por separado.
  const { seq, eventos } = useVivo(plan, caso.sim, caso.inicio, { onLog, traducir });
  const i = seq.estado.i;
  useEffect(() => {
    if (seq.estado.terminado || i === 0 || !cazadoEn(plan.pasos, i - 1, hechasRef.current)) return;
    seq.terminar();
    onLog(`El reloj te cazó en el minuto ${i}: ${resultado()}`);
    // Solo al cambiar de minuto: `seq` cambia cada segundo y no debe reevaluar esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  return (
    <VistaIphone
      seq={seq}
      eventos={eventos}
      dispositivos={caso.dispositivos}
      extra={(s) => ({ ultimaVentana: ultimaVezDe(plan, s.estado.i, hechas, s.paso.nombre) })}
      heroe={(s, base) => (hechas[s.paso.id] != null ? (heroeDeathBy(s.paso, hechas[s.paso.id]) ?? base) : base)}
      primaria={primaria}
      detalleFin={() => resultado()}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// AMRAP: las rondas las cuentas tú; en la campana, las reps de la ronda a medias
// ---------------------------------------------------------------------------

export function VivoAmrap({ caso, onLog }: Vista) {
  const [rondas, setRondas] = useState<number[]>(caso.rondas ?? []);
  const [dial, setDial] = useState<Dial | null>(null);
  const [foco, setFoco] = useState<CampoPuntuacion>('reps');
  const tareas = (seq: Secuencia) => {
    const w = wodDe(seq.paso);
    return w?.formato === 'amrap' || w?.formato === 'puntuacion' ? w.tareas : [];
  };
  const dialDe = (): Dial => dial ?? { rondas: rondas.length, reps: null };
  // El guion (un temporizador) lee el estado MÁS RECIENTE por refs, no el de su render.
  const vivo = useRef({ seq: null as Secuencia | null, dial: dialDe(), foco });
  useEffect(() => {
    vivo.current.dial = dialDe();
    vivo.current.foco = foco;
  });
  const mover = (delta: number) => {
    const seq = vivo.current.seq;
    if (!seq) return;
    const nuevo = girarPuntuacion(vivo.current.dial, vivo.current.foco, delta, repsPorRonda(tareas(seq)));
    vivo.current.dial = nuevo;
    setDial(nuevo);
    onLog(`${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${vivo.current.foco} → ${nuevo.rondas} + ${nuevo.reps ?? '—'}`);
  };
  useTimeline((caso.guionReps ?? []).map((g) => ({ at: g.en, run: () => mover(g.delta) })));

  const primaria = (seq: Secuencia, kit: PrimariaVista | null): PrimariaVista | null => {
    const w = wodDe(seq.paso);
    if (w?.formato !== 'amrap' || w.tareas.length < 2 || seq.estado.terminado) return kit;
    const n = rondas.length + 1;
    return {
      clave: 'ronda hecha',
      hacer: () => {
        const t = seq.lecturas.t;
        setRondas((r) => [...r, t]);
        onLog(`+1 ronda → ${n} rondas a ${fmtReloj(t)} (deshacer 5 s)`);
      },
      deshacer: { aviso: `Ronda ${n} anotada`, hacer: () => setRondas((r) => r.slice(0, -1)) },
    };
  };
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      extra={(seq) => {
        vivo.current.seq = seq;
        return { rondas: dialDe().rondas, repsSueltas: dialDe().reps };
      }}
      primaria={primaria}
      apoyo={(seq) =>
        wodDe(seq.paso)?.formato === 'puntuacion' ? (
          <AnotarPuntuacion
            dial={dialDe()}
            tareas={tareas(seq)}
            foco={foco}
            onFoco={(c) => {
              setFoco(c);
              onLog(`Toque → ${c}: los ± mueven ese dato`);
            }}
            onMueve={(d) => mover(d)}
          />
        ) : null
      }
      apoyoCompacto={false}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// For Time · chipper: el crono total manda; la lista, ±1 y «+N más»
// ---------------------------------------------------------------------------

export function VivoChipper({ caso, onLog }: Vista) {
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      cronoTotal={caso.cronoTotal ? (seq) => caso.cronoTotal!(seq.estado) : undefined}
      apoyo={(seq, kit) => <ListaAlrededor alrededor={alrededorDe(seq.plan.pasos, seq.estado.i, seq.estado.parciales)} onAbrir={() => kit.irA('estructura')} />}
      celdasConApoyo={4}
      luego={() => null}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}
