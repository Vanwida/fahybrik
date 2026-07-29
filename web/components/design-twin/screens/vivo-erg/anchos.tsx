'use client';

// Los tres estados que la cara de monitor NO pinta como rejilla.
//
// Cuando no hay nada que medir (esperando, descansando, o con la pieza ya
// cerrada) una cuadrícula de cuatro cifras sobra: el horizontal deja de ser un
// panel de instrumentos y pasa a ser una sola lectura grande con su contexto al
// lado, que es lo que se ve desde el ergo a metro y medio.

import { Label, Mono, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { COLOR_ZONA, zonaDe } from './atomos';
import { MAQUINA_NOMBRE, MEDIDA_UNIDAD, fmtElapsed } from './data';
import type { EstadoErg, Guion } from './motor';

// ---------------------------------------------------------------------------
// Los otros tres estados, en horizontal
// ---------------------------------------------------------------------------

export function EsperaAncha({ e, guion }: { e: EstadoErg; guion: Guion }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.xl }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {/* Una pieza continua no es «la serie 1 de 1»: es la pieza. */}
          <Label size={10}>
            {e.pres.series > 1 ? `Serie ${e.serie} de ${e.pres.series}` : e.pres.titulo}
          </Label>
          <span className="t-readout-hero" style={{ fontSize: 104 }}>{e.pres.cantidad}</span>
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
            {MEDIDA_UNIDAD[e.pres.medida]}
          </span>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--twin-hairline)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300 }}>
          <span className="t-headline-m">Empieza cuando {MAQUINA_NOMBRE[guion.maquina]} se mueva</span>
          <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            El crono arranca solo. La cuenta vuelve a cero para esta serie, aunque el monitor siga sumando lo suyo.
          </span>
        </div>
      </div>
    </div>
  );
}

export function DescansoAncho({ e }: { e: EstadoErg }) {
  const restante = e.pres.descansoS == null ? null : Math.max(0, e.pres.descansoS - e.tDescanso);
  const zona = zonaDe(e.pulso);
  const r = e.ultimo;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: SP.m }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Label size={10}>{restante == null ? 'Descanso libre' : 'Descanso'}</Label>
        <span className="t-readout-hero" style={{ fontSize: 116 }}>{fmtClock(restante ?? e.tDescanso)}</span>
        {e.pulso != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-readout-l" style={{ color: COLOR_ZONA(zona), transition: 'color 900ms linear' }}>
              {e.pulso}
            </span>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>ppm</span>
            {e.recuperado != null && e.recuperado > 0 && (
              <Mono size={15} weight={700} color="var(--twin-ok)">−{e.recuperado}</Mono>
            )}
          </div>
        )}
      </div>
      {r && (
        <div
          style={{
            width: 330,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 10,
            padding: SP.l,
            borderRadius: 14,
            background: 'var(--twin-surface)',
            border: '1px solid var(--twin-hairline)',
          }}
        >
          <span className="t-headline-s">Serie {r.serie} hecha</span>
          <div style={{ display: 'flex', gap: SP.l }}>
            <ParDato etiqueta="tiempo" valor={fmtElapsed(r.duracionS)} />
            {r.ritmoMedio != null && <ParDato etiqueta="medio /500m" valor={fmtPace500(r.ritmoMedio)} />}
          </div>
          <div style={{ display: 'flex', gap: SP.l }}>
            <ParDato etiqueta="vatios" valor={`${r.vatiosMedios}`} />
            <ParDato etiqueta="medidos" valor={`${r.medido} ${MEDIDA_UNIDAD[e.pres.medida]}`} />
          </div>
          <div style={{ display: 'flex', gap: SP.l }}>
            <ParDato
              etiqueta={e.pres.maquina === 'bici' ? 'pedaladas' : 'paladas'}
              valor={`${r.cadenciaMedia}`}
            />
            {r.pulsoPico != null && <ParDato etiqueta="pico ppm" valor={`${r.pulsoPico}`} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ParDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="t-readout-m">{valor}</span>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{etiqueta}</span>
    </div>
  );
}

export function CierreAncho({ e }: { e: EstadoErg }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Label size={10} color="var(--twin-ok)">Pieza cerrada</Label>
        <span className="t-readout-hero" style={{ fontSize: 112 }}>
          {e.ultimo ? fmtElapsed(e.ultimo.duracionS) : fmtElapsed(e.t)}
        </span>
        {e.ultimo && (
          <Mono size={15} color="var(--twin-muted)">
            {e.ultimo.medido} {MEDIDA_UNIDAD[e.pres.medida]} medidos
          </Mono>
        )}
      </div>
    </div>
  );
}
