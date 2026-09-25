'use client';

// «hoja» — el consentimiento, al acabar el primer entreno grabado en el reloj.
//
// POR QUÉ AQUÍ Y NO EN OTRO SITIO (Alex, 25-09): en el alta el atleta aún no ha
// entrenado con el reloj y no sabe qué se le pregunta; un interruptor suelto en
// Perfil no lo enciende nadie. Al acabar el primer entreno de muñeca, lo que se
// pregunta acaba de pasar — «ha grabado», en pasado — y la respuesta vale para
// todos los siguientes.
//
// CUÁNDO EXACTAMENTE: después del 2xx de GUARDAR, justo antes de que el resumen
// se cierre. Dos razones: (1) preguntar antes taparía el registro en el único
// momento en que el atleta lo quiere mirar; (2) el fichero de movimiento cuelga
// de la ejecución guardada (`SensorFileReceiver.drainPending` solo sube lo que
// tiene `execution_id`), así que antes del 2xx no hay nada que subir todavía.
// Por eso debajo se ve el resumen YA guardado, velado.
//
// LAS DOS SALIDAS PESAN IGUAL DE ALCANZABLES: SUBIRLO relleno y «Ahora no»
// contorneado, los dos a lo ancho y con alto de botón. Un «no» escondido en un
// enlace gris sería arrancar el sí, y un consentimiento arrancado no vale.
// Cerrar la hoja sin elegir (el velo) cuenta como «Ahora no»: sin un sí, nada
// se sube.

import { useState } from 'react';
import { BACK_SQUAT, MEDIDO_SQUAT } from '../../datos-reales';
import { CTA, IconCheckCircle, Pantalla, RAD, SP, SecondaryCTA } from '../../kit';
import { useTimeline } from '../../sim';
import { TarjetaRegistro } from '../post-entreno/propuesta';
import { HOJA, VERSION_CONSENTIMIENTO } from './texto';

/** Lo que tarda la hoja en subir: la de iOS, ni instantánea ni lenta. */
const SUBIDA_MS = 320;
/** Un respiro con el resumen a la vista antes de que suba: primero «Guardado». */
const ESPERA_MS = 450;

type Respuesta = 'subirlo' | 'ahora-no' | 'velo';

/**
 * `applewatch` con ondas a los lados: «el reloj ha notado algo». Va en la tinta
 * del texto sobre un círculo en reposo — el naranja es de lo que se toca, y esto
 * solo dice de qué va la hoja.
 */
function IconRelojMovimiento({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block' }}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.6 6.2 10 3.6h4l.4 2.6M9.6 17.8l.4 2.6h4l.4-2.6" strokeWidth="1.5" />
        <rect x="7.6" y="6.2" width="8.8" height="11.6" rx="2.6" strokeWidth="1.7" />
        <path d="M5.1 9.4a4 4 0 0 0 0 5.2M18.9 9.4a4 4 0 0 1 0 5.2" strokeWidth="1.5" />
        <path d="M2.9 7.6a7 7 0 0 0 0 8.8M21.1 7.6a7 7 0 0 1 0 8.8" strokeWidth="1.5" opacity="0.55" />
      </g>
    </svg>
  );
}

/** El resumen del primer entreno de muñeca, ya guardado: el contexto de la hoja. */
function ResumenGuardado({ onLog }: { onLog: (linea: string) => void }) {
  return (
    <Pantalla
      accion={
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SP.s,
            color: 'var(--twin-ok)',
          }}
        >
          <IconCheckCircle size={18} />
          <span style={{ font: '650 15px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Guardado</span>
        </div>
      }
    >
      <TarjetaRegistro sesion={BACK_SQUAT} medido={MEDIDO_SQUAT} onLog={onLog} encabezado={null} />
    </Pantalla>
  );
}

export function Hoja({ onLog }: { onLog: (linea: string) => void }) {
  const [arriba, setArriba] = useState(false);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  useTimeline([
    {
      at: ESPERA_MS,
      run: () => {
        setArriba(true);
        onLog('Primer entreno grabado en el reloj, guardado (2xx) → sube la hoja, una sola vez');
      },
    },
  ]);

  const responder = (r: Respuesta) => {
    setRespuesta(r);
    setArriba(false);
    if (r === 'subirlo') {
      onLog(
        `SUBIRLO → consentimiento ${VERSION_CONSENTIMIENTO} (\`SensorCaptureConsent.grant\` + \`athletes.sensor_capture_consent_version\`); el movimiento de este entreno ya puede subir`,
      );
    } else {
      onLog(
        `${r === 'velo' ? 'Cerrar sin elegir = «Ahora no»' : '«Ahora no»'} → no se sube nada. No se vuelve a preguntar; se cambia en Perfil › Privacidad`,
      );
    }
  };

  const abierta = arriba && respuesta === null;

  return (
    <>
      <div className="twin-screen-safe">
        <ResumenGuardado onLog={onLog} />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          pointerEvents: abierta ? 'auto' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => responder('velo')}
          aria-label="Cerrar sin elegir"
          tabIndex={abierta ? 0 : -1}
          style={{
            position: 'absolute',
            inset: 0,
            border: 0,
            padding: 0,
            background: 'var(--twin-scrim)',
            cursor: 'pointer',
            opacity: abierta ? 1 : 0,
            transition: `opacity ${SUBIDA_MS}ms ease-out`,
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hoja-muneca-titulo"
          style={{
            position: 'relative',
            maxHeight: `calc(100% - var(--twin-safe-top) - ${SP.xl}px)`,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: 'var(--twin-surface)',
            borderRadius: `${RAD.xl}px ${RAD.xl}px 0 0`,
            borderTop: '1px solid var(--twin-hairline-strong)',
            boxShadow: 'var(--twin-shadow-hero)',
            transform: abierta ? 'translateY(0)' : 'translateY(100%)',
            transition: `transform ${SUBIDA_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: `${SP.s}px 0 0` }}>
            <div aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--twin-hairline-strong)' }} />
          </div>

          <div
            className="twin-scroll"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: SP.m,
              padding: `${SP.l}px ${SP.l + 4}px 0`,
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--twin-surface-elevated)',
                border: '1px solid var(--twin-hairline)',
                color: 'var(--twin-fg)',
                marginBottom: SP.xs,
              }}
            >
              <IconRelojMovimiento />
            </span>
            <h2
              id="hoja-muneca-titulo"
              style={{ margin: 0, font: 'italic 800 24px/1.15 var(--twin-font-sans)', letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}
            >
              {HOJA.titulo}
            </h2>
            <p style={{ margin: 0, font: '400 15px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{HOJA.queYParaQue}</p>
            <p style={{ margin: 0, font: '400 15px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{HOJA.queNoEs}</p>
            <p style={{ margin: 0, font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{HOJA.sinCoste}</p>
          </div>

          <div
            style={{
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: SP.s,
              padding: `${SP.xl}px ${SP.l + 4}px calc(var(--twin-safe-bottom) + ${SP.m}px)`,
            }}
          >
            <CTA title={HOJA.subir} onClick={() => responder('subirlo')} />
            <SecondaryCTA title={HOJA.ahoraNo} height={50} onClick={() => responder('ahora-no')} />
          </div>
        </div>
      </div>
    </>
  );
}
