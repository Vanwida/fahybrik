'use client';

// LA CURVA — lo que convierte el veredicto en algo VISIBLE en vez de afirmado.
//
// Un «5 de 6 en banda» es una cifra que hay que creerse. La misma sesión con la
// franja de lo pedido dibujada y los tramos sombreados encima se ENTIENDE: se ve
// entrar y salir de la banda, y se ve dónde. Es lo único de esta pantalla que no
// puede sustituirse por texto.
//
// LAS TRES LEYES, iguales que en la pantalla del atleta:
//
// 1 · ARRIBA ES MÁS RÁPIDO. El ritmo es un inverso, así que dibujarlo tal cual
//     pondría la serie lenta en lo alto. «Más rápido, más alto» es la única
//     lectura que no hay que explicar.
// 2 · LA FRANJA SE DIBUJA SOLO SOBRE LOS TRAMOS QUE LA PIDIERON. Extenderla a
//     toda la sesión diría que el calentamiento también se juzgó contra ella.
// 3 · UN HUECO ES UN HUECO. La línea se PARTE donde la señal faltó, y los dos
//     minutos parado de una serie son un hueco legítimo: no hay ritmo cuando no
//     te mueves. Rellenar para tener una línea bonita es fabricar dato.
//
// SE MIDE EL ANCHO REAL Y SE REDIBUJA. Un `viewBox` escalado deformaría el grosor
// del trazo y el tamaño del texto en cada rompimiento; midiendo, el gráfico es
// nítido a 390 y a 1440 con las mismas reglas.

