'use client';

// Las pantallas en vivo del reloj — espejo de ContinuousLiveView.swift,
// SetTableLiveView.swift, RestBannerView.swift y SplitsView.swift.
//
// El continuo tiene DOS presentaciones honestas: sin distancia medida, el héroe
// es el TIEMPO sobre la barra de zonas teñida (la pantalla tiñe la zona, sin
// leer números); en cuanto el GPS da metros, el héroe pasa a ser el ritmo /km.

import { useState } from 'react';
import { useTicker } from '../../sim';
import {
  BigTapButton,
  GiantNumber,
  LiveScaffold,
  MetricTile,
  SetDots,
  StatusHeader,
  VStack,
  WatchCanvas,
  WatchLabel,
} from './atoms';
import { FUERZA, GPS_FIX_S, PARCIALES, ZONA_OBJETIVO, estadoCarrera } from './data';
import { clock, countdown, distanceValue, kg, pace } from './format';
import { HEAVY, SEMIBOLD, W, zoneColor } from './theme';

// ---------------------------------------------------------------------------
// Continuo (carrera Z3)
// ---------------------------------------------------------------------------

export function ContinuousLive({ onLog }: { onLog: (l: string) => void }) {
  const [t, setT] = useState(0);
  useTicker(true, (s) => {
    setT(s);
    if (s === GPS_FIX_S) onLog('El GPS ya da distancia → el héroe pasa a ritmo');
  });
  const st = estadoCarrera(t, ZONA_OBJETIVO);
  const status = `Correr · Z${ZONA_OBJETIVO}`;

  if (st.distanciaM !== null && st.ritmoSecKm !== null) {
    return (
      <LiveScaffold
        status={status}
        hero={
          <VStack gap={4}>
            <WatchLabel text="Ritmo" />
            <GiantNumber text={pace(st.ritmoSecKm)} size={54} unit="/km" />
            <div style={{ display: 'flex', gap: 6, alignSelf: 'stretch' }}>
              <MetricTile label="Dist" value={distanceValue(st.distanciaM)} unit={st.distanciaM >= 1000 ? 'km' : 'm'} />
              <MetricTile label="FC" value={`${st.bpm}`} />
            </div>
          </VStack>
        }
      />
    );
  }

  const enZona = st.zona === ZONA_OBJETIVO;
  return (
    <LiveScaffold
      status={status}
      hero={
        <VStack gap={10}>
          <VStack gap={2}>
            <WatchLabel text="Tiempo" />
            <GiantNumber text={clock(t)} size={54} />
          </VStack>
          <ZoneBar viva={st.zona} objetivo={ZONA_OBJETIVO} bpm={st.bpm} pct={st.pctEnZona} />
          <span style={{ fontSize: 11, fontWeight: HEAVY, color: enZona ? W.zoneGreen : W.zoneAmber }}>
            {enZona ? 'EN ZONA ✓' : 'FUERA DE ZONA'}
          </span>
        </VStack>
      }
    />
  );
}

/** La barra de 5 zonas: la viva a plena luz, el resto apagado, y la muesca del objetivo. */
function ZoneBar({ viva, objetivo, bpm, pct }: { viva: 1 | 2 | 3 | 4 | 5; objetivo: number; bpm: number; pct: number | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignSelf: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <WatchLabel text={pct === null ? 'EN ZONA —' : `EN ZONA ${pct}%`} />
        <WatchLabel text={`FC ${bpm}`} />
      </div>
      <div style={{ position: 'relative', height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
        {([1, 2, 3, 4, 5] as const).map((z) => (
          <div key={z} style={{ flex: 1, background: zoneColor(z), opacity: z === viva ? 1 : 0.34 }} />
        ))}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 3,
            background: W.ink,
            left: `calc(${((objetivo - 0.5) / 5) * 100}% - 1.5px)`,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fuerza por series (5×5) + descanso
// ---------------------------------------------------------------------------

export function SetTableLive({ onLog }: { onLog: (l: string) => void }) {
  const [serie, setSerie] = useState(0);
  const [descansando, setDescansando] = useState(false);
  const [restante, setRestante] = useState<number>(FUERZA.descansoS);

  useTicker(descansando, (s) => {
    const queda = FUERZA.descansoS - s;
    setRestante(Math.max(0, queda));
    if (queda <= 0) {
      setDescansando(false);
      setRestante(FUERZA.descansoS);
      onLog('Descanso terminado — háptico de salida');
    }
  });

  if (descansando) {
    return (
      <WatchCanvas background={W.restBg}>
        <div
          style={{
            boxSizing: 'border-box',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
          }}
        >
          <StatusHeader text="Descanso" color={W.zoneGreen} />
          <div style={{ flex: 1 }} />
          <WatchLabel text="Vuelve en" color="rgba(47,209,79,0.85)" />
          <GiantNumber text={countdown(restante)} size={80} color={W.zoneGreen} />
          <div style={{ flex: 1 }} />
          <VStack gap={1} style={{ paddingBottom: 8 }}>
            <WatchLabel text="Luego" />
            <span style={{ fontSize: 15, fontWeight: HEAVY, color: W.ink }}>{FUERZA.ejercicio}</span>
          </VStack>
        </div>
      </WatchCanvas>
    );
  }

  return (
    <LiveScaffold
      status={`Fuerza · Serie ${Math.min(serie + 1, FUERZA.series)} / ${FUERZA.series}`}
      hero={
        <VStack gap={5}>
          <WatchLabel text="Objetivo" />
          <GiantNumber text={kg(FUERZA.cargaKg)} size={42} unit="kg" />
          <span style={{ fontSize: 13, fontWeight: HEAVY, color: W.orangeSoft }}>
            {FUERZA.reps} reps · RIR {FUERZA.rir}
          </span>
          <div style={{ paddingTop: 2 }}>
            <SetDots total={FUERZA.series} currentIndex={serie} doneCount={serie} />
          </div>
        </VStack>
      }
      bottom={
        <BigTapButton
          title="Serie hecha"
          kind="green"
          onClick={() => {
            const hecha = serie + 1;
            onLog(`Serie ${hecha} hecha`);
            if (hecha < FUERZA.series) {
              setSerie(hecha);
              setDescansando(true);
              setRestante(FUERZA.descansoS);
              onLog(`Descanso ${FUERZA.descansoS} s`);
            } else {
              onLog('Última serie → siguiente bloque');
              setSerie(0);
            }
          }}
        />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Splits post-entreno
// ---------------------------------------------------------------------------

export function Splits() {
  const mejor = Math.min(...PARCIALES.map((p) => p.segundos));
  return (
    <WatchCanvas>
      <div className="twin-scroll" style={{ boxSizing: 'border-box', height: '100%', padding: '8px 12px' }}>
        <div style={{ paddingBottom: 6 }}>
          <StatusHeader text="Splits" color={W.dim} />
        </div>
        {PARCIALES.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              borderBottom: `1px solid ${W.surfaceRaised}`,
            }}
          >
            <span style={{ width: 26, fontSize: 12, fontWeight: HEAVY, fontVariantNumeric: 'tabular-nums', color: W.dim }}>
              R{i + 1}
            </span>
            <span style={{ fontSize: 12, fontWeight: SEMIBOLD, color: W.dim }}>{p.titulo}</span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: HEAVY,
                fontVariantNumeric: 'tabular-nums',
                color: p.segundos === mejor ? W.orangeSoft : W.ink,
              }}
            >
              {clock(p.segundos)}
            </span>
          </div>
        ))}
      </div>
    </WatchCanvas>
  );
}
