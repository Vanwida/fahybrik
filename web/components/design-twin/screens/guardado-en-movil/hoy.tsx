'use client';

// «hoy» — lo que ve hoy el atleta cuando el servidor rechaza su entreno.
//
// Es la vista «hoy» de `post-entreno` (la pantalla que de verdad pinta
// PostWorkoutSummaryView.summaryContent), con el botón que deja un `.rejected`:
// `saveFailed = true` y `retryFromQueue = false`, así que el título pasa a
// REINTENTAR y el toque hace OTRO envío nuevo. Un 4xx no es pasajero: vuelve el
// mismo rechazo, el botón vuelve a REINTENTAR y así para siempre. La pantalla
// no tiene ✕ ni gesto de cerrar: la única salida del resumen es un 2xx
// (`finishAfterSave`), que no va a llegar. Matar la app es lo que queda.
//
// Desde el 25-09 el entreno ya no se pierde por el camino (la cola lo guarda en
// `rejected` y el reloj conserva su copia); lo que falta es esta pantalla.

import { useEffect, useState } from 'react';
import { CTA } from '../../kit';
import { Anotacion } from '../../kit-composicion/estados';
import { Hoy as ResumenDeHoy } from '../post-entreno/hoy';
import { RECHAZADO } from './datos';

/** Lo que tarda el reintento en volver con el mismo 4xx. */
const VUELTA_MS = 900;

function ReintentarSinSalida({ onLog }: { onLog: (linea: string) => void }) {
  const [intentos, setIntentos] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // Cada toque es su propio viaje de ida y vuelta: el escenario no se remonta
  // entre toques, así que el temporizador cuelga de `enviando`.
  useEffect(() => {
    if (!enviando) return;
    const t = setTimeout(() => {
      setEnviando(false);
      setIntentos((n) => n + 1);
    }, VUELTA_MS);
    return () => clearTimeout(t);
  }, [enviando]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Anotacion>
        {intentos === 0
          ? 'Un 4xx no se arregla reintentando — y no hay otra salida'
          : `${intentos} ${intentos === 1 ? 'reintento' : 'reintentos'} · el mismo rechazo · sin salida`}
      </Anotacion>
      <CTA
        title={enviando ? 'GUARDANDO…' : 'REINTENTAR'}
        height={46}
        style={enviando ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
        onClick={() => {
          setEnviando(true);
          onLog(`REINTENTAR → otro envío igual (intento ${intentos + 1}) → 4xx otra vez. Vuelve a REINTENTAR.`);
        }}
      />
    </div>
  );
}

export function Hoy({ onLog }: { onLog: (linea: string) => void }) {
  return (
    <ResumenDeHoy
      sesion={RECHAZADO.sesion}
      medido={RECHAZADO.medido}
      onLog={onLog}
      accion={<ReintentarSinSalida onLog={onLog} />}
    />
  );
}
