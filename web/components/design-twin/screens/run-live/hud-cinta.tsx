'use client';

// HUD de cinta — espejo de ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDView.swift
// en su caso MÁS honesto: una cinta BH/i.Concept que NO deja controlar la
// velocidad por Bluetooth (la pones en la consola; la app la registra tal cual)
// pero SÍ la inclinación. El héroe es el ritmo real; el panel de máquina lleva
// el stepper de inclinación y la nota de velocidad manual, palabra por palabra.
//
// Horizontal (#6): el número grande a la izquierda (ritmo real, porque la cinta
// no obedece), controles + métricas compactas a la derecha.

import { useState } from 'react';
import { hrZone, useTicker, useTimeline } from '../../sim';
import {
  BotonNeutro,
  BotonRedondo,
  Celda,
  ChipDispositivo,
  Etiqueta,
  Icono,
  MedidorZona,
  NotaPlana,
  ProgresoObjetivo,
  Tarjeta,
  TarjetaStepper,
} from './atoms';
import {
  CINTA_APRIETA_S,
  CINTA_NOMBRE,
  CINTA_PRIMER_DATO_S,
  CINTA_VELOCIDAD_APRETADA_KMH,
  CINTA_VELOCIDAD_KMH,
  CUENTA_ATRAS_S,
  UMBRAL_BPM,
  INCLINACION_PRESCRITA_PCT,
  OBJETIVO_SKM,
  SEGMENTO_TITULO,
  TRAMOS,
  colorEstado,
  estadoRitmo,
  fmt1,
  fmtDistanciaCinta,
  fmtElapsed,
  palabraEstadoCinta,
  pulsoEn,
} from './data';
import { fraccionTramo, restanteTramo, useTramos } from './engine';

const NOTA_VELOCIDAD_MANUAL =
  'Pon la velocidad en la cinta — tu modelo no la deja controlar por Bluetooth. La inclinación sí.';
const AVISO_SIN_DATOS =
  'Conectada, pero la cinta no envía datos. Ponla en marcha desde la consola — algunas solo emiten con la banda en movimiento.';

/** s/km desde km/h — la conversión del propio HUD. */
function ritmoDesdeKmh(kmh: number): number {
  return Math.round(3600 / kmh);
}

