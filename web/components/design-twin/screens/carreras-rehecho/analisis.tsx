'use client';

// EL ANÁLISIS de la última carrera individual: dónde perdiste tiempo (estaciones
// contra tu puesto y tu entreno, ritmo por km), cómo evolucionas y, si el
// servidor lo manda, el informe de la IA. Solo carreras individuales: el tiempo
// de una estación de dobles es del equipo, no tuyo.
//
// Reglas de honestidad (§7) que este fichero cumple y la vista NO decide:
//   · una estación sin puesto NO lleva barra ni veredicto (una barra a media altura
//     insinuaría un puesto que nadie midió) y la sección dice por qué;
//   · una estación sin tiempo ni delta desaparece: un hueco que el atleta no puede
//     llenar (es un resultado ya corrido) se calla;
//   · sin dos individuales no hay evolución que dibujar.
// El color de estado (arriba / medio / abajo) va en la barra; la cifra va en tinta,
// y la posición además va en PALABRAS, porque el color solo no basta (§4.2).

import type { AnalisisCarrera, CarreraPasada, EstacionVsReferencia, PredichoVsReal, Severidad } from '../../kit-carreras/contrato';
import { estacionesSinPuesto, evolucion } from '../../kit-carreras/decide';
import { conSigno, mesAnio, PUESTO_EN_CAMPO, porcentaje, reloj, relojCarrera } from '../../kit-carreras/formato';
import { IcoBaja, IcoChevron, IcoDiana, IcoSube } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import { Aviso, BotonTexto, Tarjeta } from './piezas';
import { Cinta } from './resumen';

const COLOR_SEVERIDAD: Record<Severidad, string> = {
  better: 'var(--twin-ok)',
  slightly_worse: 'var(--twin-warning)',
  worse: 'var(--twin-danger)',
};

