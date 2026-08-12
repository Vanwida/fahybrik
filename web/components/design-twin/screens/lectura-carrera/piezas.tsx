'use client';

// Las piezas propias de la lectura de una carrera. Todo lo demás sale del kit:
// `Numeral`, `EtiquetaSujeto`, `Apoyo`, `FranjaAccion`, `Ambiente` de
// `kit-vivo`; el RPE, «Cómo ha ido» y la fila plegada de `post-entreno`, que ya
// están aprobados y shipeados. Esta pantalla no reinventa el lenguaje: lo sigue.

import type { ReactNode } from 'react';
import type { Zona } from '../../kit-vivo';
import { distancia, esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import { TONO_VEREDICTO, VOZ_ATLETA, type Carrera, type Kilometro, type Lectura, type Repeticion } from './modelo';
import type { RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';

// ---------------------------------------------------------------------------
// Cabecera de sección — el único cromo que separa un bloque del siguiente
// ---------------------------------------------------------------------------

export function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s }}>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.14em' }}>
          {titulo}
        </span>
        {nota && (
          <span style={{ font: '500 10.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{nota}</span>
        )}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EL TROCEADO POR REPETICIÓN — una fila por serie, con su veredicto
// ---------------------------------------------------------------------------

/**
 * Las recuperaciones NO son filas: son la costura entre dos series.
 *
 * El motor de veredicto ya las excluye a propósito (un trote de vuelta no tiene
 * banda de trabajo contra la que medirse), así que darles el mismo peso visual
 * que a una serie las convertiría en algo que se juzga. Van entre medias, en
 * gris y en una línea — presentes, porque el atleta quiere saber si respetó el
 * descanso, y nunca juzgadas.
 */
export function TablaRepeticiones({
  repeticiones,
  veredictos,
  eje,
  certeza,
}: {
  repeticiones: Repeticion[];
  veredictos: RunComplianceVerdict[];
  eje: Lectura['eje'];
  certeza: Carrera['certezaTramos'];
}) {
  // El veredicto llega en una lista SOLO de tramos de trabajo (el motor excluye
  // las recuperaciones), así que hay que saber por qué trabajo va cada fila
  // antes de pintar — contarlo mientras se renderiza sería llevar estado.
  const trabajos = repeticiones.filter((r) => r.papel === 'trabajo');
  const posicion = new Map(trabajos.map((r, i) => [r, i]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {repeticiones.map((r, k) =>
        r.papel === 'recuperacion' ? (
          <Recuperacion key={k} r={r} />
        ) : (
          <FilaRepeticion key={k} r={r} veredicto={veredictos[posicion.get(r) ?? -1] ?? null} eje={eje} />
        ),
      )}
      {certeza && <NotaCerteza certeza={certeza} />}
    </div>
  );
}

function FilaRepeticion({
  r,
  veredicto,
  eje,
}: {
  r: Repeticion;
  veredicto: RunComplianceVerdict | null;
  eje: Lectura['eje'];
}) {
  // En cuesta el ritmo bruto no se compara: lo que se lee es el TIEMPO. No es
  // una excepción de esta fila, es el eje que decidió la lectura entera.
  const cifra = eje === 'tiempo' ? reloj(r.duracionS) : r.ritmoSkm != null ? ritmoKm(r.ritmoSkm) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: '9px 10px', borderRadius: R.m, background: 'color-mix(in srgb, var(--twin-surface) 72%, transparent)' }}>
      <span style={{ width: 16, font: '700 13px/1 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>{r.n}</span>
      <span style={{ flex: 1, minWidth: 0, font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
        {r.distanciaM != null ? distancia(r.distanciaM) : reloj(r.duracionS)}
      </span>
      {cifra && (
        <span className="t-readout-s" style={{ fontSize: 17, color: 'var(--twin-fg)' }}>
          {cifra}
        </span>
      )}
      {/* El pulso de la repetición solo si se midió. Nunca un hueco con unidad. */}
      {r.fcMediaPpm != null && (
        <span style={{ width: 42, textAlign: 'right', font: '600 12px/1 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>
          {r.fcMediaPpm}
        </span>
      )}
      {veredicto && veredicto !== 'sin_dato' && <Pastilla veredicto={veredicto} />}
    </div>
  );
}

const MODO_RECUPERACION: Record<NonNullable<Repeticion['modo']>, string> = {
  trote: 'trotando',
  andando: 'andando',
  parado: 'parado',
};

function Recuperacion({ r }: { r: Repeticion }) {
  // Parado no tiene ritmo, y no se le inventa uno. Trotando sí, y es dato: es la
  // diferencia entre respetar la recuperación y correrla.
  const detalle = [
    reloj(r.duracionS),
    r.modo ? MODO_RECUPERACION[r.modo] : null,
    r.ritmoSkm != null ? `a ${ritmoKm(r.ritmoSkm)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: '3px 10px 3px 34px' }}>
      <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{detalle}</span>
    </div>
  );
}

export function Pastilla({ veredicto }: { veredicto: RunComplianceVerdict }) {
  const tono = TONO_VEREDICTO[veredicto];
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 999,
        background: `color-mix(in srgb, ${tono} 16%, transparent)`,
        color: tono,
        font: '600 10.5px/1 var(--twin-font-sans)',
        whiteSpace: 'nowrap',
      }}
    >
      {VOZ_ATLETA[veredicto]}
    </span>
  );
}

const NOTA_CERTEZA: Record<'marcados' | 'detectados', string> = {
  marcados: 'Los tramos los cerró el entreno: no se han inferido.',
  detectados: 'Estos apretones no los marcaste tú: los separa el ritmo. Dato inferido.',
};

export function NotaCerteza({ certeza }: { certeza: 'marcados' | 'detectados' }) {
  return (
    <span style={{ marginTop: 2, font: '500 10.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
      {NOTA_CERTEZA[certeza]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL TROCEADO POR KILÓMETRO — para lo continuo, y solo para lo continuo
// ---------------------------------------------------------------------------

/**
 * Los kilómetros de un 6×800 no dicen nada (parten las series por la mitad) y
 * las repeticiones de un rodaje no existen. Por eso esta tabla y la de arriba
 * NUNCA se pintan a la vez: la lectura decide cuál toca.
 *
 * La barra de cada fila es proporcional a la VELOCIDAD, no al ritmo: con el
 * ritmo, el kilómetro lento sería la barra más larga.
 */
export function TablaKilometros({ kilometros }: { kilometros: Kilometro[] }) {
  const conRitmo = kilometros.filter((k) => k.ritmoSkm != null);
  if (conRitmo.length === 0) return null;
  const velocidades = conRitmo.map((k) => 1000 / k.ritmoSkm!);
  const min = Math.min(...velocidades);
  const max = Math.max(...velocidades);
  const ancho = (skm: number) => {
    const v = 1000 / skm;
    return max === min ? 100 : 30 + 70 * ((v - min) / (max - min));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {kilometros.map((k) => (
        <div key={k.n} style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: '7px 10px', borderRadius: R.m, background: 'color-mix(in srgb, var(--twin-surface) 72%, transparent)' }}>
          <span style={{ width: 52, font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
            {k.parcial ? esDecimal(k.distanciaM / 1000, 2) : `km ${k.n}`}
          </span>
          {k.ritmoSkm != null ? (
            <>
              <span style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                <span style={{ width: `${ancho(k.ritmoSkm)}%`, height: 6, borderRadius: 3, background: 'color-mix(in srgb, var(--twin-fg) 34%, transparent)' }} />
              </span>
              <span className="t-readout-s" style={{ fontSize: 16, color: 'var(--twin-fg)' }}>
                {ritmoKm(k.ritmoSkm)}
              </span>
              {k.fcMediaPpm != null && (
                <span style={{ width: 42, textAlign: 'right', font: '600 12px/1 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>
                  {k.fcMediaPpm}
                </span>
              )}
            </>
          ) : (
            // Ni una casilla vacía ni un guion: el kilómetro existió, y lo que
            // falta se dice con palabras (§7 + la regla del hueco declarado).
            <span style={{ flex: 1, font: '500 11.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              {k.sinCobertura === 'sin señal' ? 'El reloj perdió la señal en este kilómetro' : 'Sin cobertura'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL MAPA — solo en calle, y coloreado por zona de ritmo
// ---------------------------------------------------------------------------

/**
 * El color del recorrido es TU ZONA DE RITMO, no una rampa inventada.
 *
 * Strava colorea por ritmo con un degradado que no significa nada fuera de esa
 * carrera. Aquí las cinco bandas ya existen (el perfil de zonas del atleta) y ya
 * tienen color en toda la app, así que un tramo ámbar significa lo mismo en el
 * mapa que en el resto de la pantalla: fuiste en Z4. El color es dato (§9.1) y
 * no puede querer decir dos cosas distintas en la misma vista.
 */
export function Mapa({ ruta }: { ruta: Carrera['ruta'] }) {
  if (ruta.length < 2) return null;
  const ALTO_MAPA = 128;
  const escala = (v: number) => v * 100;
  const zonasUsadas = [...new Set(ruta.map((p) => p.zona).filter((z): z is Zona => z != null))].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ borderRadius: R.l, overflow: 'hidden', background: 'color-mix(in srgb, var(--twin-surface) 72%, transparent)', border: '1px solid var(--twin-hairline)' }}>
        <svg viewBox="0 0 100 66" width="100%" height={ALTO_MAPA} role="img" aria-label="Recorrido de la carrera, coloreado por tu zona de ritmo" style={{ display: 'block' }}>
          {ruta.slice(1).map((p, i) => {
            const a = ruta[i]!;
            return (
              <line
                key={i}
                x1={escala(a.x)}
                y1={escala(a.y) + 2}
                x2={escala(p.x)}
                y2={escala(p.y) + 2}
                stroke={p.zona ? `var(--twin-z${p.zona})` : 'var(--twin-muted)'}
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {zonasUsadas.map((z) => (
          <span key={z} className="tw-zone" data-zone={z} style={{ padding: '3px 8px', fontSize: 10 }}>
            {`Z${z}`}
          </span>
        ))}
        <span style={{ font: '500 10.5px/1.6 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          por tu zona de ritmo
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LO DERIVADO — discreto, y SOLO si hay número
// ---------------------------------------------------------------------------

export interface Derivada {
  etiqueta: string;
  valor: string;
  pie: string;
}

/**
 * Los tres que solo se pueden calcular con el archivo delante. Ninguno se pinta
 * en gris «pendiente»: o hay número, o la fila no existe.
 *
 * Y ninguno lleva su nombre de laboratorio. «Deriva aeróbica» y «Pa:HR» no los
 * dice nadie en un box; «mismo pulso, 7 s/km más lento» lo entiende cualquiera
 * a la primera, que es la prueba que manda (§3 del CONTRATO-UI).
 */
export function derivadasDe(c: Carrera): Derivada[] {
  const filas: Derivada[] = [];
  if (c.derivado.derivaSkm != null) {
    filas.push({ etiqueta: 'Al mismo pulso', valor: `+${c.derivado.derivaSkm}`, pie: 's/km al final' });
  }
  if (c.derivado.bajadaPulsoPpm != null) {
    filas.push({ etiqueta: 'Al parar', valor: `−${c.derivado.bajadaPulsoPpm}`, pie: 'ppm en 1 min' });
  }
  if (c.desnivelM != null && c.desnivelM > 0) {
    filas.push({ etiqueta: 'Subida', valor: `+${c.desnivelM}`, pie: 'm acumulados' });
  }
  // Sin traza no hay curva que enseñe el pulso, pero la FC media y la máxima SÍ
  // se guardaron con la ejecución: son dato medido y llevan aquí desde siempre.
  // Dejar el hueco teniendo esto sería quedarse corto, no ser honesto.
  if (!c.traza && c.fcMediaPpm != null && c.fcMaxPpm != null) {
    filas.push({ etiqueta: 'FC media', valor: `${c.fcMediaPpm}`, pie: 'ppm' });
    filas.push({ etiqueta: 'FC máx', valor: `${c.fcMaxPpm}`, pie: 'ppm' });
  }
  return filas;
}

// ---------------------------------------------------------------------------
// EL HUECO DECLARADO — cuando no hay archivo, se dice por qué
// ---------------------------------------------------------------------------

/**
 * No es la versión rota de la pantalla buena: es la misma pantalla diciendo la
 * verdad. Sin archivo no hay curva, ni kilómetros, ni mapa, ni nada derivado —
 * y en vez de seis secciones vacías hay UNA frase que explica las seis.
 */
export function SinArchivo({ desde, revision }: { desde: string; revision: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: `${S.l}px ${S.m}px`,
        borderRadius: R.l,
        border: '1px dashed var(--twin-hairline-strong)',
        textAlign: 'center',
      }}
    >
      {/* El PORQUÉ ya lo dice el sujeto, pegado al número que degradó. Aquí va
          la CONSECUENCIA, que es otra cosa: qué falta y hasta cuándo. Repetir
          la misma frase dos veces seguidas es el ruido que esta app no tiene. */}
      <span style={{ font: 'italic 800 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        Sin curva, sin kilómetros y sin mapa
      </span>
      <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {revision
          ? `Las carreras se archivan desde el ${desde}. De las anteriores solo quedan sus totales, que son los de arriba.`
          : 'El reloj no llegó a emitir. Los totales sí se guardaron, y son los de arriba.'}
      </span>
    </div>
  );
}
