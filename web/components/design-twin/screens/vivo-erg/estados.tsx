'use client';

// Los estados del tramo en los que el sujeto NO es una medida del monitor.
//
// Los tres existen en la app shipeada y los tres tienen su propio sujeto, que es
// justo lo que impide que la pantalla enseñe un readout fingiendo leer algo:
//
//   cuenta       → la cuenta. Estás sentado con las manos en la maneta y el
//                  único número que existe es ese.
//   armado       → la orden y el crono retenido: «empieza al remar».
//   sin monitor  → la PRESCRIPCIÓN. Sigue siendo verdad aunque no haya nada
//                  que la mida, y los metros que llegaste a hacer se quedan.

import { Card, Label, Mono, SP } from '../../kit';
import { Aviso, Sujeto } from './atomos';
import { MAQUINA_NOMBRE, MEDIDA_UNIDAD, type Maquina, objetivoTexto } from './data';
import type { EstadoErg } from './motor';

/** El 3-2-1 se come la pantalla mientras corre. */
export function CuentaAtras({ e, landscape = false }: { e: EstadoErg; landscape?: boolean }) {
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Label size={10} color="var(--twin-accent-text)">Prepárate</Label>
        <span
          className="t-readout-hero"
          style={{
            fontSize: landscape ? 150 : 'clamp(120px, 26vh, 190px)',
            color: 'var(--twin-accent-text)',
            lineHeight: 1,
          }}
        >
          {e.cuenta}
        </span>
        <span
          style={{
            font: 'italic 800 20px/1.1 var(--twin-font-sans)',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color: 'var(--twin-fg)',
            textAlign: 'center',
          }}
        >
          {e.pres.cantidad} {unidad}
        </span>
      </div>
    </div>
  );
}

/**
 * Conectado y programado, esperando el primer golpe. El aviso es el de la app
 * palabra por palabra: un monitor emparejado que aún no ha mandado una lectura
 * se explica, no se deja en silencio.
 */
export function AvisoSinDatos({ maquina }: { maquina: Maquina }) {
  return (
    <Aviso
      tono="alerta"
      texto={`Conectado, pero ${MAQUINA_NOMBRE[maquina]} aún no envía datos. Dale unas paladas.`}
    />
  );
}

/** El banner de programación de la pieza, tal cual lo canta la app. */
export function BannerPrograma({ estado }: { estado: 'enviando' | 'listo' }) {
  const enviando = estado === 'enviando';
  const color = enviando ? 'var(--twin-accent-text)' : 'var(--twin-ok)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: 10,
        borderRadius: 10,
        background: 'var(--twin-surface)',
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
      <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {enviando ? 'Enviando el entreno al monitor' : 'Listo, rema para empezar'}
      </span>
    </div>
  );
}

/**
 * SIN MONITOR — el estado que la propuesta no tenía y la app sí.
 *
 * La prescripción sigue siendo verdad, así que ELLA es el sujeto. Las cifras en
 * vivo simplemente no están: un raíl de guiones se lee como app rota, no como
 * silencio honesto. Y lo que se llegó a medir antes de perder el enlace se
 * queda, porque pasó de verdad.
 */
export function CuerpoSinMonitor({
  e,
  maquina,
  onConectar,
}: {
  e: EstadoErg;
  maquina: Maquina;
  onConectar: () => void;
}) {
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const objetivo = objetivoTexto(e.pres);
  return (
    <>
      <Sujeto
        etiqueta={e.pres.series > 1 ? `Serie ${e.serie} de ${e.pres.series}` : e.pres.titulo}
        valor={`${e.pres.cantidad}`}
        unidad={unidad}
        minPx={72}
        maxPx={146}
        extra={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {objetivo && <span className="tw-pill">{objetivo}</span>}
            {e.medidoAntesDePerder != null && e.medidoAntesDePerder >= 1 && (
              <Mono size={12} weight={600} color="var(--twin-muted)">
                {e.medidoAntesDePerder} {unidad} antes de perder el monitor
              </Mono>
            )}
          </div>
        }
      />
      <Card padding={SP.m}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            Sin monitor. Puedes hacerlo igual, pero no se medirá solo.
          </span>
          <button type="button" className="tw-btn-secondary" style={{ width: '100%', height: 44, fontSize: 14 }} onClick={onConectar}>
            Conectar {MAQUINA_NOMBRE[maquina]}
          </button>
        </div>
      </Card>
    </>
  );
}
