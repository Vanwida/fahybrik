'use client';

// Los estados que la cara de monitor NO pinta como rejilla.
//
// Cuando no hay nada que medir (esperando, sin monitor, descansando o con la
// pieza ya cerrada) una cuadrícula de cifras sobra: el horizontal deja de ser un
// panel de instrumentos y pasa a ser una sola lectura grande con su contexto al
// lado, que es lo que se ve desde el ergo a metro y medio.

import { Label, Mono, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { COLOR_ZONA, zonaDe } from './atomos';
import { MAQUINA_NOMBRE, MEDIDA_UNIDAD, fmtElapsed, objetivoTexto } from './data';
import type { EstadoErg, Guion } from './motor';

/** El campo azul del descanso, igual que en vertical: la fase se reconoce sin leer. */
const CAMPO_DESCANSO = {
  background: 'color-mix(in srgb, var(--twin-info) 16%, transparent)',
  border: '2px solid color-mix(in srgb, var(--twin-info) 75%, transparent)',
  borderRadius: 14,
} as const;

const URGENTE_S = 3;

/**
 * Esperando a la máquina, o directamente sin ella. En los dos casos el sujeto es
 * la ORDEN: es lo que sigue siendo verdad cuando no hay ninguna medida viva.
 */
export function EsperaAncha({ e, guion }: { e: EstadoErg; guion: Guion }) {
  const maquina = MAQUINA_NOMBRE[guion.maquina];
  const ausente = e.monitor === 'ausente';
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const objetivo = objetivoTexto(e.pres);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.xl }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {/* Una pieza continua no es «la serie 1 de 1»: es la pieza. */}
          <Label size={10}>
            {e.pres.series > 1 ? `Serie ${e.serie} de ${e.pres.series}` : e.pres.titulo}
          </Label>
          <span className="t-readout-hero" style={{ fontSize: 104 }}>{e.pres.cantidad}</span>
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{unidad}</span>
          {objetivo && <Mono size={13} weight={700} color="var(--twin-accent-text)">{objetivo}</Mono>}
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--twin-hairline)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 260 }}>
          {ausente ? (
            <>
              <span className="t-headline-m">Sin monitor</span>
              <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Puedes hacerlo igual, pero no se medirá solo. El crono corre desde ya y cierras tú.
              </span>
              {e.medidoAntesDePerder != null && e.medidoAntesDePerder >= 1 && (
                <Mono size={13} weight={700} color="var(--twin-fg)">
                  {e.medidoAntesDePerder} {unidad} antes de perderlo
                </Mono>
              )}
            </>
          ) : (
            <>
              <span className="t-headline-m">Empieza cuando {maquina} se mueva</span>
              <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                El crono arranca solo. La cuenta vuelve a cero para esta serie, aunque el monitor siga sumando lo
                suyo.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function DescansoAncho({ e }: { e: EstadoErg }) {
  const restante = e.pres.descansoS == null ? null : Math.max(0, e.pres.descansoS - e.tDescanso);
  const urgente = restante != null && restante <= URGENTE_S;
  const zona = zonaDe(e.pulso);
  const r = e.ultimo;
  const objetivo = objetivoTexto(e.pres);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'stretch',
        gap: SP.m,
        padding: '10px 14px',
        ...CAMPO_DESCANSO,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            font: 'italic 800 12px/1 var(--twin-font-sans)',
            letterSpacing: '0.14em',
            color: 'var(--twin-info)',
          }}
        >
          {restante == null ? 'DESCANSO LIBRE' : 'DESCANSO'}
        </span>
        <span
          className="t-readout-hero"
          style={{
            fontSize: 108,
            color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-info)',
            transition: 'color 300ms linear',
          }}
        >
          {fmtClock(restante ?? e.tDescanso)}
        </span>
        {e.pulso != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-readout-m" style={{ color: COLOR_ZONA(zona), transition: 'color 900ms linear' }}>
              {e.pulso}
            </span>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>ppm</span>
            {e.recuperado != null && e.recuperado > 0 && r?.pulsoPico != null && (
              <Mono size={13} weight={800} color="var(--twin-ok)">▼ {e.recuperado} desde {r.pulsoPico}</Mono>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 10,
          padding: SP.m,
          borderRadius: 14,
          background: 'var(--twin-surface)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Label size={9}>Luego</Label>
          <span style={{ font: 'italic 800 18px/1.15 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            {e.pres.cantidad} {MEDIDA_UNIDAD[e.pres.medida]}
            {objetivo ? ` a ${objetivo}` : ''}
          </span>
        </div>
        {r && (
          <>
            <div style={{ height: 1, background: 'var(--twin-hairline)' }} />
            <span className="t-headline-s">Serie {r.serie} hecha</span>
            <div style={{ display: 'flex', gap: SP.l }}>
              <ParDato etiqueta="tiempo" valor={fmtElapsed(r.duracionS)} />
              {r.ritmoMedio != null && <ParDato etiqueta="medio /500m" valor={fmtPace500(r.ritmoMedio)} />}
            </div>
            <div style={{ display: 'flex', gap: SP.l }}>
              <ParDato etiqueta="vatios" valor={`${r.vatiosMedios}`} />
              <ParDato etiqueta="medidos" valor={`${r.medido} ${MEDIDA_UNIDAD[e.pres.medida]}`} />
            </div>
          </>
        )}
      </div>
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
            {e.ultimo.ritmoMedio != null ? ` · ${fmtPace500(e.ultimo.ritmoMedio)}/500m de media` : ''}
          </Mono>
        )}
      </div>
    </div>
  );
}
