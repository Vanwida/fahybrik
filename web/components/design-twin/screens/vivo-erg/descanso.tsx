'use client';

// El descanso y el cierre — los dos estados en los que ya no se mide nada.
//
// Viven aparte de `vertical.tsx` porque son OTRA pantalla, no una variante del
// HUD: cambia el sujeto (manda la cuenta atrás), cambia la acción (arrancar la
// siguiente) y cambia lo que se lee (lo que acabas de hacer, no lo que haces).
// Ese es justo el fallo que el doble viene a corregir en el entreno en vivo:
// meter tres arquetipos en un mismo body.

import { Card, Hairline, Label, Mono, Pantalla, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import { Aviso, Celda, Cromo, Sujeto, zonaDe, COLOR_ZONA } from './atomos';
import {
  MEDIDA_UNIDAD,
  type Prescripcion,
  type ResumenSerie,
  fmtElapsed,
  objetivoTexto,
} from './data';
import type { EstadoErg } from './motor';

export function Descanso({ e, onLog }: { e: EstadoErg; onLog: (linea: string) => void }) {
  const prescrito = e.pres.descansoS;
  const restante = prescrito == null ? null : Math.max(0, prescrito - e.tDescanso);
  const zona = zonaDe(e.pulso);
  const siguiente = e.serie + 1;
  const objetivo = objetivoTexto(e.pres);

  return (
    <Pantalla
      accion={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
            Siguiente: serie {siguiente} de {e.pres.series} · {e.pres.cantidad} {MEDIDA_UNIDAD[e.pres.medida]}
            {objetivo ? ` a ${objetivo}` : ''}
          </span>
          <button type="button" onClick={e.empezarSiguiente} className="tw-btn-primary" style={{ width: '100%', height: 74, fontSize: 17 }}>
            {restante == null ? `EMPEZAR LA SERIE ${siguiente}` : 'EMPEZAR YA'}
          </button>
        </div>
      }
    >
      <Cromo
        titulo={e.pres.titulo}
        serie={siguiente}
        series={e.pres.series}
        onSalir={() => onLog('salir del entreno desde el descanso')}
        onPausa={e.alternarPausa}
      />
      {/* El pulso cayendo es parte del sujeto: mirar cómo baja ES el descanso. */}
      <Sujeto
        etiqueta={restante == null ? 'Descanso libre' : 'Descanso'}
        valor={fmtClock(restante ?? e.tDescanso)}
        unidad={restante == null ? 'sin descanso escrito' : 'para la siguiente'}
        maxPx={140}
        extra={
          e.pulso != null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span className="t-readout-l" style={{ color: COLOR_ZONA(zona), transition: 'color 900ms linear' }}>
                {e.pulso}
              </span>
              <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>ppm</span>
              {zona && <span className="tw-zone" data-zone={zona}>{`Z${zona}`}</span>}
              {e.recuperado != null && e.recuperado > 0 && (
                <Mono size={14} weight={700} color="var(--twin-ok)">−{e.recuperado}</Mono>
              )}
            </div>
          ) : undefined
        }
      />
      {restante == null && (
        <Aviso texto="El coach no escribió descanso para esta serie, así que el reloj cuenta hacia arriba y sales tú." />
      )}
      {e.ultimo && <ResumenCard resumen={e.ultimo} pres={e.pres} />}
    </Pantalla>
  );
}

export function ResumenCard({ resumen, pres }: { resumen: ResumenSerie; pres: Prescripcion }) {
  const unidad = MEDIDA_UNIDAD[pres.medida];
  const objetivo = pres.objetivo?.clase === 'ritmo' ? pres.objetivo.segundosPor500 : null;
  return (
    <Card padding={SP.m} topAccent>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="t-headline-s">Serie {resumen.serie} hecha</span>
          <span style={{ flex: 1 }} />
          {/* Lo medido, no lo pedido: 504 m para un hito de 500 se guardan 504. */}
          <Mono size={13} color="var(--twin-muted)">
            {resumen.medido} {unidad} medidos
          </Mono>
        </div>
        <Hairline />
        <div style={{ display: 'flex', gap: 6 }}>
          <Celda etiqueta="tiempo" valor={fmtElapsed(resumen.duracionS)} />
          {resumen.ritmoMedio != null && (
            <Celda
              etiqueta="medio /500m"
              valor={fmtPace500(resumen.ritmoMedio)}
              color={
                objetivo == null
                  ? 'var(--twin-fg)'
                  : resumen.ritmoMedio <= objetivo
                    ? 'var(--twin-ok)'
                    : 'var(--twin-danger)'
              }
            />
          )}
          <Celda etiqueta="vatios" valor={`${resumen.vatiosMedios}`} />
          <Celda etiqueta={pres.maquina === 'bici' ? 'pedaladas' : 'paladas'} valor={`${resumen.cadenciaMedia}`} />
        </div>
        {/* La zona viaja marcada hasta el coach: el umbral de la base es
            estimado, nadie ha escrito nunca un LTHR medido (DECISIONS, 28-jul). */}
        {resumen.pulsoPico != null && (
          <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            Pico {resumen.pulsoPico} ppm. Las zonas salen de un umbral de {UMBRAL.ppm} ppm estimado, no medido.
          </span>
        )}
      </div>
    </Card>
  );
}

/** La pieza continua se acaba aquí; el resumen del entreno es otra pantalla. */
export function Hecho({ e, onLog }: { e: EstadoErg; onLog: (linea: string) => void }) {
  return (
    <Pantalla
      accion={
        <button
          type="button"
          onClick={() => onLog('terminar: el resumen del entreno se abre en su propia pantalla')}
          className="tw-btn-primary"
          style={{ width: '100%', height: 74, fontSize: 17 }}
        >
          TERMINAR
        </button>
      }
    >
      <Cromo
        titulo={e.pres.titulo}
        serie={e.serie}
        series={e.pres.series}
        onSalir={() => onLog('salir del entreno con la pieza ya cerrada')}
        onPausa={e.alternarPausa}
      />
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Label size={10} color="var(--twin-ok)">Pieza cerrada</Label>
          {e.ultimo && (
            <span className="t-readout-hero" style={{ fontSize: 'clamp(64px, 15vh, 118px)' }}>
              {fmtElapsed(e.ultimo.duracionS)}
            </span>
          )}
          <span className="t-headline-s" style={{ color: 'var(--twin-muted)' }}>{e.pres.titulo}</span>
        </div>
      </div>
      {e.ultimo && <ResumenCard resumen={e.ultimo} pres={e.pres} />}
    </Pantalla>
  );
}
