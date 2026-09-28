'use client';

// LAS VISTAS DE LA GRAMÁTICA — cada escenario monta el vivo del kit con lo
// único que la familia pone encima: un estado pequeño (las rondas del AMRAP,
// la tarea marcada del EMOM, lo declarado en fuerza, el GPS que fija antes de
// empezar) y su acción primaria del vocabulario. Ninguna repinta nada: la
// anatomía es la del kit.

import { useEffect, useState } from 'react';
import { useTimeline } from '../../sim';
import {
  AnotarSerie,
  IslaDinamica,
  PantallaBloqueo,
  VistaIphone,
  VivoIphoneDePlan,
  claveDesdeEtiqueta,
  type PrimariaVista,
} from '../../kit-iphone-vivo';
import {
  anotacionDe,
  cargaArrastrada,
  confirmar,
  esFuerza,
  fmtReloj,
  girar,
  heroeDeFamilia,
  laminaDelPaso,
  medidaDe,
  pendiente,
  posicionDe,
  seriesDelDescanso,
  useVivo,
  wodDe,
  type Campo,
  type PasoFuerza,
  type Registro,
  type Secuencia,
} from '../../kit-reloj';
import type { CasoIphone } from './casos';

type Vista = { caso: CasoIphone; onLog: (l: string) => void };

