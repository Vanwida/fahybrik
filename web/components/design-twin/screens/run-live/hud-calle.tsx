'use client';

// HUD de calle — espejo de ios/FAHYBRIK/Workout/Outdoor/OutdoorRunHUDView.swift:
// cabecera AL AIRE LIBRE, mapa vivo (38 % del alto), y debajo cuenta atrás o el
// HUD (tramo → héroe de ritmo/recuperación → celdas → objetivo del tramo →
// referencia → autopausa) con PAUSA y TRAMO HECHO clavados abajo. La app no
// tiene disposición horizontal propia aquí: girada, la misma columna centrada.

import { useState } from 'react';
import { hrZone, useTicker, useTimeline } from '../../sim';
import {
  BotonNeutro,
  BotonRedondo,
  Celda,
  Etiqueta,
  Icono,
  MedidorZona,
  ProgresoObjetivo,
  Tarjeta,
} from './atoms';
import { tramoPt } from '@fahybrid/shared/domain/landscape-tramo';
import {
  AUTOPAUSA,
  CADENCIA_PRESCRITA_PPM,
  CUENTA_ATRAS_S,
  ETIQUETA_GPS,
  UMBRAL_BPM,
  INCLINACION_PRESCRITA_PCT,
  SEGMENTO_TITULO,
  SIN_PULSO_MOTIVO_CALLE,
  TRAMOS,
  colorEstado,
  estadoRitmo,
  fmtDistancia,
  fmtDistanciaCubierta,
  fmtElapsed,
  guionCalle,
  objetivoLabel,
  palabraEstadoCalle,
  pulsoEn,
  ritmoCalleSkm,
  sinRitmo,
  type CalidadGPS,
} from './data';
import { fraccionTramo, restanteTramo, useTramos } from './engine';
import { MapaRuta } from './route-map';

