'use client';

// EL CIERRE del tramo. No es uno de los tres escenarios del guion: se llega
// jugando, y existe porque si no la pantalla se quedaría congelada en 1.000 m
// con una cuenta atrás viva al lado, que es exactamente la clase de mentira que
// el §7 prohíbe.
//
// Aquí el sujeto ya no es tu salida ni tus metros: es el TIEMPO de la pieza,
// que es lo que puntúa en dobles. Y debajo, la única frase que hay que leerse
// una vez en la vida: de esos 1.000, tuyos son los tuyos.

import { CTA, Display, Label, Mono, Pantalla, SP } from '../../kit';
import { reloj } from '../../datos-reales';
import { BarraPareja, UnidadRitmo } from './atoms';
import { TopStrip } from '../entreno-vivo/piezas';
import {
  CAMBIO_S,
  COLOR_TEXTO,
  PAREJA,
  TRAMO,
  contraObjetivo,
  metrosPorQuien,
  metrosTexto,
  relojTramoS,
  ritmoCifras,
  type Segmento,
} from './data';

export function EscenaFin({
  hechos,
  actual,
  onSiguiente,
}: {
  hechos: Segmento[];
  actual: Segmento;
  onSiguiente: () => void;
}) {
  const metros = TRAMO.totalM;
  const totalS = relojTramoS(hechos, actual, metros);
  const mediaS500 = (totalS / metros) * 500;
  const delta = contraObjetivo(mediaS500);
  const reparto = metrosPorQuien(hechos, actual, metros);
  const cambios = hechos.length;

  return (
    <Pantalla accion={<CTA title="SIGUIENTE" height={96} onClick={onSiguiente} />}>
      <TopStrip
        faseLabel={null}
        segmentoTitulo={`${TRAMO.titulo} · dobles`}
        indice={TRAMO.totalM / TRAMO.relevoM}
        total={TRAMO.totalM / TRAMO.relevoM}
      />

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Label size={10} color="var(--twin-ok)">
            Tramo hecho
          </Label>
          <Display size={22}>{TRAMO.titulo} m</Display>
          <span
            className="t-readout-hero"
            style={{ fontSize: 'clamp(72px, 18vh, 112px)', color: 'var(--twin-fg)' }}
          >
            {reloj(totalS)}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Mono size={20} weight={800}>
              {ritmoCifras(mediaS500)}
            </Mono>
            <UnidadRitmo />
            <span style={{ font: '500 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              de media
            </span>
          </div>
          {delta && (
            <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: delta.color }}>
              {delta.texto} del objetivo
            </span>
          )}
          {/* La media del tramo se come los cambios, y ahí es donde se va el
              tiempo en dobles: son segundos con la máquina parada, que el
              monitor ve tan bien como los que reméis. Sin esta línea el «por
              encima» de arriba parece que os falta ritmo, y no es eso. */}
          {cambios > 0 && (
            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              {cambios} cambios · {cambios * CAMBIO_S} s parados
            </span>
          )}
        </div>
      </div>

      {/* Sin reloj: aquí el reloj del tramo ya es el sujeto de arriba. */}
      <BarraPareja hechos={hechos} actual={actual} metros={metros} />

      <div
        style={{
          flex: '0 0 auto',
          padding: `0 ${SP.xs}px`,
          font: '500 12px/1.4 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          textAlign: 'center',
        }}
      >
        A tu registro van tus{' '}
        <span style={{ color: COLOR_TEXTO.tu, fontWeight: 700 }}>
          {metrosTexto(reparto.tu)} m
        </span>
        . Lo que remó {PAREJA} es suyo y no se te apunta.
      </div>
    </Pantalla>
  );
}