export function HUDCinta({
  horizontal,
  onSalir,
  onLog,
}: {
  horizontal: boolean;
  onSalir: () => void;
  onLog: (l: string) => void;
}) {
  const [countIn, setCountIn] = useState<number>(CUENTA_ATRAS_S);
  const [voz, setVoz] = useState(true);
  const [velocidadKmh, setVelocidadKmh] = useState(0);
  const [inclinacion, setInclinacion] = useState<number>(INCLINACION_PRESCRITA_PCT);
  const [conDatos, setConDatos] = useState(false);

  useTicker(countIn > 0, (s) => setCountIn(Math.max(0, CUENTA_ATRAS_S - s)));
  const corriendo = countIn <= 0;

  // La banda arranca cuando el ATLETA pone velocidad en la consola: hasta el
  // primer dato la telemetría calla (telemetrySilent) y el HUD lo dice honesto.
  useTimeline(
    [
      {
        at: CINTA_PRIMER_DATO_S * 1000,
        run: () => {
          setConDatos(true);
          setVelocidadKmh(CINTA_VELOCIDAD_KMH);
          onLog(`La cinta empieza a emitir · ${fmt1(CINTA_VELOCIDAD_KMH)} km/h`);
        },
      },
      {
        at: CINTA_APRIETA_S * 1000,
        run: () => {
          setVelocidadKmh(CINTA_VELOCIDAD_APRETADA_KMH);
          onLog(`Aprietas la consola · ${fmt1(CINTA_VELOCIDAD_APRETADA_KMH)} km/h`);
        },
      },
    ],
    corriendo,
  );

  const { estado, avanzar } = useTramos({
    corriendo,
    pausado: false,
    parado: !conDatos,
    metrosPorSegundo: (tramo) => (tramo.tipo === 'trabajo' ? (velocidadKmh * 1000) / 3600 : 1.4),
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
  const ritmo = corriendo && conDatos && velocidadKmh > 0 && !enRecuperacion ? ritmoDesdeKmh(velocidadKmh) : null;
  const estadoObj = enRecuperacion ? 'sin-juicio' : estadoRitmo(ritmo);
  const bpm = corriendo && conDatos ? pulsoEn(estado.legS + estado.idx * 60) : null;
  const zona = bpm ? hrZone(bpm, UMBRAL_BPM) : null;
  const cue = palabraEstadoCinta(estadoObj);

  const cabecera = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
      <ChipDispositivo icono="runner" texto={`Cinta · ${CINTA_NOMBRE}`} encendido />
      <ChipDispositivo icono="heart" texto="Pulso · Watch" encendido={bpm !== null} buscando={bpm === null} />
      <span style={{ flex: 1 }} />
      <BotonRedondo
        icono={voz ? 'speaker-on' : 'speaker-off'}
        onClick={() => setVoz((v) => !v)}
        etiqueta={voz ? 'Silenciar avisos de voz' : 'Activar avisos de voz'}
        color={voz ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}
      />
      <BotonRedondo icono="xmark" onClick={onSalir} etiqueta="Cerrar" />
    </div>
  );

  const stepperInclinacion = (
    <TarjetaStepper
      etiqueta="Inclinación"
      valor={fmt1(inclinacion)}
      unidad="%"
      onMenos={() => {
        setInclinacion((v) => Math.max(0, Math.round((v - 0.5) * 10) / 10));
        onLog('Inclinación −0,5 %');
      }}
      onMas={() => {
        setInclinacion((v) => Math.min(15, Math.round((v + 0.5) * 10) / 10));
        onLog('Inclinación +0,5 %');
      }}
    />
  );

  if (countIn > 0) {
    return (
      <div className="twin-screen-safe">
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 12px 10px' }}>
          {cabecera}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Etiqueta texto="Prepárate" size={12} />
            <span className="t-readout-hero" style={{ fontSize: 88, color: 'var(--twin-accent-text)' }}>{countIn}</span>
            <span style={{ font: '400 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
              Colócate en la banda y agárrate. Empezará suave y subirá a tu ritmo.
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (horizontal) {
    return (
      <div className="twin-screen-safe">
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 12px 8px' }}>
          {cabecera}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
              <span style={{ font: 'italic 800 12px/1.2 var(--twin-font-sans)', letterSpacing: '0.03em', color: 'var(--twin-accent-text)' }}>
                Tramo {estado.idx + 1} de {TRAMOS.length} — objetivo {fmtElapsed(OBJETIVO_SKM).replace(/^0/, '')} /km
              </span>
              <span className="t-readout-hero" style={{ fontSize: 100, color: colorEstado(estadoObj) }}>
                {ritmo ? fmtElapsed(ritmo).replace(/^0/, '') : '—:—'}
              </span>
              <span style={{ font: '600 11px/1 var(--twin-font-mono)', letterSpacing: '0.07em', color: 'var(--twin-muted)' }}>
                /km · ritmo real
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stepperInclinacion}
              <NotaPlana icono="speedometer">{NOTA_VELOCIDAD_MANUAL}</NotaPlana>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Celda etiqueta="Metros" valor={fmtDistanciaCinta(estado.legM)} />
                <Celda etiqueta="Tiempo" valor={fmtElapsed(estado.legS).replace(/^0/, '')} />
                <Celda etiqueta="Pulso" valor={bpm ? `${bpm}` : '—'} unidad="bpm" color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'} />
              </div>
              <BotonNeutro titulo="TERMINAR TRAMO" onClick={avanzar} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="twin-screen-safe">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 12px 10px' }}>
        {cabecera}
        <div className="twin-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2 }}>
            <span style={{ font: 'italic 800 12px/1 var(--twin-font-sans)', letterSpacing: '0.05em', color: 'var(--twin-accent-text)' }}>
              Tramo {estado.idx + 1} de {TRAMOS.length}
            </span>
            <span style={{ font: '600 17px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {enRecuperacion ? 'Recuperación' : SEGMENTO_TITULO}
            </span>
          </div>

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
                <Etiqueta texto="Ritmo" size={10} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="t-readout-hero" style={{ fontSize: 60, color: colorEstado(estadoObj) }}>
                    {ritmo ? fmtElapsed(ritmo).replace(/^0/, '') : '—:—'}
                  </span>
                  <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>/km</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: '600 13px/1 var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
                    Objetivo {fmtElapsed(OBJETIVO_SKM).replace(/^0/, '')} /km
                  </span>
                  {cue && (
                    <span
                      style={{
                        font: 'italic 800 10px/1 var(--twin-font-sans)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: colorEstado(estadoObj),
                      }}
                    >
                      {cue}
                    </span>
                  )}
                </div>
              </div>
            </Tarjeta>
          )}

          {!conDatos && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: 10,
                borderRadius: 10,
                color: 'var(--twin-fg)',
                background: 'color-mix(in srgb, var(--twin-warning) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--twin-warning) 40%, transparent)',
              }}
            >
              <span style={{ color: 'var(--twin-warning)', flex: '0 0 auto', marginTop: 1 }}>
                <Icono nombre="wifi-alert" size={13} />
              </span>
              <span style={{ font: '500 12px/1.35 var(--twin-font-sans)' }}>{AVISO_SIN_DATOS}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>{stepperInclinacion}</div>
          <NotaPlana icono="speedometer">{NOTA_VELOCIDAD_MANUAL}</NotaPlana>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Celda etiqueta="Pulso" valor={bpm ? `${bpm}` : '—'} unidad="bpm" color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'} />
            {zona ? (
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Etiqueta texto="Zona" />
                  <MedidorZona zona={zona} />
                </div>
              </div>
            ) : (
              <Celda etiqueta="Zona" valor="—" />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Celda etiqueta="Velocidad" valor={conDatos ? fmt1(velocidadKmh) : '—'} unidad="km/h" />
            <Celda etiqueta="Inclinación" valor={fmt1(inclinacion)} unidad="%" />
            <Celda etiqueta="Tiempo" valor={fmtElapsed(estado.legS).replace(/^0/, '')} />
          </div>

          {!enRecuperacion && (
            <ProgresoObjetivo
              caption="Distancia del tramo"
              primary={fmtDistanciaCinta(estado.legM)}
              secondary={fmtDistanciaCinta(tramo.metros ?? 0)}
              fraction={fraccionTramo(tramo, estado)}
              complete={fraccionTramo(tramo, estado) >= 1}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
          <BotonNeutro titulo="TERMINAR TRAMO" onClick={avanzar} />
        </div>
      </div>
    </div>
  );
}