/** Título de un bloque dentro de «Pasadas»: un escalón por debajo del de sección. */
export function SubTitulo({ children, nota }: { children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <h3 style={{ margin: 0, ...fuente(800, 20, 1.2, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{children}</h3>
      {nota ? <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)', textWrap: 'pretty' }}>{nota}</span> : null}
    </span>
  );
}

const bloque = { display: 'flex', flexDirection: 'column', gap: 10 } as const;

// ── Estaciones ────────────────────────────────────────────────────────────────

function FilaEstacion({ e, i, onAbre }: { e: EstacionVsReferencia; i: number; onAbre: (estacion: string) => void }) {
  const conBarra = e.fraccion != null && e.severidad != null;
  const partes = [
    e.estacion,
    e.tiempoS != null ? reloj(e.tiempoS) : null,
    conBarra ? `puesto en el campo: ${PUESTO_EN_CAMPO[e.severidad!].toLowerCase()}` : null,
    e.deltaS != null ? `${conSigno(e.deltaS)} contra tu nivel de entreno` : null,
    'Abre el detalle de la estación',
  ].filter(Boolean);
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onAbre(e.estacion)}
      aria-label={partes.join('. ')}
      style={{ minHeight: 56, padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', minWidth: 0 }}>{e.estacion}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {e.tiempoS != null ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>{reloj(e.tiempoS)}</span> : null}
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IcoChevron tam={16} />
          </span>
        </span>
      </span>
      {conBarra || e.deltaS != null ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {conBarra ? (
            <>
              <span aria-hidden style={{ flex: 1, height: 8, borderRadius: 4, background: velo('var(--twin-fg)', 12), overflow: 'hidden' }}>
                <span
                  className="cr-barra-x"
                  style={{ '--i': i, display: 'block', height: '100%', width: `${Math.round(e.fraccion! * 100)}%`, borderRadius: 4, background: COLOR_SEVERIDAD[e.severidad!] } as React.CSSProperties}
                />
              </span>
              <span style={{ width: 52, ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)' }}>{PUESTO_EN_CAMPO[e.severidad!]}</span>
            </>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          <span style={{ width: 62, textAlign: 'right', ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>{e.deltaS != null ? conSigno(e.deltaS) : ''}</span>
        </span>
      ) : null}
    </button>
  );
}

export function Estaciones({ a, onAbre }: { a: AnalisisCarrera; onAbre: (estacion: string) => void }) {
  // Sin tiempo y sin delta no hay nada que enseñar de esa estación: se calla.
  const filas = a.estaciones.filter((e) => e.tiempoS != null || e.deltaS != null);
  if (filas.length === 0) return null;
  const sinPuesto = estacionesSinPuesto(a.estaciones);
  const hayDelta = filas.some((e) => e.deltaS != null);
  const nota = sinPuesto
    ? 'Esta carrera no trae tu puesto por estación, así que no hay comparación con el resto del campo. Los tiempos sí son los tuyos.'
    : hayDelta
      ? 'Cuanto más corta la barra, mejor tu puesto. La cifra de la derecha es contra tu nivel de entreno.'
      : 'Cuanto más corta la barra, mejor tu puesto.';
  return (
    <section aria-label="Estaciones" style={bloque}>
      <SubTitulo nota={nota}>Estaciones</SubTitulo>
      <Tarjeta style={{ overflow: 'hidden' }}>
        {filas.map((e, i) => (
          <FilaEstacion key={e.estacion} e={e} i={i} onAbre={onAbre} />
        ))}
      </Tarjeta>
    </section>
  );
}

// ── Ritmo por km ──────────────────────────────────────────────────────────────

const ALTO_GRAFICA = 96;

export function RitmoPorKm({ a }: { a: AnalisisCarrera }) {
  if (a.ritmoPorKm.length === 0) return null;
  const voz = a.ritmoPorKm.map((v) => `kilómetro ${v.km}${v.ritmoS != null ? `, ${reloj(v.ritmoS)}` : ''}, ${PUESTO_RITMO[v.severidad]}`).join('. ');
  return (
    <section aria-label="Ritmo por km" style={bloque}>
      <SubTitulo nota="¿Aguantas el final? Barra más alta, kilómetro más lento.">Ritmo por km</SubTitulo>
      <Tarjeta style={{ padding: '16px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="img" aria-label={voz} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {a.ritmoPorKm.map((v, i) => (
            <span key={v.km} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-fg)', ...TABULAR, whiteSpace: 'nowrap' }}>{v.ritmoS != null ? reloj(v.ritmoS) : ''}</span>
              <span style={{ height: ALTO_GRAFICA, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <span
                  className="cr-barra-y"
                  style={{ '--i': i, width: '100%', height: Math.max(8, Math.round(v.altura * ALTO_GRAFICA)), borderRadius: 5, background: COLOR_SEVERIDAD[v.severidad] } as React.CSSProperties}
                />
              </span>
              <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)', ...TABULAR }}>{v.km}</span>
            </span>
          ))}
        </div>
        {a.caidaRitmoS != null ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: RADIO.fila,
              background: tinte('var(--twin-warning)', 12, 'var(--twin-surface)'),
              border: `1px solid ${velo('var(--twin-warning)', 34)}`,
              ...fuente(600, TAM.suelo, 1.3),
              color: 'var(--twin-fg)',
              textWrap: 'pretty',
            }}
          >
            <span style={{ display: 'inline-flex', color: 'var(--twin-warning)', paddingTop: 1 }}>
              <IcoSube tam={16} />
            </span>
            <span>
              Caída de ritmo en la segunda mitad: <span style={{ ...TABULAR, whiteSpace: 'nowrap' }}>+{a.caidaRitmoS} s/km</span>
            </span>
          </span>
        ) : null}
      </Tarjeta>
    </section>
  );
}

/** El veredicto de cada kilómetro contra el mejor de la carrera, en palabras (para el lector de pantalla). */
const PUESTO_RITMO: Record<Severidad, string> = { better: 'cerca de tu mejor km', slightly_worse: 'algo por detrás', worse: 'claramente más lento' };

// ── Evolución ─────────────────────────────────────────────────────────────────

const ALTO_LINEA = 84;

/**
 * Tu tiempo total en las últimas individuales. Es una LÍNEA con sus puntos, no
 * barras: unas barras que arrancan en cero hacen que 73:10 y 66:52 parezcan casi el
 * mismo tiempo, y esa diferencia (seis minutos) es lo único que el atleta viene a
 * ver. La escala va del más lento al más rápido de la ventana y cada punto lleva su
 * cifra, así que nada se lee sin el número. Mejorar SUBE la línea: arriba, más rápido.
 */
export function Evolucion({ pasadas }: { pasadas: readonly CarreraPasada[] }) {
  const puntos = evolucion(pasadas);
  if (!puntos) return null;
  const tiempos = puntos.map((p) => p.totalS);
  const max = Math.max(...tiempos);
  const min = Math.min(...tiempos);
  const rango = max - min;
  // 0 = arriba = el más rápido de la ventana; 1 = abajo = el más lento; todos iguales, en el centro.
  const yDe = (t: number) => (rango === 0 ? 0.5 : 1 - (max - t) / rango);
  const n = puntos.length;
  const xDe = (i: number) => ((i + 0.5) / n) * 100;
  const ruta = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDe(i).toFixed(2)} ${(6 + yDe(p.totalS) * (100 - 12)).toFixed(2)}`).join(' ');
  const mejora = puntos[0].totalS - puntos[n - 1].totalS;
  const voz = `${puntos.map((p) => `${mesAnio(p.fecha)}, ${relojCarrera(p.totalS)}`).join('. ')}. ${mejora > 0 ? `Has bajado ${reloj(mejora)}` : mejora < 0 ? `Has subido ${reloj(-mejora)}` : 'Igual que la primera'}`;
  return (
    <section aria-label="Evolución" style={bloque}>
      <SubTitulo nota={`Tu tiempo total en ${n === 2 ? 'tus dos' : `tus últimas ${n}`} individuales. Más arriba, más rápido.`}>Evolución</SubTitulo>
      <Tarjeta style={{ padding: '16px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mejora !== 0 ? (
          <Cinta
            icono={
              <span style={{ display: 'inline-flex', color: mejora > 0 ? 'var(--twin-ok)' : 'var(--twin-warning)' }}>
                {mejora > 0 ? <IcoBaja tam={16} /> : <IcoSube tam={16} />}
              </span>
            }
          >
            <span style={TABULAR}>{reloj(Math.abs(mejora))}</span> {mejora > 0 ? 'más rápido' : 'más lento'} que en {mesAnio(puntos[0].fecha)}
          </Cinta>
        ) : null}
        <div role="img" aria-label={voz}>
          <div style={{ display: 'flex' }}>
            {puntos.map((p) => (
              <span key={p.raceId} style={{ flex: '1 1 0', textAlign: 'center', ...fuente(p.ultimo ? 800 : 600, TAM.suelo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>
                {relojCarrera(p.totalS)}
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', height: ALTO_LINEA, margin: '4px 0' }}>
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
              <path d={ruta} fill="none" stroke="var(--twin-hairline-strong)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <path d={ruta} fill="none" stroke="var(--twin-muted)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {puntos.map((p, i) => (
              <span
                key={p.raceId}
                aria-hidden
                style={{
                  position: 'absolute',
                  left: `${xDe(i)}%`,
                  top: `${6 + yDe(p.totalS) * 88}%`,
                  width: p.ultimo ? 18 : 12,
                  height: p.ultimo ? 18 : 12,
                  marginLeft: p.ultimo ? -9 : -6,
                  marginTop: p.ultimo ? -9 : -6,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  background: p.ultimo ? 'var(--twin-accent)' : 'var(--twin-surface)',
                  border: `2.5px solid ${p.ultimo ? 'var(--twin-accent)' : 'var(--twin-muted)'}`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex' }}>
            {puntos.map((p) => (
              <span key={p.raceId} style={{ flex: '1 1 0', textAlign: 'center', ...fuente(600, TAM.suelo, 1.2), color: p.ultimo ? 'var(--twin-fg)' : 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
                {mesAnio(p.fecha)}
              </span>
            ))}
          </div>
        </div>
      </Tarjeta>
    </section>
  );
}

// ── Informe de la IA ──────────────────────────────────────────────────────────

export function Informe({ a }: { a: AnalisisCarrera }) {
  if (!a.informe) return null;
  return (
    <section
      aria-label="Informe de la IA, a priorizar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 18,
        borderRadius: RADIO.tarjeta,
        background: tinte('var(--twin-accent)', 10, 'var(--twin-surface)'),
        border: `1px solid ${velo('var(--twin-accent)', 40)}`,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...fuente(800, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>
        <IcoDiana tam={18} />
        Informe IA · a priorizar
      </span>
      <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{a.informe.resumen}</span>
      {a.informe.grupos.length > 0 ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {a.informe.grupos.map((g) => (
            <span key={g} style={{ minHeight: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: RADIO.pastilla, background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline-strong)', ...fuente(700, TAM.suelo, 1), color: 'var(--twin-fg)' }}>
              {g}
            </span>
          ))}
        </span>
      ) : null}
    </section>
  );
}

// ── Predicho contra real: la puerta ───────────────────────────────────────────

export function PuertaPredichoVsReal({ p, nombre, onAbre }: { p: PredichoVsReal; nombre: string; onAbre: () => void }) {
  const detalle = [
    p.predijimosS != null ? `Predijimos ${relojCarrera(p.predijimosS)}` : null,
    p.hicisteS != null ? `hiciste ${relojCarrera(p.hicisteS)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const precision = p.precisionPct != null ? `Predicción a ${porcentaje(p.precisionPct)}${p.precisionPalabra ? `, ${p.precisionPalabra}` : ''}` : null;
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onAbre}
      aria-label={['Predicho contra real', nombre, detalle, precision, 'Abre la comparación'].filter(Boolean).join('. ')}
      style={{ borderRadius: RADIO.tarjeta }}
    >
      <Tarjeta style={{ minHeight: 76, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span aria-hidden style={{ width: 44, height: 44, borderRadius: 14, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline-strong)', color: 'var(--twin-fg)' }}>
          <IcoDiana tam={24} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>Predicho contra real</span>
          {detalle ? <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', ...TABULAR }}>{detalle}</span> : null}
          {precision ? <span style={{ ...fuente(700, TAM.suelo, 1.3), color: 'var(--twin-fg)', ...TABULAR }}>{precision}</span> : null}
        </span>
        <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
          <IcoChevron tam={18} />
        </span>
      </Tarjeta>
    </button>
  );
}

// ── En frío y en error ────────────────────────────────────────────────────────

/** El esqueleto del análisis: tres bloques con la forma de los reales (las estaciones, el ritmo). */
export function EsqueletoAnalisis() {
  return (
    <div aria-busy aria-label="Cargando el análisis de tu carrera" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <span style={bloque}>
        <Esqueleto ancho={140} alto={22} radio={7} />
        <Tarjeta>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} style={{ minHeight: 56, padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Esqueleto ancho={130} alto={17} radio={6} />
                <Esqueleto ancho={48} alto={17} radio={6} />
              </span>
              <Esqueleto alto={8} radio={4} />
            </span>
          ))}
        </Tarjeta>
      </span>
      <span style={bloque}>
        <Esqueleto ancho={120} alto={22} radio={7} />
        <Tarjeta style={{ padding: '16px 14px', height: 168, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {[70, 76, 80, 84, 88, 92, 96, 100].map((h, i) => (
            <Esqueleto key={i} ancho="100%" alto={h * 0.9} radio={5} />
          ))}
        </Tarjeta>
      </span>
    </div>
  );
}

/** El análisis falló: se dice y se reintenta. Un fallo no es un vacío. */
export function AnalisisConError({ onReintentar }: { onReintentar: () => void }) {
  return (
    <Aviso salida={<BotonTexto tono="tinta" onClick={onReintentar}>Reintentar</BotonTexto>}>
      No pudimos cargar el análisis de tu carrera. El historial de abajo sí está.
    </Aviso>
  );
}
