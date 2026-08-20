'use client';

// Las piezas propias de la lectura de una sesión: la cabecera, el desglose
// bloque a bloque —cada modalidad en su propio idioma— y lo que dijo el
// atleta. El resto (`Seccion`, `PuntoModalidad`, `Numeral`, `EtiquetaSujeto`,
// `BarraZonas`, el RPE y «Cómo ha ido») ya existe y se continúa, no se
// reinventa (§0 del CONTRATO-UI).

import { PuntoModalidad } from '../../kit';
import { SIGNO_POR, type Modalidad as ModalidadKit } from '../../datos-reales';
import { conMillar, esDecimal, kg, reloj, ritmo500, ritmoKm } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import { DIFICULTAD_LABEL } from '../post-entreno/piezas';
import type { Bloque, Completitud, DichoAtleta, GrupoDesglose } from './modelo';
import { ritmoDeCorrer, ritmoDeErgometro } from './modelo';

// ---------------------------------------------------------------------------
// CABECERA — título, día y si se hizo entera o a medias
// ---------------------------------------------------------------------------

export function Cabecera({ titulo, cuando, completitud }: { titulo: string; cuando: string; completitud: Completitud }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span
          className="t-readout-label"
          style={{ color: 'var(--twin-fg)', letterSpacing: '0.12em', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {titulo}
        </span>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
          {cuando}
        </span>
      </div>
      <span style={{ font: '600 11.5px/1.2 var(--twin-font-sans)', color: completitud.completa ? 'var(--twin-muted)' : 'var(--twin-warning)' }}>
        {completitud.completa ? 'Sesión completa' : `Hecha a medias · ${completitud.nota}`}
      </span>
    </div>
  );
}

/**
 * LA DISTANCIA, EN LA UNIDAD EN QUE SE PRESCRIBE — no la del formateador
 * genérico de la app (`distancia()`, que corta en 1.000 m y da dos decimales:
 * sirve a otras diez pantallas y no se toca por esta).
 *
 * Nadie piensa un kilómetro prescrito en decimales: por debajo de 2 km se
 * lee en METROS, con el separador de millar de siempre («1.000 m», «40 m»);
 * de ahí para arriba, un decimal y sin el cero de relleno («2,5 km», pero
 * «10 km», nunca «10,0 km»). Corrección de Alex, 20-ago, sobre esta pantalla.
 */
function distanciaPrescrita(metros: number): string {
  if (metros < 2000) return `${conMillar(Math.round(metros))} m`;
  const conDecimal = esDecimal(metros / 1000, 1);
  return `${conDecimal.endsWith(',0') ? conDecimal.slice(0, -2) : conDecimal} km`;
}

// ---------------------------------------------------------------------------
// EL DESGLOSE — un bloque, en su propio idioma
// ---------------------------------------------------------------------------

const PUNTO_DE: Record<Bloque['modalidad'], ModalidadKit> = {
  correr: 'run',
  ergometro: 'row',
  fuerza: 'strength',
  funcional: 'functional',
};

/**
 * LA CABECERA DE COLUMNA — el pulso de la derecha necesita decir que es
 * pulso. Una sola vez, sobre el desglose entero: repetirla en cada fila (o en
 * cada grupo de ronda) sería la misma etiqueta gritando una vez por bloque.
 */
export function CabeceraDesglose() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 10px' }}>
      <span
        className="t-readout-label"
        style={{ width: 38, textAlign: 'right', color: 'var(--twin-faint)', letterSpacing: '0.08em' }}
      >
        ppm
      </span>
    </div>
  );
}

/**
 * UNA RONDA DEL DESGLOSE — cabecera solo si el grupo la trae (§ agrupado sale
 * del dato). El tiempo de la ronda se suma SOLO si todos sus bloques tienen
 * duración: sumar 6 de 8 y llamarlo «el tiempo de la ronda» sería inventar
 * los dos que faltan.
 */
