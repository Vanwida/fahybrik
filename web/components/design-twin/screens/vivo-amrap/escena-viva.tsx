'use client';

// La pantalla en faena. UNA sola vista para los dos instantes en vivo: lo
// único que cambia entre «en faena» y «último minuto» es en qué segundo de la
// ventana entras, y eso es exactamente lo que hay que poder juzgar — que el
// ambiente sube solo, con el mismo código, según aprieta el reloj.
//
// Quién gobierna aquí, y por qué: en un For Time gobierna el trabajo (te queda
// una lista y el reloj es la puntuación), pero en un AMRAP gobierna el RELOJ
// como ambiente y manda LA RONDA como sujeto. El número que quieres a tres
// metros no es el tiempo: es cuántas llevas, porque es lo que decide si aprietas.
// El tiempo lo lees de reojo en el aro, y solo se pone delante cuando te va a
// sacar.

import { useState } from 'react';
import { Label, Mono, SP } from '../../kit';
import { useTicker, useTimeline } from '../../sim';
import { reloj } from '../../datos-reales';
import { ARO_MARGEN, AroVentana } from './aro';
import {
  Destello,
  FilaMovimiento,
  FranjaPulso,
  Golpe,
  TopCromo,
  VentanaReadout,
  type EstadoMovimiento,
} from './atoms';
import {
  ARRANQUE,
  AVISO_FINAL_S,
  MOVIMIENTOS,
  PULSO_MAX_PPM,
  REMATE_FINAL_S,
  SPLITS_GUION_S,
  VENTANA_S,
  cierreGuionS,
  comparaConLaPrimera,
  marcador,
  pulsoEn,
  ventana,
} from './data';
import { Sellado, type RondaCerrada } from './escena-sellado';

/** Dos toques en menos de esto son el mismo toque: la mano va sudada. */
const TOQUE_MINIMO_S = 2;

export interface EscenaVivaProps {
  arranque: keyof typeof ARRANQUE;
  onLog: (linea: string) => void;
}