export function HUDCalle({
  horizontal,
  escenario,
  onSalir,
  onLog,
}: {
  horizontal: boolean;
  escenario: string;
  onSalir: () => void;
  onLog: (l: string) => void;
}) {
  const guion = guionCalle(escenario);

  const [countIn, setCountIn] = useState<number>(CUENTA_ATRAS_S);
  const [calidad, setCalidad] = useState<CalidadGPS>('buscando');
  const [voz, setVoz] = useState(true);
  const [pausaManual, setPausaManual] = useState(false);
  const [parado, setParado] = useState(false);
  const [autoPausada, setAutoPausada] = useState(false);

  useTicker(countIn > 0, (s) => setCountIn(Math.max(0, CUENTA_ATRAS_S - s)));
  const corriendo = countIn <= 0;

  useTimeline([
    { at: guion.fixS * 1000, run: () => { setCalidad(guion.fixS === guion.fuerteS ? 'fuerte' : 'debil'); onLog('GPS fijado'); } },
    ...(guion.fixS !== guion.fuerteS
      ? [{ at: guion.fuerteS * 1000, run: () => { setCalidad('fuerte'); onLog('GPS fuerte'); } }]
      : []),
  ]);

  // El semáforo: te paras → 3 s después engancha la autopausa; arrancas →
  // 1,5 s después suelta (RunAutoPause).
  useTimeline(
    [
      { at: AUTOPAUSA.paraS * 1000, run: () => { setParado(true); onLog('Te paras (semáforo)'); } },
      { at: AUTOPAUSA.enganchaS * 1000, run: () => { setAutoPausada(true); onLog('Auto-pausa · sin movimiento'); } },
      { at: AUTOPAUSA.arrancaS * 1000, run: () => setParado(false) },
      { at: AUTOPAUSA.sueltaS * 1000, run: () => { setAutoPausada(false); onLog('Se reanuda solo'); } },
    ],
    guion.autopausa && corriendo,
  );

  const conFix = calidad !== 'buscando';
  const { estado, avanzar } = useTramos({
    corriendo,
    pausado: pausaManual || autoPausada,
    parado: parado || !conFix,
    // El callback corre en el tick, cuando `estado` (declarado justo abajo) ya
    // existe; usa el ritmo del segundo vivo del tramo.
    metrosPorSegundo: (tramo) =>
      tramo.tipo === 'trabajo' ? 1000 / ritmoCalleSkm(estado.legS) : 1.7,
    onTramo: (idx, motivo) => {
      const tramo = TRAMOS[idx];
      onLog(
        tramo.tipo === 'recuperacion'
          ? `Serie hecha${motivo === 'manual' ? ' (a mano)' : ''} → recuperación 2:00`
          : `Recuperación hecha → serie ${Math.floor(idx / 2) + 1}`,
      );
    },
    onParcial: (m) => onLog(`Parcial: ${m} m`),
  });
  const tramo = TRAMOS[estado.idx];
  const enRecuperacion = tramo.tipo === 'recuperacion';
  const ritmo = corriendo && conFix && !enRecuperacion && !parado ? ritmoCalleSkm(estado.legS) : null;
  const estadoObj = enRecuperacion ? 'sin-juicio' : estadoRitmo(ritmo);
  const bpm = corriendo ? pulsoEn(estado.legS + estado.idx * 60) : null;
  const zona = bpm ? hrZone(bpm, UMBRAL_BPM) : null;
  // Sin ritmo medido el sujeto degrada al objetivo (OutdoorRunHUDModel.lecturaViva).
  const sinRitmoCalle = sinRitmo(estado.legS);

  const cuerpo = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '8px 12px 10px',
        maxWidth: horizontal ? 560 : undefined,
        margin: horizontal ? '0 auto' : undefined,
        width: '100%',
      }}
    >
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
        <span style={{ color: 'var(--twin-accent-text)' }}>
          <Icono nombre="runner" size={13} />
        </span>
        <span style={{ font: 'italic 800 13px/1 var(--twin-font-sans)', letterSpacing: '0.06em', color: 'var(--twin-fg)' }}>
          AL AIRE LIBRE
        </span>
        <span style={{ flex: 1 }} />
        <BotonRedondo
          icono={voz ? 'speaker-on' : 'speaker-off'}
          onClick={() => setVoz((v) => !v)}
          etiqueta={voz ? 'Silenciar avisos de voz' : 'Activar avisos de voz'}
          color={voz ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}
        />
        <BotonRedondo icono="xmark" onClick={onSalir} etiqueta="Salir del entreno" />
      </div>

      <MapaRuta metros={estado.segM} calidad={calidad} pausado={autoPausada || pausaManual} alto={horizontal ? 120 : 250} />

      {countIn > 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Etiqueta texto="Prepárate" size={12} />
          <span className="t-readout-hero" style={{ fontSize: 88, color: 'var(--twin-accent-text)' }}>
            {countIn}
          </span>
          <span style={{ font: '400 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>Empieza la carrera</span>
        </div>
      ) : (
        <>
          <div className="twin-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Tramo N de M + título */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2 }}>
              <span
                style={{
                  font: `italic 800 ${tramoPt(horizontal, 'identity')}px/1.2 var(--twin-font-sans)`,
                  letterSpacing: '0.05em',
                  color: 'var(--twin-accent-text)',
                }}
              >
                Tramo {estado.idx + 1} de {TRAMOS.length}
              </span>
              <span
                style={{
                  font: `600 ${tramoPt(horizontal, 'title')}px/1.2 var(--twin-font-sans)`,
                  color: 'var(--twin-fg)',
                }}
              >
                {enRecuperacion ? 'Recuperación' : SEGMENTO_TITULO}
              </span>
            </div>

            {/* Héroe: ritmo GPS o cuenta atrás de recuperación */}
            {enRecuperacion ? (
              <Tarjeta padding={16} topAccent elevated>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Etiqueta texto="Recuperación" size={10} />
                  <span className="t-readout-hero" style={{ fontSize: 64 }}>
                    {fmtElapsed(restanteTramo(tramo, estado)).replace(/^0/, '')}
                  </span>
                </div>
              </Tarjeta>
            ) : (
              <Tarjeta
                padding={16}
                topAccent
                elevated
                style={{
                  outline: estadoObj === 'sin-juicio' ? 'none' : `2px solid color-mix(in srgb, ${colorEstado(estadoObj)} 75%, transparent)`,
                  outlineOffset: -1,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Etiqueta texto={ritmo !== null ? 'Ritmo GPS' : sinRitmoCalle.etiqueta} size={10} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="t-readout-hero" style={{ fontSize: 60, color: colorEstado(estadoObj) }}>
                      {ritmo !== null ? fmtElapsed(ritmo).replace(/^0/, '') : sinRitmoCalle.cifra}
                    </span>
                    {ritmo !== null && <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>/km</span>}
                  </div>
                  {ritmo !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ font: '600 13px/1 var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
                        Objetivo {objetivoLabel()}
                      </span>
                      {palabraEstadoCalle(estadoObj) && (
                        <span
                          style={{
                            font: 'italic 800 10px/1 var(--twin-font-sans)',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: colorEstado(estadoObj),
                          }}
                        >
                          {palabraEstadoCalle(estadoObj)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                      {ETIQUETA_GPS[calidad]}
                    </span>
                  )}
                </div>
              </Tarjeta>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {/* La distancia CUBIERTA lleva sus dos decimales (`Formato.distanciaCubierta`):
                  en una medida los ceros son el dato. La dosis del tramo, abajo, va con uno. */}
              <Celda etiqueta="Distancia" valor={fmtDistanciaCubierta(estado.segM)} />
              <Celda etiqueta="Tiempo" valor={fmtElapsed(estado.legS)} />
              <Celda
                etiqueta="Pulso"
                valor={bpm !== null ? `${bpm}` : null}
                unidad="bpm"
                color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'}
                ausente={SIN_PULSO_MOTIVO_CALLE}
              />
            </div>

            {zona && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Etiqueta texto="Zona" />
                    <MedidorZona zona={zona} />
                  </div>
                </div>
              </div>
            )}

            {!enRecuperacion && (
              <ProgresoObjetivo
                caption="Distancia del tramo"
                primary={fmtDistancia(estado.legM)}
                secondary={fmtDistancia(tramo.metros ?? 0)}
                fraction={fraccionTramo(tramo, estado)}
                complete={fraccionTramo(tramo, estado) >= 1}
              />
            )}

            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
              Inclinación {INCLINACION_PRESCRITA_PCT}% · Cadencia {CADENCIA_PRESCRITA_PPM} ppm
            </span>

            {autoPausada && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 10,
                  color: 'var(--twin-warning)',
                  background: 'color-mix(in srgb, var(--twin-warning) 14%, transparent)',
                }}
              >
                <Icono nombre="pause-circle" size={16} />
                <span style={{ font: 'italic 800 13px/1 var(--twin-font-sans)', letterSpacing: '0.03em' }}>
                  Auto-pausa · sin movimiento
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ font: '500 11px/1 var(--twin-font-sans)' }}>Se reanuda solo</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
            <BotonNeutro
              titulo={pausaManual ? 'REANUDAR' : 'PAUSA'}
              onClick={() => {
                setPausaManual((p) => !p);
                onLog(pausaManual ? 'Reanudado' : 'Pausa manual');
              }}
            />
            <BotonNeutro titulo="TRAMO HECHO" onClick={avanzar} />
          </div>
        </>
      )}
    </div>
  );

  return <div className="twin-screen-safe">{cuerpo}</div>;
}
