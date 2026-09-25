'use client';

// EL VIVO DE FUERZA — montado a mano con el kit (`useEventos` + `useSecuencia`
// + `Muneca`), porque `VivoDePlan` trae la pila de correr (Paso → Datos →
// Vueltas → Estructura) y la de fuerza es Serie → Ejercicios → Datos.
//
// Lo que añade a la composición estándar, y nada más:
//   · la anotación del descanso (el `Registro`: solo lo declarado);
//   · la corona con foco: con un dato encendido, gira el dato y la pila se
//     queda en una página (watchOS: `digitalCrownRotation` con foco);
//   · la voz de fuerza: los eventos del motor salen por una cola y se dicen
//     con el paso YA avanzado («A1, Back Squat. Serie 2 de 4…»);
//   · la acción del momento: «serie hecha» (con su deshacer de 5 s),
//     «confirmar» mientras quede algo propuesto, «empezar ya» después.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AroSesion,
  Muneca,
  PasoCorrer,
  Recupera,
  TresDosUno,
  num,
  useEventos,
  useSecuencia,
  type AccionPrimaria,
  type EventoVivo,
  type Eventos,
  type PaginaVivo,
} from '../../kit-reloj';
import { anotacionDe, cargaArrastrada, confirmar, girar, medidaDe, pendiente, seriesDelDescanso, type Campo, type Registro } from './anotar';
import type { AccionGuion, CasoFuerza } from './casos';
import { CaraColocate, CaraSerie, CuentaFuerza } from './caras';
import { DescansoFuerza, type SerieAnotable, type VistaDescanso } from './descanso';
import { avisoSerie, esFuerza, fmtKg } from './modelo';
import { PaginaDatosFuerza, PaginaEjercicios } from './paginas';
import { textoLuego, textoPistaCorona, textoViene, vozDe } from './textos';

/** Lo que el atleta tiene abierto en un descanso. Se olvida solo al cambiar de paso. */
interface UiDescanso {
  paso: string | null;
  /** La serie abierta en columnas (índice en las series del descanso). */
  abierta: number | null;
  foco: Campo | null;
  /** Reabrir la lista de una ronda ya anotada. */
  lista: boolean;
}

const UI_VACIA: UiDescanso = { paso: null, abierta: null, foco: null, lista: false };

const NOMBRE_CAMPO: Record<Campo, string> = { reps: 'reps', kg: 'carga', esfuerzo: 'esfuerzo' };