export function EscenaViva({ arranque, onLog }: EscenaVivaProps) {
  const inicio = ARRANQUE[arranque];

  const [base, setBase] = useState(inicio.transcurridoS);
  const [t, setT] = useState(inicio.transcurridoS);
  const [pausado, setPausado] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [marcados, setMarcados] = useState(inicio.marcados);
  const [destello, setDestello] = useState(0);
  const [inicioRondaS, setInicioRondaS] = useState(cierreGuionS(inicio.rondas));
  const [rondas, setRondas] = useState<RondaCerrada[]>(() =>
    SPLITS_GUION_S.slice(0, inicio.rondas).map((duracionS, i) => ({ indice: i + 1, duracionS })),
  );

  const restanteS = Math.max(0, VENTANA_S - t);
  const tension = restanteS <= AVISO_FINAL_S ? 1 - restanteS / AVISO_FINAL_S : 0;
  const remate = restanteS <= REMATE_FINAL_S;
  const repsMarcadas = MOVIMIENTOS.slice(0, marcados).reduce((n, m) => n + m.dosis, 0);
  const pulsoPpm = pulsoEn(t);

  useTimeline([
    {
      at: 0,
      run: () =>
        onLog(
          `AMRAP ${ventana(VENTANA_S)} · vas por ${marcador(rondas.length, repsMarcadas)}, quedan ${ventana(restanteS)}`,
        ),
    },
  ]);

  useTicker(!pausado && !terminado, (s) => {
    const ahora = Math.min(VENTANA_S, base + s);
    setT(ahora);
    if (ahora >= VENTANA_S) {
      setTerminado(true);
      onLog(`Se acabó la ventana · ${marcador(rondas.length, repsMarcadas)} sobre la mesa`);
    }
  });

  const cerrarRonda = () => {
    if (pausado || terminado) return;
    const duracionS = t - inicioRondaS;
    if (duracionS < TOQUE_MINIMO_S) {
      onLog('Dos toques en el mismo segundo: el segundo no cuenta como ronda');
      return;
    }
    const indice = rondas.length + 1;
    const siguientes = [...rondas, { indice, duracionS }];
    setRondas(siguientes);
    setInicioRondaS(t);
    setMarcados(0);
    setDestello((n) => n + 1);
    const compara = comparaConLaPrimera(
      siguientes.map((r) => r.duracionS),
      siguientes.length - 1,
    );
    onLog(`Ronda ${indice} cerrada en ${reloj(duracionS)}${compara ? ` · ${compara.texto}` : ''}`);
  };

  const marcar = (i: number) => {
    if (pausado || terminado) return;
    if (i + 1 <= marcados) {
      setMarcados(i);
      onLog(`Desmarcado: ${MOVIMIENTOS[i].nombre}`);
      return;
    }
    if (i + 1 >= MOVIMIENTOS.length) {
      // Marcar el último movimiento ES cerrar la ronda: no se pide un toque de
      // más para decir lo que ya has dicho.
      cerrarRonda();
      return;
    }
    setMarcados(i + 1);
    const reps = MOVIMIENTOS.slice(0, i + 1).reduce((n, m) => n + m.dosis, 0);
    onLog(`${MOVIMIENTOS[i].nombre} marcado · llevas ${marcador(rondas.length, reps)}`);
  };

  if (terminado) {
    return (
      <Sellado
        rondas={rondas}
        repsMarcadas={repsMarcadas}
        movimientoEnCurso={marcados < MOVIMIENTOS.length ? MOVIMIENTOS[marcados] : null}
        pulsoMaxPpm={PULSO_MAX_PPM}
        onLog={onLog}
      />
    );
  }

  const compara = comparaConLaPrimera(
    rondas.map((r) => r.duracionS),
    rondas.length - 1,
  );

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <AroVentana fraccion={restanteS / VENTANA_S} tension={tension} />

      <div
        style={{
          position: 'absolute',
          inset: ARO_MARGEN,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.m,
        }}
      >
        <TopCromo
          pausado={pausado}
          ventanaTotal={ventana(VENTANA_S)}
          onPausa={() => {
            setBase(t);
            setPausado((p) => !p);
            onLog(pausado ? 'Sigue el entreno' : 'En pausa · el reloj está parado');
          }}
          onSalir={() => onLog('Mantuviste pulsado para salir · aquí la app pregunta si guardar o descartar')}
        />

        <VentanaReadout
          texto={ventana(restanteS)}
          tamano={remate ? 72 : tension > 0 ? 48 : 34}
          caliente={tension > 0}
          aliento={remate ? 'vacía el depósito' : tension > 0 ? 'un minuto, una más' : null}
        />

        <ZonaRonda
          rondas={rondas.length}
          repsMarcadas={repsMarcadas}
          compara={compara ? { indice: rondas.length, texto: compara.texto, deltaS: compara.deltaS } : null}
          onCerrar={cerrarRonda}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
          {MOVIMIENTOS.map((m, i) => {
            const estado: EstadoMovimiento = i < marcados ? 'hecho' : i === marcados ? 'actual' : 'pendiente';
            return <FilaMovimiento key={m.nombre} movimiento={m} estado={estado} onMarcar={() => marcar(i)} />;
          })}
        </div>

        <FranjaPulso ppm={pulsoPpm} />
      </div>

      {/* El latido va el ÚLTIMO: pintado antes se quedaba debajo de las
          tarjetas y el golpe de luz no se veía justo cuando más falta hace. */}
      {destello > 0 && <Destello key={destello} />}

      {pausado && <CapaPausa onSeguir={() => { setPausado(false); onLog('Sigue el entreno'); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sujeto: la ronda. Y la mitad del lienzo para tocarla.
// ---------------------------------------------------------------------------

function ZonaRonda({
  rondas,
  repsMarcadas,
  compara,
  onCerrar,
}: {
  rondas: number;
  repsMarcadas: number;
  compara: { indice: number; texto: string; deltaS: number } | null;
  onCerrar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCerrar}
      aria-label={`Cerrar la ronda ${rondas + 1}`}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        width: '100%',
        padding: SP.m,
        borderRadius: 20,
        border: '1px solid var(--twin-hairline-strong)',
        background: 'color-mix(in srgb, var(--twin-surface) 70%, transparent)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
      }}
    >
      <Label size={10}>Rondas</Label>
      {/* 144 = dos veces `t-readout-hero`. El sujeto de un AMRAP se lee de pie,
          a tres metros y con el móvil en el suelo; a 72 no llega. */}
      <Golpe key={rondas}>
        <Mono size={144} weight={800} style={{ lineHeight: 1 }}>
          {rondas}
        </Mono>
      </Golpe>

      {repsMarcadas > 0 && (
        <Mono size={22} weight={800} color="var(--twin-accent-text)">
          +{repsMarcadas} reps
        </Mono>
      )}

      {compara && (
        <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', marginTop: 4 }}>
          {`ronda ${compara.indice} · `}
          <span style={{ color: compara.deltaS > 0 ? 'var(--twin-warning)' : 'var(--twin-ok)', fontWeight: 700 }}>
            {compara.texto}
          </span>
        </span>
      )}

      <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)', marginTop: 6 }}>
        toca aquí al cerrar la ronda
      </span>
    </button>
  );
}

function CapaPausa({ onSeguir }: { onSeguir: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--twin-scrim)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.l,
        padding: SP.xl,
      }}
    >
      <Label size={11}>En pausa</Label>
      <span style={{ font: 'italic 800 28px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        El reloj está parado
      </span>
      <button type="button" onClick={onSeguir} className="tw-btn-primary" style={{ width: '100%', height: 64 }}>
        SEGUIR
      </button>
    </div>
  );
}
