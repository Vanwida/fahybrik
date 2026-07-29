'use client';

// El descanso y el cierre — los dos estados en los que ya no se mide nada.
//
// El descanso es una PANTALLA con su propio sujeto, no una pausa teñida. Y el
// azul no es un matiz: es la IDENTIDAD de la fase (campo + borde), porque lo que
// el atleta tiene que reconocer desde el suelo, a tres metros y sin leer, es que
// NO está trabajando. Espejo de `ios/FAHYBRIK/Workout/RestSurface.swift`.
//
// Sus cuatro preguntas, en este orden: cuánto queda · a qué voy · me estoy
// recuperando · cómo fue la que acabo de hacer.

import { Card, Hairline, Label, Mono, Pantalla, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import { Celda, Cromo, zonaDe, COLOR_ZONA } from './atomos';
import { TablaSeries } from './piezas';
import {
  MEDIDA_UNIDAD,
  type Prescripcion,
  type ResumenSerie,
  caloriasEn,
  fmtElapsed,
  objetivoTexto,
} from './data';
import { tituloAccion, type EstadoErg } from './motor';

/** El campo azul: fondo, borde y radio. La fase se reconoce sin leer. */
const CAMPO_DESCANSO = {
  background: 'color-mix(in srgb, var(--twin-info) 16%, transparent)',
  border: '2px solid color-mix(in srgb, var(--twin-info) 75%, transparent)',
  borderRadius: 14,
} as const;

const CAJA_INTERIOR = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  padding: '10px 8px',
  borderRadius: 12,
  background: 'var(--twin-surface)',
};

/** Los últimos segundos van en acento, igual que los pitidos. */
const URGENTE_S = 3;