import { useEffect, useRef, useState } from 'react';
import type { KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import { dominioDelRitmo, type Muestra } from './eje';
import type { TramoLeido } from './lectura';
import { reloj } from './voz';

/** Hueco máximo entre dos muestras para seguir dibujando línea entre ellas.
 *  MECANISMO, no método: espeja `MAX_INTERPOLATION_GAP_S` de `km-splits.ts`. */
const HUECO_QUE_PARTE_LA_CURVA_S = 30;

/** Por encima de esto los números de tramo se amontonan y estorban. */
const MAX_NUMEROS = 12;
/** Ídem con las marcas de kilómetro. */
const MAX_MARCAS_KM = 20;

const ALTO_MIN = 150;
const ALTO_MAX = 220;
const MARGEN = { arriba: 10, abajo: 20, izquierda: 40, derecha: 8 };

/** Serie tal y como la sirve el cable: dos arrays paralelos, cadencia variable. */
export interface SerieDisplay {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

function aMuestras(s: SerieDisplay | null | undefined): Muestra[] {
  if (!s) return [];
  const n = Math.min(s.offsets_s.length, s.values.length);
  const out: Muestra[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = s.offsets_s[i]!;
    const v = s.values[i]!;
    if (Number.isFinite(t) && Number.isFinite(v)) out.push({ t, v });
  }
  return out;
}

/** Corta la serie en tramos contiguos: un salto grande NO se une con una línea. */
function trozosContiguos(muestras: Muestra[]): Muestra[][] {
  const trozos: Muestra[][] = [];
  let actual: Muestra[] = [];
  for (const m of muestras) {
    const anterior = actual[actual.length - 1];
    if (anterior && m.t - anterior.t > HUECO_QUE_PARTE_LA_CURVA_S) {
      trozos.push(actual);
      actual = [];
    }
    actual.push(m);
  }
  if (actual.length > 0) trozos.push(actual);
  return trozos.filter((t) => t.length > 1);
}

function extremos(valores: number[]): { min: number; max: number } | null {
  if (valores.length === 0) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const margen = (max - min) * 0.14 || 1;
  return { min: min - margen, max: max + margen };
}

/**
 * Los instantes en que se cruzó cada kilómetro, acumulando las duraciones de los
 * splits. Se para en el PRIMER kilómetro sin duración: a partir de ahí la suma
 * ya no sabe dónde está, y una marca puesta a ojo es peor que ninguna marca.
 */
function crucesDeKilometro(kilometros: KmSplit[]): number[] {
  const cruces: number[] = [];
  let t = 0;
  for (const km of kilometros) {
    if (km.duration_s == null) break;
    t += km.duration_s;
    if (!km.partial) cruces.push(t);
  }
  return cruces;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function Curva({
  ritmo,
  pulso,
  tramos,
  kilometros,
  troceado,
  situables,
}: {
  ritmo: SerieDisplay | null;
  pulso: SerieDisplay | null;
  tramos: TramoLeido[];
  kilometros: KmSplit[];
  troceado: 'tramos' | 'kilometros' | 'ninguno';
  /** Los tramos se pueden situar en el eje de tiempo. Sin esto no hay sombras,
   *  ni franja, ni números: se dibuja la señal y se dice qué falta. */
  situables: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    setAncho(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const muestrasRitmo = aMuestras(ritmo);
  const muestrasPulso = aMuestras(pulso);
  const trozosRitmo = trozosContiguos(muestrasRitmo);
  const trozosPulso = trozosContiguos(muestrasPulso);

  const trabajos = situables
    ? tramos.filter((t) => t.papel === 'trabajo' && t.inicioS != null && t.duracionS != null)
    : [];

  // La franja se dibuja tramo a tramo, cada uno con SU banda: una pirámide pide
  // ritmos distintos por escalón y una franja única mentiría sobre casi todos.
  const conBanda = trabajos.filter((t) => t.banda != null);
  const bandaParaElEje = conBanda[0]?.banda ?? null;

  const alto = Math.round(Math.min(ALTO_MAX, Math.max(ALTO_MIN, ancho * 0.28)));
  const caja = {
    x: MARGEN.izquierda,
    y: MARGEN.arriba,
    w: ancho - MARGEN.izquierda - MARGEN.derecha,
    h: alto - MARGEN.arriba - MARGEN.abajo,
  };

  const duracion = Math.max(
    muestrasRitmo[muestrasRitmo.length - 1]?.t ?? 0,
    muestrasPulso[muestrasPulso.length - 1]?.t ?? 0,
    ...trabajos.map((t) => t.inicioS! + t.duracionS!),
  );

  const escalaRitmo = dominioDelRitmo(muestrasRitmo, situables ? tramos : [], bandaParaElEje);
  const escalaPulso = extremos(trozosPulso.flat().map((m) => m.v));

  if (trozosRitmo.length === 0 && trozosPulso.length === 0) return null;

  const listo = ancho > 80 && caja.w > 60 && duracion > 0 && escalaRitmo != null;

  const x = (t: number) => r2(caja.x + (t / duracion) * caja.w);
  // Menos segundos por kilómetro = más rápido = más arriba.
  const yRitmo = (v: number) =>
    r2(caja.y + ((v - escalaRitmo!.min) / (escalaRitmo!.max - escalaRitmo!.min)) * caja.h);
  const yPulso = (v: number) =>
    escalaPulso == null
      ? caja.y + caja.h
      : r2(caja.y + caja.h - ((v - escalaPulso.min) / (escalaPulso.max - escalaPulso.min)) * caja.h);

  const camino = (trozo: Muestra[], y: (v: number) => number) =>
    trozo.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m.t)},${y(m.v)}`).join(' ');

  const marcasKm =
    troceado === 'kilometros'
      ? crucesDeKilometro(kilometros).filter((t) => t <= duracion).slice(0, MAX_MARCAS_KM)
      : [];
  const conNumeros = trabajos.length > 0 && trabajos.length <= MAX_NUMEROS;

  const leyenda = [
    'Ritmo por kilómetro, arriba más rápido',
    trozosPulso.length > 0 ? 'el pulso es la línea fina' : null,
    conBanda.length > 0 ? 'la franja es lo que le pediste' : null,
    !situables && tramos.length > 0
      ? 'los tramos no se pueden situar sobre la curva todavía, así que no van sombreados'
      : null,
  ].filter((p): p is string => p != null);

  return (
    <div ref={hostRef} className="w-full">
      {listo ? (
        <svg
          role="img"
          aria-label={`Ritmo y pulso a lo largo de la carrera${conBanda.length > 0 ? ', con la banda pedida y los tramos de trabajo sombreados' : ''}`}
          width={ancho}
          height={alto}
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{ display: 'block' }}
        >
          {/* Las sombras de los tramos, DEBAJO de todo: son el suelo de la lectura. */}
          {trabajos.map((t) => (
            <rect
              key={`s${t.position}`}
              x={x(t.inicioS!)}
              y={caja.y}
              width={r2(Math.max(1.5, x(t.inicioS! + t.duracionS!) - x(t.inicioS!)))}
              height={caja.h}
              fill="color-mix(in srgb, var(--v2-fg) 7%, transparent)"
            />
          ))}

          {/* La franja de lo pedido, sobre el tramo que la pidió y solo ahí. */}
          {conBanda.map((t) => {
            const x1 = x(t.inicioS!);
            const x2 = x(t.inicioS! + t.duracionS!);
            const arriba = yRitmo(t.banda!.rapidoSkm);
            const abajo = yRitmo(t.banda!.lentoSkm);
            return (
              <g key={`b${t.position}`}>
                <rect
                  x={x1}
                  y={r2(Math.min(arriba, abajo))}
                  width={r2(Math.max(1.5, x2 - x1))}
                  height={r2(Math.abs(abajo - arriba))}
                  fill="color-mix(in srgb, var(--v2-ok) 13%, transparent)"
                />
                {[arriba, abajo].map((yy, i) => (
                  <line
                    key={i}
                    x1={x1}
                    y1={r2(yy)}
                    x2={x2}
                    y2={r2(yy)}
                    stroke="var(--v2-ok)"
                    strokeWidth={1}
                    strokeOpacity={0.7}
                    strokeDasharray="3 3"
                  />
                ))}
              </g>
            );
          })}

          {/* Los kilómetros, cuando son el troceado que toca. */}
          {marcasKm.map((t, i) => (
            <g key={`km${i}`}>
              <line
                x1={x(t)}
                y1={caja.y}
                x2={x(t)}
                y2={caja.y + caja.h}
                stroke="var(--v2-border)"
                strokeWidth={1}
              />
              <text x={x(t)} y={alto - 6} textAnchor="middle" className="fill-[var(--v2-faint)] font-mono text-[9px]">
                {i + 1}
              </text>
            </g>
          ))}

          {/* El pulso: segunda serie, fina y tenue. Nunca compite con el ritmo. */}
          {trozosPulso.map((trozo, i) => (
            <path
              key={`p${i}`}
              d={camino(trozo, yPulso)}
              fill="none"
              stroke="var(--v2-muted)"
              strokeWidth={1.1}
              strokeOpacity={0.5}
              strokeLinejoin="round"
            />
          ))}

          {/* El ritmo: el sujeto del dibujo. */}
          {trozosRitmo.map((trozo, i) => (
            <path
              key={`r${i}`}
              d={camino(trozo, yRitmo)}
              fill="none"
              stroke="var(--v2-fg)"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Tres marcas en el eje del ritmo. La unidad se dice una vez, abajo. */}
          {[escalaRitmo!.min, (escalaRitmo!.min + escalaRitmo!.max) / 2, escalaRitmo!.max].map((v, i) => (
            <text
              key={`y${i}`}
              x={MARGEN.izquierda - 7}
              y={r2(yRitmo(v) + 3.5)}
              textAnchor="end"
              className="fill-[var(--v2-faint)] font-mono text-[9px]"
            >
              {reloj(v)}
            </text>
          ))}

          {conNumeros &&
            trabajos.map((t) => (
              <text
                key={`n${t.position}`}
                x={r2((x(t.inicioS!) + x(t.inicioS! + t.duracionS!)) / 2)}
                y={alto - 6}
                textAnchor="middle"
                className="fill-[var(--v2-faint)] font-mono text-[9px]"
              >
                {t.n}
              </text>
            ))}
        </svg>
      ) : (
        // Reserva el alto mientras se mide, para que la tarjeta no dé un salto.
        <div style={{ height: ALTO_MIN }} />
      )}
      <p className="mt-2 text-center text-[11px] leading-snug text-[color:var(--v2-faint)]">{leyenda.join(' · ')}</p>
    </div>
  );
}
