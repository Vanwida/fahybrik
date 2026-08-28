'use client';

// Las piezas propias de la superficie grande. Todo lo que ya existe en
// `kit-vivo` (ambiente, numeral, banda del sujeto, franja de acción, apoyos)
// se usa tal cual: aquí sólo vive lo que el kit no tiene y esta interfaz
// necesita — la ruta aplanada, el estado de la señal y el drenaje del tramo.

import type { ReactNode } from 'react';
import { SP } from '../../kit';

// ---------------------------------------------------------------------------
// La ruta, aplanada
// ---------------------------------------------------------------------------

/**
 * LA CINTA DE RUTA — el `AroRuta` de la muñeca, estirado en una línea.
 *
 * Es la misma información y la misma regla: cada estación ocupa lo que pesa,
 * lo hecho se apaga a la mitad, y **el tramo activo sólo se rellena con lo que
 * alguien mide de verdad**. En una estación ciega se queda a cero y ahí se ve
 * lo que el reloj sabe y lo que no, sin escribir una palabra.
 *
 * Cuesta 4 pt de alto. La auditoría marcó que el iPhone no enseña en qué
 * estación vas («no round chip»); esto lo dice sin gastar una fila.
 */
export function CintaRuta({
  pesos,
  activo,
  fraccion,
}: {
  pesos: readonly number[];
  activo: number;
  fraccion: number;
}) {
  const total = pesos.reduce((a, p) => a + p, 0);
  const avance = Math.min(1, Math.max(0, fraccion));
  return (
    <div
      aria-hidden
      style={{ display: 'flex', gap: 3, width: '100%', height: 4, alignItems: 'stretch' }}
    >
      {pesos.map((p, i) => (
        <div
          key={i}
          style={{
            flex: `${p / total} 1 0`,
            borderRadius: 2,
            overflow: 'hidden',
            background: 'color-mix(in srgb, var(--twin-fg) 14%, transparent)',
          }}
        >
          <div
            style={{
              width: i < activo ? '100%' : i === activo ? `${avance * 100}%` : '0%',
              height: '100%',
              background: 'var(--twin-accent)',
              opacity: i < activo ? 0.5 : 1,
              transition: 'width 900ms linear',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El drenaje del tramo
// ---------------------------------------------------------------------------

/**
 * Lo que llevas de la pieza, drenando. Va pegado al sujeto porque es el mismo
 * hecho dicho de otra manera: el número dice cuánto falta y la barra dice
 * cuánto es eso del total, que es lo que se lee de reojo sin enfocar.
 *
 * Con `fraccion` en cero (estación ciega, o GPS sin fijar) la barra sigue
 * existiendo vacía: no insinúa progreso, dice que no hay nada medido.
 */
export function Drenaje({ fraccion, tono = 'var(--twin-fg)' }: { fraccion: number; tono?: string }) {
  const hecho = Math.min(1, Math.max(0, fraccion));
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        maxWidth: 300,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--twin-fg) 12%, transparent)',
      }}
    >
      <div
        style={{
          width: `${hecho * 100}%`,
          height: '100%',
          background: tono,
          transition: 'width 900ms linear, background-color 500ms linear',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El estado de las fuentes — la señal y el pulso
// ---------------------------------------------------------------------------

export type EstadoChip = 'ok' | 'buscando' | 'mudo';

const TONO_CHIP: Record<EstadoChip, string> = {
  ok: 'var(--twin-ok)',
  buscando: 'var(--twin-warning)',
  mudo: 'var(--twin-faint)',
};

/**
 * Una fuente y su estado. Existe para que la honestidad de la medida tenga un
 * sitio FIJO y pequeño: si el GPS busca, se dice aquí y el sujeto no se
 * disfraza de medición. Nunca lleva un número inventado.
 */
export function Chip({ texto, estado }: { texto: string; estado: EstadoChip }) {
  const tono = TONO_CHIP[estado];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        border: '1px solid var(--twin-hairline-strong)',
        background: 'color-mix(in srgb, var(--twin-surface) 70%, transparent)',
        font: '600 11px/1 var(--twin-font-sans)',
        letterSpacing: '0.04em',
        color: 'var(--twin-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: tono,
          transition: 'background-color 400ms linear',
        }}
      />
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------------------
// El juicio, ya interpretado
// ---------------------------------------------------------------------------

/**
 * «En objetivo» / «Aprieta» / «Te pasas». Es lo que convierte un ritmo suelto
 * en una lectura: el atleta no tiene que acordarse del objetivo ni restar de
 * cabeza a 170 ppm. No es una frase motivacional — es el juicio del número
 * contra lo que escribió su coach, y por eso siempre va con el objetivo al lado.
 */
export function Veredicto({ texto, tono }: { texto: string; tono: string }) {
  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        background: `color-mix(in srgb, ${tono} 16%, transparent)`,
        font: '700 12px/1 var(--twin-font-sans)',
        letterSpacing: '0.04em',
        color: tono,
        whiteSpace: 'nowrap',
        transition: 'color 400ms linear, background-color 400ms linear',
      }}
    >
      {texto}
    </span>
  );
}

/** La línea de pie: contra qué se compara, o de dónde sale el dato. */
export function Pie({ children }: { children: ReactNode }) {
  return (
    <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// La franja de contexto — la que no desaparece nunca
// ---------------------------------------------------------------------------

/**
 * DÓNDE ESTÁS Y CUÁNTO MARGEN TE QUEDA, permanente.
 *
 * El iPhone ya tenía la idea (`ForTimeContextStrip`) y le faltaban las dos
 * cifras que la hacen útil corriendo: el `time_cap` de la estación —que el
 * motor calcula y ninguna pantalla pintaba— y el crono del bloque, que es la
 * puntuación. Van juntos porque se leen juntos: uno es el techo de esto y el
 * otro es el marcador de todo.
 */
export function FranjaContexto({
  posicion,
  estacion,
  cap,
  bloque,
  urgente,
  ruta,
}: {
  posicion: string;
  estacion: string;
  /** `null` = el coach no puso techo a esta estación. Entonces no se pinta. */
  cap: string | null;
  bloque: string;
  urgente: boolean;
  ruta: ReactNode;
}) {
  const tonoCap = urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)';
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.m }}>
        {/* `minWidth: 0` no es cosmética: un hijo de flex con `nowrap` tiene un
            mínimo automático igual a su contenido, así que sin esto NO ENCOGE y
            lo que se sale por la derecha son los relojes — que es justo lo que
            hacía («BLOQUE 8:4» cortado contra el borde del teléfono).
            El que se recorta es el NOMBRE de la estación, nunca la cifra: la
            misma regla que en la muñeca (`contextoMuneca`). */}
        <span
          style={{
            minWidth: 0,
            font: '700 13px/1 var(--twin-font-sans)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--twin-fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {`Estación ${posicion} · ${estacion}`}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: SP.m, flex: '0 0 auto' }}>
          {cap !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
              <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
                cap
              </span>
              <span
                className="t-readout-s"
                style={{ color: tonoCap, transition: 'color 400ms linear' }}
              >
                {cap}
              </span>
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
              bloque
            </span>
            <span className="t-readout-s" style={{ color: 'var(--twin-fg)' }}>
              {bloque}
            </span>
          </span>
        </span>
      </div>
      {ruta}
    </div>
  );
}

/** El cromo: de qué bloque es esto, con qué fuentes, y el sitio de la pausa. */
export function Cabecera({
  titulo,
  chips,
  pausado,
  onPausa,
}: {
  titulo: string;
  chips: ReactNode;
  pausado: boolean;
  onPausa: () => void;
}) {
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: SP.s }}>
      <span
        style={{
          minWidth: 0,
          font: 'italic 800 15px/1 var(--twin-font-sans)',
          letterSpacing: '-0.01em',
          color: 'var(--twin-fg)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {titulo}
      </span>
      <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', flex: '0 0 auto', alignItems: 'center' }}>
        {chips}
        <button
          type="button"
          onClick={onPausa}
          aria-label={pausado ? 'Reanudar' : 'Pausar'}
          className="tw-btn-secondary"
          style={{
            padding: '4px 12px',
            borderRadius: 999,
            font: '700 11px/1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            height: 'auto',
            minHeight: 0,
          }}
        >
          {pausado ? 'Sigue' : 'Pausa'}
        </button>
      </span>
    </div>
  );
}