export function Descanso({ e, onLog }: { e: EstadoErg; onLog: (linea: string) => void }) {
  const prescrito = e.pres.descansoS;
  const restante = prescrito == null ? null : Math.max(0, prescrito - e.tDescanso);
  const urgente = restante != null && restante <= URGENTE_S;
  const siguiente = e.serie + 1;

  return (
    <Pantalla
      accion={
        <button
          type="button"
          onClick={e.empezarSiguiente}
          className="tw-btn-primary"
          style={{ width: '100%', height: 88, fontSize: 17, letterSpacing: '0.06em' }}
        >
          {tituloAccion(e)}
        </button>
      }
    >
      <Cromo
        titulo={e.pres.titulo}
        serie={siguiente}
        series={e.pres.series}
        onSalir={() => onLog('salir del entreno desde el descanso')}
        onPausa={e.alternarPausa}
      />

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '12px 14px',
          ...CAMPO_DESCANSO,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
          <span
            style={{
              font: 'italic 800 13px/1 var(--twin-font-sans)',
              letterSpacing: '0.14em',
              color: 'var(--twin-info)',
            }}
          >
            {prescrito == null ? 'DESCANSO LIBRE' : 'DESCANSO'}
          </span>
          {e.pres.series > 1 && (
            <span style={{ font: '800 11px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
              SERIE {siguiente}/{e.pres.series}
            </span>
          )}
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
          <span
            className="t-readout-hero"
            style={{
              fontSize: 'clamp(80px, 19vh, 130px)',
              color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-info)',
              transition: 'color 300ms linear',
            }}
          >
            {fmtClock(restante ?? e.tDescanso)}
          </span>
        </div>

        <Siguiente e={e} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <Recuperacion e={e} />
          <LaQueAcabas e={e} />
        </div>
      </div>

      {prescrito == null && (
        <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          El coach no escribió descanso para esta serie, así que el reloj cuenta hacia arriba y sales tú.
        </span>
      )}

      {e.ultimo && <LecturasDeLaSerie resumen={e.ultimo} e={e} />}
      <TablaSeries e={e} />
    </Pantalla>
  );
}

/** «LUEGO» y a qué caminas: la segunda pregunta de todo descanso. */
function Siguiente({ e }: { e: EstadoErg }) {
  const objetivo = objetivoTexto(e.pres);
  const linea = `${e.pres.cantidad} ${MEDIDA_UNIDAD[e.pres.medida]}${objetivo ? ` a ${objetivo}` : ''}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <Label size={10}>Luego</Label>
      <span style={{ font: 'italic 800 22px/1.15 var(--twin-font-sans)', color: 'var(--twin-fg)', textAlign: 'center' }}>
        {linea}
      </span>
    </div>
  );
}

/**
 * ¿Me estoy recuperando? Pulso ahora y la caída desde el pico de la serie, que
 * es lo único de esta pantalla que dice si el descanso está funcionando. Sin
 * reloj no hay tarjeta: un guion no es una medida.
 */
function Recuperacion({ e }: { e: EstadoErg }) {
  if (e.pulso == null) return null;
  const zona = zonaDe(e.pulso);
  const pico = e.ultimo?.pulsoPico ?? null;
  return (
    <div style={{ flex: 1, ...CAJA_INTERIOR }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
        <span className="t-readout-m" style={{ color: COLOR_ZONA(zona), transition: 'color 900ms linear' }}>
          {e.pulso}
        </span>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>ppm</span>
      </div>
      {pico != null && e.recuperado != null && e.recuperado > 0 ? (
        <Mono size={12} weight={800} color="var(--twin-ok)">
          ▼ {e.recuperado} desde {pico}
        </Mono>
      ) : (
        <Label size={9}>Pulso</Label>
      )}
    </div>
  );
}

/** Cómo se cerró la ventana que acabas de hacer: lo que costó y lo que midió. */
function LaQueAcabas({ e }: { e: EstadoErg }) {
  if (!e.ultimo) return null;
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  return (
    <div style={{ flex: 1, ...CAJA_INTERIOR }}>
      <span className="t-readout-m">{fmtClock(e.ultimo.duracionS)}</span>
      <span
        style={{
          font: '800 9px/1.2 var(--twin-font-sans)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          textAlign: 'center',
        }}
      >
        {e.ultimo.medido} {unidad} · la que acabas de hacer
      </span>
    </div>
  );
}

/**
 * Lo que el monitor sabe y a media pieza no cabía. Aquí SÍ hay ojos: la media
 * de la serie, la potencia, la cadencia y las calorías.
 */
function LecturasDeLaSerie({ resumen, e }: { resumen: ResumenSerie; e: EstadoErg }) {
  const objetivo = e.pres.objetivo?.clase === 'ritmo' ? e.pres.objetivo.segundosPor500 : null;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {resumen.ritmoMedio != null && (
        <Celda
          etiqueta="media /500m"
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
      <Celda etiqueta={e.pres.maquina === 'bici' ? 'pedaladas' : 'paladas'} valor={`${resumen.cadenciaMedia}`} />
      <Celda etiqueta="cal" valor={`${caloriasEn(e.pres.maquina, resumen.duracionS)}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// hecho — la pieza está cerrada y el resumen del entreno vive aparte
// ---------------------------------------------------------------------------

export function Hecho({ e, onLog }: { e: EstadoErg; onLog: (linea: string) => void }) {
  return (
    <Pantalla
      accion={
        <button
          type="button"
          onClick={() => onLog('terminar: el resumen del entreno se abre en su propia pantalla')}
          className="tw-btn-primary"
          style={{ width: '100%', height: 88, fontSize: 17, letterSpacing: '0.06em' }}
        >
          {tituloAccion(e)}
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
      {e.ultimo && <ResumenCard resumen={e.ultimo} pres={e.pres} e={e} />}
      <TablaSeries e={e} />
    </Pantalla>
  );
}

function ResumenCard({ resumen, pres, e }: { resumen: ResumenSerie; pres: Prescripcion; e: EstadoErg }) {
  const unidad = MEDIDA_UNIDAD[pres.medida];
  return (
    <Card padding={SP.m} topAccent>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="t-headline-s">{pres.series > 1 ? `Serie ${resumen.serie} hecha` : 'Lo que midió'}</span>
          <span style={{ flex: 1 }} />
          {/* Lo medido, no lo pedido: 401 m para un hito de 400 se guardan 401. */}
          <Mono size={13} color="var(--twin-muted)">
            {resumen.medido} {unidad} medidos
          </Mono>
        </div>
        <Hairline />
        <LecturasDeLaSerie resumen={resumen} e={e} />
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