export function VivoFuerza({ caso, onLog }: { caso: CasoFuerza; onLog: (linea: string) => void }) {
  const { plan, sim } = caso;
  const ev = useEventos(onLog);

  // La cola de la voz: el motor emite al cerrar un paso, y la frase se
  // compone cuando el estado nuevo ya está pintado (el paso al que se entra).
  const cola = useRef<Array<{ evento: EventoVivo; voz?: string }>>([]);
  const [lote, setLote] = useState(0);
  const encolar = useMemo<Eventos>(
    () => ({
      emitir: (evento, voz) => {
        cola.current.push({ evento, voz });
        setLote((n) => n + 1);
      },
      ultimo: null,
    }),
    [],
  );
  const seq = useSecuencia(plan, sim, caso.inicio, encolar);
  const [registro, setRegistro] = useState<Registro>(caso.registro);
  const [uiGuardada, setUi] = useState<UiDescanso>(UI_VACIA);

  const { estado, paso, lecturas } = seq;
  const i = estado.i;
  const emitir = ev.emitir;
  useEffect(() => {
    const l = cola.current;
    if (l.length === 0) return;
    cola.current = [];
    l.forEach((e) => emitir(e.evento, vozDe(e.evento, e.voz, plan, i, registro)));
  }, [lote, i, emitir, plan, registro]);

  // ── El descanso: qué se anota y cómo se ve ──────────────────────────────
  const ui = uiGuardada.paso === paso.id ? uiGuardada : UI_VACIA;
  const enDescanso = paso.rol === 'descanso';
  const velocidadMedia = (reps: number | null) => {
    const v = caso.velocidad;
    if (!v || !reps) return null;
    const media = v.porRep.slice(0, reps).reduce((a, x) => a + x, 0) / Math.min(reps, v.porRep.length);
    // Dos decimales: en velocidad de barra 0,67 y 0,7 no son lo mismo.
    return `${media.toFixed(2).replace('.', ',')} m/s · confianza ${v.confianza}`;
  };
  const series: SerieAnotable[] = enDescanso
    ? seriesDelDescanso(plan, i).flatMap((j) => {
        const q = plan.pasos[j];
        const m = medidaDe(plan, estado, j, sim);
        const anot = anotacionDe(plan, j, registro, m);
        return esFuerza(q) && anot ? [{ paso: q, anot, velocidad: q.medida.mide === 'sensor' ? velocidadMedia(m?.reps ?? null) : null }] : [];
      })
    : [];
  const pendientes = series.filter((s) => pendiente(s.anot));
  const vista: VistaDescanso =
    ui.abierta != null ? 'columnas' : ui.lista ? 'lista' : pendientes.length === 0 ? 'resumen' : series.length === 1 ? 'columnas' : 'lista';
  const abierta = vista === 'columnas' ? (ui.abierta ?? 0) : null;
  const foco = vista === 'columnas' ? ui.foco : null;
  const serieAbierta = abierta != null ? series[abierta] : undefined;
  const jAbierta = serieAbierta ? plan.pasos.indexOf(serieAbierta.paso) : -1;

  const abrir = (k: number) => {
    setUi({ paso: paso.id, abierta: k, foco: null, lista: false });
    onLog(`Toque → abre ${series[k]?.paso.posicion?.slot ?? 'la serie'} para anotar`);
  };
  /** Tocar un dato lo enciende; tocarlo otra vez lo apaga. `fijo` = encenderlo sin alternar (guion). */
  const enfocar = (campo: Campo, fijo = false) => {
    const nuevo = foco === campo && !fijo ? null : campo;
    if (nuevo === foco) return;
    setUi({ paso: paso.id, abierta: abierta ?? 0, foco: nuevo, lista: false });
    onLog(nuevo ? `Toque → ${NOMBRE_CAMPO[campo]} encendida: la corona la gira` : `Toque → ${NOMBRE_CAMPO[campo]} apagada: la corona vuelve a pasar página`);
  };
  const corona = (dir: 1 | -1) => {
    if (!foco || !serieAbierta) return;
    const dato = serieAbierta.anot[foco];
    if (!dato) return;
    const nv = girar(serieAbierta.paso, foco, dato.valor, dir);
    setRegistro((r) => ({ ...r, [serieAbierta.paso.id]: { ...r[serieAbierta.paso.id], [foco]: nv } }));
    const texto = foco === 'kg' ? fmtKg(nv) : num(nv);
    const cascada = foco === 'kg' ? ` · ${textoPistaCorona(plan, jAbierta, 'kg', registro)}` : '';
    onLog(`Corona ${dir > 0 ? '▲' : '▼'} → ${NOMBRE_CAMPO[foco]} ${texto} (declarada)${cascada}`);
  };
  const confirmarDescanso = () => {
    const alcance = vista === 'columnas' && serieAbierta ? [serieAbierta] : series;
    let r = registro;
    alcance.forEach((s) => {
      r = confirmar(r, s.paso.id, s.anot);
    });
    setRegistro(r);
    const quedan = vista === 'columnas' && series.length > 1 && series.some((s) => s !== serieAbierta && pendiente(s.anot));
    setUi(quedan ? { paso: paso.id, abierta: null, foco: null, lista: true } : UI_VACIA);
    emitir('accion');
    onLog(`Confirmado → ${alcance.map((s) => `${s.paso.posicion?.slot ?? `serie ${s.paso.posicion?.serie?.n}`}`).join(' + ')}: lo propuesto pasa a declarado`);
  };
  const reabrir = () => {
    setUi(series.length > 1 ? { paso: paso.id, abierta: null, foco: null, lista: true } : { paso: paso.id, abierta: 0, foco: null, lista: false });
    onLog('Toque → reabre la anotación');
  };

  // ── La acción del momento ───────────────────────────────────────────────
  const accion: AccionPrimaria | null = estado.terminado
    ? null
    : enDescanso && vista !== 'resumen'
      ? { etiqueta: pendientes.length > 0 ? 'confirmar' : 'listo', hacer: confirmarDescanso }
      : paso.rol !== 'trabajo'
        ? { etiqueta: 'empezar ya', hacer: seq.cerrar, deshacer: enDescanso ? { aviso: 'Descanso cortado', hacer: seq.deshacer } : undefined }
        : { etiqueta: 'serie hecha', hacer: seq.cerrar, deshacer: { aviso: avisoSerie(paso), hacer: seq.deshacer } };

  // ── Los gestos guionizados de la anotación (los de la carcasa van por `guion`) ──
  const hacer = useRef<(a: AccionGuion) => void>(() => undefined);
  useEffect(() => {
    hacer.current = (a) => {
      if (a.tipo === 'abrir') abrir(a.serie);
      else if (a.tipo === 'foco') enfocar(a.campo, true);
      else if (a.tipo === 'corona') corona(a.dir);
      else reabrir();
    };
  });
  useEffect(() => {
    const t = (caso.acciones ?? []).map((x) => setTimeout(() => hacer.current(x.accion), x.en));
    return () => t.forEach(clearTimeout);
  }, [caso]);

  // ── Las caras ───────────────────────────────────────────────────────────
  const sig = plan.pasos[i + 1];
  const cara = esFuerza(paso) && paso.rol === 'trabajo' ? (
    <CaraSerie paso={paso} lecturas={lecturas} arrastrada={cargaArrastrada(plan, i, registro)} luego={textoLuego(plan, i)} />
  ) : paso.rol === 'transicion' && esFuerza(sig) ? (
    <CaraColocate paso={paso} lecturas={lecturas} siguiente={sig} />
  ) : enDescanso ? (
    <DescansoFuerza
      paso={paso}
      lecturas={lecturas}
      viene={textoViene(plan, i, registro)}
      series={series}
      vista={vista}
      abierta={abierta}
      foco={foco}
      pistaCorona={foco && jAbierta >= 0 ? textoPistaCorona(plan, jAbierta, foco, registro) : null}
      onAbrir={abrir}
      onFoco={(c) => enfocar(c)}
      onCorona={corona}
      onResumen={reabrir}
      onMas30={seq.sumar30}
    />
  ) : paso.rol === 'recuperacion' ? (
    <Recupera paso={paso} lecturas={lecturas} zonas={plan.zonas} />
  ) : (
    <PasoCorrer paso={paso} lecturas={lecturas} zonas={plan.zonas} />
  );

  const capa =
    seq.cuenta != null && paso.siguiente ? (
      esFuerza(paso.siguiente) ? (
        <CuentaFuerza n={seq.cuenta} paso={paso.siguiente} arrastrada={cargaArrastrada(plan, i + 1, registro)} />
      ) : (
        <TresDosUno n={seq.cuenta} paso={paso.siguiente} />
      )
    ) : seq.go ? (
      esFuerza(paso) ? (
        <CuentaFuerza n={0} paso={paso} arrastrada={cargaArrastrada(plan, i, registro)} />
      ) : (
        <TresDosUno n={0} paso={paso} />
      )
    ) : null;

  const pSerie: PaginaVivo = { id: 'serie', titulo: 'Serie', contenido: cara };
  // Con un dato encendido la corona es del dato: la pila se queda en una página.
  const paginas: PaginaVivo[] = foco
    ? [pSerie]
    : [
        pSerie,
        { id: 'ejercicios', titulo: 'Ejercicios', contenido: <PaginaEjercicios plan={plan} estado={estado} registro={registro} sim={sim} /> },
        {
          id: 'datos',
          titulo: 'Datos',
          contenido: <PaginaDatosFuerza plan={plan} estado={estado} registro={registro} sim={sim} ppm={lecturas.ppm} zonas={plan.zonas} />,
        },
      ];

  return (
    <Muneca
      paginas={paginas}
      aro={<AroSesion pasos={plan.pasos} i={i} paso={paso} lecturas={lecturas} />}
      tinte={null}
      capa={capa}
      pausado={seq.pausado}
      onPausa={seq.pausar}
      siguiente={{
        etiqueta: 'Siguiente serie',
        icono: 'siguiente',
        onPulsa: seq.cerrar,
        deshacer: { aviso: paso.rol === 'trabajo' ? avisoSerie(paso) : enDescanso ? 'Descanso cortado' : 'Colócate cortado', hacer: seq.deshacer },
      }}
      onTerminar={seq.terminar}
      completada={estado.terminado}
      accion={accion}
      eventos={ev}
      alPaso={paso.id}
      inicial={caso.inicial}
      guion={caso.guion}
      modelo={caso.modelo}
      onLog={onLog}
    />
  );
}