/** Lo normal: el kit tal cual. */
export function VivoBasico({ caso, onLog }: Vista) {
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      duracion={caso.duracion}
      cronoTotal={caso.cronoTotal ? (seq) => caso.cronoTotal!(seq.estado) : undefined}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// AMRAP: las rondas las cuentas tú
// ---------------------------------------------------------------------------

export function VivoAmrap({ caso, onLog }: Vista) {
  const [rondas, setRondas] = useState(caso.rondas ?? 0);
  const primaria = (seq: Secuencia): PrimariaVista | null => {
    const w = wodDe(seq.paso);
    if (w?.formato !== 'amrap' || w.tareas.length < 2 || seq.estado.terminado) return null;
    return {
      clave: 'ronda hecha',
      hacer: () => {
        setRondas((r) => r + 1);
        onLog(`+1 ronda → ${rondas + 1} rondas (deshacer 5 s)`);
      },
    };
  };
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      extra={() => ({ rondas })}
      primaria={(seq) => primaria(seq)}
      avisoCierre={() => `Ronda ${rondas} anotada`}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// EMOM: «hecho» marca la tarea, no cierra el minuto
// ---------------------------------------------------------------------------

export function VivoEmom({ caso, onLog }: Vista) {
  const [hechas, setHechas] = useState<Record<string, number>>({});
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      heroe={(seq, base) => (hechas[seq.paso.id] != null ? { ...base, etiqueta: 'respiro' } : base)}
      primaria={(seq) => {
        const w = wodDe(seq.paso);
        if (w?.formato !== 'emom' || !w.tarea.dosis || hechas[seq.paso.id] != null) return null;
        return {
          clave: 'hecho',
          hacer: () => {
            const t = seq.lecturas.t;
            setHechas((h) => ({ ...h, [seq.paso.id]: t }));
            onLog(`Hecho → ${w.tarea.nombre} en ${fmtReloj(t)}: lo que queda del minuto es respiro`);
          },
        };
      }}
      avisoCierre={(seq) => `${seq.paso.nombre ?? 'Tarea'} hecho`}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Fuerza: la serie se anota en el descanso
// ---------------------------------------------------------------------------

export function VivoFuerza({ caso, onLog, guionAnotar }: Vista & { guionAnotar?: boolean }) {
  const { plan, sim } = caso;
  const [registro, setRegistro] = useState<Registro>(caso.registro ?? {});
  const { seq, eventos } = useVivo(plan, sim, caso.inicio, { onLog });
  const { paso, estado } = seq;
  const i = estado.i;

  const series = paso.rol === 'descanso'
    ? seriesDelDescanso(plan, i).flatMap((j) => {
        const q = plan.pasos[j];
        const anot = anotacionDe(plan, j, registro, medidaDe(plan, estado, j, sim));
        return esFuerza(q) && anot ? [{ paso: q, anot }] : [];
      })
    : [];
  const pendientes = series.filter((s) => pendiente(s.anot));

  const cambiar = (p: PasoFuerza, campo: Campo, dir: 1 | -1) => {
    const anot = anotacionDe(plan, plan.pasos.indexOf(p), registro, null);
    const actual = anot?.[campo]?.valor ?? null;
    const nv = girar(p, campo, actual, dir);
    setRegistro((r) => ({ ...r, [p.id]: { ...r[p.id], [campo]: nv } }));
    onLog(`${dir > 0 ? '+' : '−'} ${campo} → ${nv}: declarado`);
  };
  const confirmarTodo = () => {
    let r = registro;
    series.forEach((s) => {
      r = confirmar(r, s.paso.id, s.anot);
    });
    setRegistro(r);
    eventos.emitir('accion');
    onLog(`Confirmar → ${series.map((s) => s.paso.posicion?.slot ?? 'serie').join(' + ')}: lo propuesto pasa a declarado`);
  };

  // El guion de la anotación (los gestos de la carcasa van por `guion`).
  useTimeline(
    guionAnotar
      ? [
          { at: 2500, run: () => series[0] && cambiar(series[0].paso, 'kg', 1) },
          { at: 3600, run: () => series[0] && cambiar(series[0].paso, 'kg', 1) },
          { at: 6000, run: confirmarTodo },
        ]
      : [],
  );

  return (
    <VistaIphone
      seq={seq}
      eventos={eventos}
      dispositivos={caso.dispositivos}
      extra={(s) => ({
        cargaKg: cargaArrastrada(plan, s.estado.i, registro),
        descansoS: s.paso.siguiente?.rol === 'descanso' ? s.paso.siguiente.medida.prescrito : null,
      })}
      primaria={(s, kit) => (s.paso.rol === 'descanso' && pendientes.length > 0 ? { clave: 'confirmar', hacer: confirmarTodo } : kit)}
      anotar={series.length > 0 ? <AnotarSerie series={series} onCambia={cambiar} onLog={onLog} /> : null}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// GPS antes de empezar
// ---------------------------------------------------------------------------

const GPS_LISTO_MS = 7000;

export function VivoGps({ caso, onLog }: Vista) {
  const [listo, setListo] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setListo(true);
      onLog('GPS listo (.success) → «Empezar» se enciende');
    }, GPS_LISTO_MS);
    return () => clearTimeout(t);
  }, [onLog]);
  const sim: typeof caso.sim = (p, i, t, s) => ({ ...caso.sim(p, i, t, s), gps: listo ? 'listo' : 'buscando', ritmo: listo ? caso.sim(p, i, t, s).ritmo : null });
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      corriendo={corriendo}
      antes={
        corriendo
          ? null
          : {
              listo,
              porQue: 'sin GPS',
              onEmpezar: () => {
                setCorriendo(true);
                onLog('Empezar → arranca el motor con GPS listo');
              },
            }
      }
      guion={[{ en: GPS_LISTO_MS + 1500, gesto: 'primaria' }]}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Fuera de la app: la Live Activity y la Isla Dinámica
// ---------------------------------------------------------------------------

export function Fuera({ caso, onLog, modo }: Vista & { modo: 'bloqueo' | 'isla' }) {
  const { seq } = useVivo(caso.plan, caso.sim, caso.inicio, { onLog });
  const [expandida, setExpandida] = useState(false);
  useEffect(() => {
    if (modo !== 'isla') return;
    const t = setInterval(() => setExpandida((e) => !e), 3000);
    return () => clearInterval(t);
  }, [modo]);
  const { paso, lecturas, estado, plan } = seq;
  const heroe = heroeDeFamilia(paso, lecturas, plan.zonas, { metrosPaso: estado.midio ? estado.metros : null });
  const banda = laminaDelPaso(paso, lecturas, plan.zonas, plan.reglas).banda;
  const veredicto = banda?.palabra ? `${banda.palabra.marca ? `${banda.palabra.marca} ` : ''}${banda.palabra.texto}` : null;
  const etiqueta = paso.rol !== 'trabajo' ? 'empezar ya' : paso.cierre === 'atleta' ? 'serie hecha' : 'siguiente paso';
  const primaria: PrimariaVista = { clave: claveDesdeEtiqueta(etiqueta), hacer: () => { seq.cerrar(); onLog('Live Activity → acción primaria (interactiva, iOS 17+)'); } };
  const comun = { heroe, posicion: posicionDe(paso).slice(0, 2).join(' · '), crono: fmtReloj(estado.sesionT), primaria, veredicto };
  return modo === 'bloqueo' ? <PantallaBloqueo {...comun} hora="9:41" fecha="lunes 28 de septiembre" /> : <IslaDinamica {...comun} expandida={expandida} />;
}
