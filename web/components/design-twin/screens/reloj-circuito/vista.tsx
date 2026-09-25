'use client';

// EL VIVO DEL CIRCUITO — montado a mano con el kit (`useEventos` + el motor +
// `<Muneca>`), porque `VivoDePlan` fija sus cuatro páginas y el circuito
// recorre otras tres con la corona: Paso → Ruta → Datos (Para el kit: que
// `VivoDePlan` acepte sus páginas).

import { useEffect, useMemo, useRef } from 'react';
import { AroSesion, Muneca, tinteDelPaso, useEventos, type AccionPrimaria, type PasoBase } from '../../kit-reloj';
import type { CasoCircuito } from './casos';
import { DescansoCircuito, CapaCuenta, CapaEntras } from './capas';
import { caraDelPaso } from './caras';
import { useCircuito } from './motor';
import { PaginaDatosCircuito, PaginaRuta } from './paginas';
import { accionDe, avisoDe } from './texto';

export function VivoCircuito({ caso, onLog }: { caso: CasoCircuito; onLog: (linea: string) => void }) {
  const { c, sim, inicio } = caso;
  const ev = useEventos(onLog);
  const m = useCircuito(c, sim, inicio, ev);
  const { paso, lecturas, e, total } = m;
  const zonas = c.plan.zonas;

  // El atleta simulado girando la corona en el AMRAP (el guion del escenario).
  const ultimo = useRef(m);
  useEffect(() => {
    ultimo.current = m;
  });
  useEffect(() => {
    const t = (caso.corona ?? []).map((x) =>
      setTimeout(() => {
        const v = ultimo.current.sumarReps(x.n);
        onLog(`Corona +${x.n} → ${v} reps (las dices tú)`);
      }, x.en),
    );
    return () => t.forEach(clearTimeout);
    // El guion es fijo por montaje (cada escenario remonta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El aro reparte el perímetro con la ESTIMACIÓN de cada paso (no se pinta como tiempo).
  const pasosDibujo = useMemo<PasoBase[]>(
    () => c.plan.pasos.map((p, k) => ({ ...p, medida: { tipo: 'tiempo', prescrito: c.dibujoS[k] ?? 60, mide: 'reloj' } })),
    [c],
  );

  const reps = e.reps[e.s.i] ?? 0;
  const onCorona = (d: 1 | -1) => {
    const v = m.sumarReps(d);
    onLog(`Corona ${d > 0 ? '+1' : '−1'} → ${v} reps`);
  };
  const cara =
    paso.rol === 'descanso' ? (
      <DescansoCircuito paso={paso} lecturas={lecturas} c={c} onMas30={m.sumar30} />
    ) : (
      caraDelPaso({ paso, lecturas, zonas, c, total, reps, onCorona })
    );

  const capa =
    m.cuenta != null && paso.siguiente ? (
      <CapaCuenta n={m.cuenta} paso={paso.siguiente} c={c} />
    ) : m.go ? (
      <CapaCuenta n={0} paso={paso} c={c} />
    ) : m.entras ? (
      <CapaEntras paso={paso} c={c} />
    ) : null;

  const deshacer = { aviso: avisoDe(paso, c), hacer: m.deshacer };
  const accion: AccionPrimaria | null = e.s.terminado ? null : { etiqueta: accionDe(paso), hacer: m.cerrar, deshacer };

  return (
    <Muneca
      paginas={[
        { id: 'paso', titulo: 'Paso', contenido: cara },
        { id: 'ruta', titulo: 'Ruta', contenido: <PaginaRuta c={c} e={e} /> },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatosCircuito c={c} e={e} total={total} lecturas={lecturas} zonas={zonas} /> },
      ]}
      aro={<AroSesion pasos={pasosDibujo} i={e.s.i} paso={paso} lecturas={lecturas} />}
      tinte={tinteDelPaso(paso, lecturas, zonas)}
      capa={capa}
      pausado={m.pausado}
      onPausa={m.pausar}
      siguiente={{ etiqueta: 'Siguiente paso', icono: 'siguiente', onPulsa: m.cerrar, deshacer }}
      onTerminar={m.terminar}
      completada={e.s.terminado}
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