export function GrupoRonda({ grupo, rondas }: { grupo: GrupoDesglose; rondas: number }) {
  const duracionCompleta = grupo.bloques.every((b) => b.duracionS != null);
  const duracionRondaS = duracionCompleta ? grupo.bloques.reduce((acc, b) => acc + b.duracionS!, 0) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {grupo.ronda != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 2px 0' }}>
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.12em' }}>
            {`Ronda ${grupo.ronda} de ${rondas}`}
          </span>
          {duracionRondaS != null && (
            <span style={{ font: '600 11px/1 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>{reloj(duracionRondaS)}</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {grupo.bloques.map((b, i) => (
          <FilaBloque key={i} bloque={b} />
        ))}
      </div>
    </div>
  );
}

export function FilaBloque({ bloque }: { bloque: Bloque }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.s,
        padding: '10px 10px',
        borderRadius: R.m,
        background: 'color-mix(in srgb, var(--twin-surface) 72%, transparent)',
      }}
    >
      <PuntoModalidad modalidad={PUNTO_DE[bloque.modalidad]} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            font: '600 13px/1.25 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {bloque.etiqueta}
        </span>
        {/* Sin cronómetro propio, el tramo no lleva duración: no se inventa (§7). */}
        {bloque.duracionS != null && (
          <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{reloj(bloque.duracionS)}</span>
        )}
        {/* El descanso es del tramo, no de la modalidad: una estación de
            simulacro lo cierra igual que un ejercicio de fuerza. */}
        {bloque.descansoS != null && (
          <span style={{ font: '500 10px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {`descanso ${reloj(bloque.descansoS)}`}
          </span>
        )}
      </div>
      <MedidaDeBloque bloque={bloque} />
      {/* La FC media, solo si se midió. Nunca un hueco con unidad al lado. */}
      {bloque.fcMediaPpm != null && (
        <span style={{ width: 38, textAlign: 'right', font: '600 12px/1 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>
          {bloque.fcMediaPpm}
        </span>
      )}
    </div>
  );
}

/**
 * LA MEDIDA, en el idioma de la modalidad — y ninguna si no se midió.
 *
 * «Donde no hay metros no hay recuadro de metros ni de ritmo» (card 118): esta
 * función es literalmente esa regla. Sin distancia no hay ritmo que derivar —
 * `ritmoDeCorrer`/`ritmoDeErgometro` ya devuelven null en ese caso—, y sin
 * series ni reps/metros el bloque no pinta nada aquí: solo su nombre, su
 * duración y su pulso, que es exactamente lo que SÍ se sabe de él.
 */
function MedidaDeBloque({ bloque }: { bloque: Bloque }) {
  if (bloque.modalidad === 'correr') {
    if (bloque.distanciaM == null) return null;
    const ritmo = ritmoDeCorrer(bloque);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span className="t-readout-s" style={{ fontSize: 16, color: 'var(--twin-fg)' }}>
          {distanciaPrescrita(bloque.distanciaM)}
        </span>
        {ritmo != null && (
          <span style={{ font: '500 10.5px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{ritmoKm(ritmo)}</span>
        )}
      </div>
    );
  }

  if (bloque.modalidad === 'ergometro') {
    if (bloque.distanciaM == null) return null;
    const ritmo = ritmoDeErgometro(bloque);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span className="t-readout-s" style={{ fontSize: 16, color: 'var(--twin-fg)' }}>
          {distanciaPrescrita(bloque.distanciaM)}
        </span>
        {ritmo != null && (
          <span style={{ font: '500 10.5px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{ritmo500(ritmo)}</span>
        )}
      </div>
    );
  }

  if (bloque.modalidad === 'fuerza') {
    if (!bloque.grupos || bloque.grupos.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {bloque.grupos.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
            <span className="t-readout-s" style={{ fontSize: 16, color: 'var(--twin-fg)' }}>
              {`${g.sets}${SIGNO_POR}${g.reps}`}
            </span>
            {/* Peso corporal: no hay carga que enseñar, y no se escribe «— kg». */}
            {g.kg != null && (
              <span style={{ font: '500 10.5px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{kg(g.kg)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Funcional: reps o metros — nunca los dos, y ninguno si no se contó.
  if (bloque.reps == null && bloque.metros == null) return null;
  return (
    <span className="t-readout-s" style={{ fontSize: 16, color: 'var(--twin-fg)' }}>
      {bloque.reps != null ? `${bloque.reps} reps` : distanciaPrescrita(bloque.metros!)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LO QUE DIJO EL ATLETA — la única capa que no es una medida
// ---------------------------------------------------------------------------

export function LoQueDijoElAtleta({ dicho }: { dicho: DichoAtleta | undefined }) {
  if (!dicho) return null;
  const piezas = [
    dicho.rpe != null ? `Esfuerzo ${dicho.rpe}` : null,
    dicho.dificultad ? DIFICULTAD_LABEL[dicho.dificultad] : null,
  ].filter((p): p is string => p != null);
  if (piezas.length === 0 && !dicho.molestia) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {piezas.length > 0 && (
        <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{piezas.join(' · ')}</span>
      )}
      {dicho.molestia && (
        <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-warning)' }}>
          {`Molestia en ${dicho.molestia.area}${dicho.molestia.nota ? ` · ${dicho.molestia.nota}` : ''}`}
        </span>
      )}
    </div>
  );
}
