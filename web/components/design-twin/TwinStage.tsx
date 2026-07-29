'use client';

// El escenario del doble: marco + pantalla + panel de dirección.
//
// Aquí vive TODO el estado de visualización (escenario activo, orientación,
// apariencia, pantalla completa, cronología). Cambiar de escenario o pulsar
// «reproducir de nuevo» REMONTA la pantalla (key), así cada guion corre
// determinista desde cero. En pantalla completa dentro de un móvil real, la
// orientación sigue al dispositivo físico: giras el iPhone y el doble gira
// contigo, como la app.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { SimPanel } from './SimPanel';
import { getScreen } from './registry';
import type { TwinAppearance, TwinOrientation, TwinVista } from './types';

export interface LogLine {
  t: number; // ms desde el arranque del escenario
  linea: string;
}

export function TwinStage({ screenId, localePrefix }: { screenId: string; localePrefix: string }) {
  const mod = getScreen(screenId);

  const [escenario, setEscenario] = useState(mod?.escenarios[0]?.id ?? '');
  const [runId, setRunId] = useState(0);
  const [orientation, setOrientation] = useState<TwinOrientation>('portrait');
  const [appearance, setAppearance] = useState<TwinAppearance>('dark');
  // Antes / después. Arranca en la propuesta: el doble enseña a dónde vamos, y
  // «hoy» es la prueba de por qué. Las pantallas sin `composicion` no lo usan.
  const [vista, setVista] = useState<TwinVista>('propuesta');
  const [fullscreen, setFullscreen] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  // El cero de la cronología. 0 = «sin fijar»: el PRIMER log de la reproducción
  // lo sella (los efectos del hijo corren antes que los del padre, así que un
  // efecto aquí llegaría tarde y el primer log saldría con la época Unix).
  // Cambiar de escenario o repetir lo devuelve a 0 desde el propio handler.
  const runStart = useRef(0);

  const onLog = useCallback((linea: string) => {
    if (runStart.current === 0) runStart.current = Date.now();
    setLogs((prev) => [...prev.slice(-99), { t: Date.now() - runStart.current, linea }]);
  }, []);

  const replay = useCallback(() => {
    runStart.current = 0;
    setLogs([]);
    setRunId((r) => r + 1);
  }, []);

  const pickEscenario = useCallback((id: string) => {
    runStart.current = 0;
    setLogs([]);
    setEscenario(id);
    setRunId((r) => r + 1);
  }, []);

  // Pantalla completa: la orientación obedece al dispositivo físico real.
  useEffect(() => {
    if (!fullscreen || !mod?.meta.soportaHorizontal) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const apply = () => setOrientation(mq.matches ? 'landscape' : 'portrait');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [fullscreen, mod?.meta.soportaHorizontal]);

  // ESC sale de pantalla completa (escritorio).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (!mod) {
    return (
      <div className="studio-missing">
        <p>Esta pantalla no existe en el doble.</p>
        <Link href={`${localePrefix}/design`}>← Volver al índice</Link>
      </div>
    );
  }

  const { meta, escenarios, Screen } = mod;
  // Sin ficha de composición no hay antes/después que enseñar: la pantalla
  // recibe siempre 'propuesta' y el panel no ofrece el conmutador.
  const vistaActiva: TwinVista = meta.composicion ? vista : 'propuesta';
  const screenEl = (
    <Screen
      key={`${escenario}:${vistaActiva}:${runId}`}
      orientation={orientation}
      appearance={appearance}
      escenario={escenario}
      vista={vistaActiva}
      onLog={onLog}
    />
  );

  if (fullscreen) {
    return (
      <>
        <DeviceFrame device={meta.dispositivo} orientation={orientation} appearance={appearance} bare>
          {screenEl}
        </DeviceFrame>
        <button
          type="button"
          className="studio-fullscreen-exit"
          onClick={() => setFullscreen(false)}
          aria-label="Salir de pantalla completa"
        >
          ✕
        </button>
      </>
    );
  }

  return (
    <div className="studio-stage-wrap">
      <div className="studio-stage">
        <DeviceFrame device={meta.dispositivo} orientation={orientation} appearance={appearance}>
          {screenEl}
        </DeviceFrame>
      </div>
      <SimPanel
        meta={meta}
        escenarios={escenarios}
        escenarioActivo={escenario}
        onEscenario={pickEscenario}
        onReplay={replay}
        orientation={orientation}
        onOrientation={setOrientation}
        appearance={appearance}
        onAppearance={setAppearance}
        vista={vistaActiva}
        onVista={setVista}
        onFullscreen={() => setFullscreen(true)}
        logs={logs}
        indexHref={`${localePrefix}/design`}
      />
    </div>
  );
}
