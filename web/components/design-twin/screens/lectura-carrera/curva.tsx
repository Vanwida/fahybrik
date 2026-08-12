'use client';

// LA CURVA — lo que convierte el veredicto en algo VISIBLE en vez de afirmado.
//
// Un «5 de 6 dentro» es una cifra que hay que creerse. La misma sesión con la
// franja de lo pedido dibujada y las seis series sombreadas encima se ENTIENDE:
// se ve entrar y salir de la banda, y se ve dónde. Es lo único de esta pantalla
// que no puede sustituirse por texto.
//
// TRES DECISIONES QUE NO SON DE ESTILO:
//
// 1 · ARRIBA ES MÁS RÁPIDO. El ritmo es un inverso, así que dibujarlo tal cual
//     pone la serie lenta en lo alto. Es la misma ley que el peine de
//     `resumen-carrera` ya sigue: «más rápido, más alto» es la única lectura que
//     no hay que explicar.
//
// 2 · LA FRANJA SE DIBUJA SOBRE EL EJE DONDE VIVE SU OBJETIVO. Una banda de
//     ritmo va sobre el ritmo; un objetivo de zona va sobre el PULSO, que es la
//     señal que lo mide. Pintar una zona sobre el eje del ritmo sería enseñar
//     una comparación que no se ha hecho.
//
// 3 · UN HUECO ES UN HUECO. La línea se PARTE donde la señal faltó, y las dos
//     minutos parado de una serie son un hueco legítimo: no hay ritmo cuando no
//     te mueves. Rellenar para tener una línea bonita es fabricar dato
//     (docs/DECISIONS.md, 11-ago).
//
// Suavizado: media móvil corta SOLO para dibujar, y nunca cruzando un hueco. La
// entrada de DECISIONS lo autoriza expresamente — se guarda el negativo y «quien
// lee suaviza como necesite» —; lo que no vale es derivar una cifra de aquí.

import type { CSSProperties } from 'react';
import { ANCHO_UTIL_PT } from '../../kit-vivo';
import { reloj } from '../../kit-composicion/formato';
import { HUECO_QUE_PARTE_LA_CURVA_S, type Lectura, type Muestra, type Repeticion } from './modelo';

const ALTO = 158;
const MARGEN = { arriba: 10, abajo: 18, izquierda: 34, derecha: 6 };
const CAJA = {
  x: MARGEN.izquierda,
  y: MARGEN.arriba,
  ancho: ANCHO_UTIL_PT - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
};

/** Ventana de la media móvil, en muestras. 5 × 5 s = 25 s: quita el temblor del
 *  GPS y deja intacto el escalón entre una serie y su recuperación. */
const VENTANA = 5;

/** Por encima de esto, los números de repetición se amontonan y estorban. */
const MAX_NUMEROS = 10;
/** Ídem con las marcas de kilómetro. */
const MAX_MARCAS_KM = 15;

/**
 * Toda coordenada del dibujo pasa por aquí, y NO es cosmética: el servidor y el
 * cliente escriben `21.715382023356458` y `21.71538202335646` para el mismo
 * cálculo, y React canta un fallo de hidratación por cada punto. Con dos
 * decimales sobre un lienzo de 378 pt la coordenada es exacta en los dos lados
 * y sobra precisión: el ojo no distingue una centésima de punto.
 */
const pt = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Señal → trazos, sin cruzar ningún hueco
// ---------------------------------------------------------------------------

/** Corta la serie en tramos contiguos. Un salto grande NO se une con una línea. */
function tramosContiguos(muestras: Muestra[]): Muestra[][] {
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

function suavizar(trozo: Muestra[]): Muestra[] {
  return trozo.map((m, i) => {
    const desde = Math.max(0, i - Math.floor(VENTANA / 2));
    const hasta = Math.min(trozo.length, desde + VENTANA);
    const v = trozo.slice(desde, hasta).reduce((a, x) => a + x.v, 0) / (hasta - desde);
    return { t: m.t, v };
  });
}

function extremos(valores: number[], extra: number[]): { min: number; max: number } {
  const todos = [...valores, ...extra];
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const margen = (max - min) * 0.12 || 1;
  return { min: min - margen, max: max + margen };
}

// ---------------------------------------------------------------------------
// La pieza
// ---------------------------------------------------------------------------

export function Curva({
  ritmo,
  pulso,
  repeticiones,
  lectura,
  kilometros,
  descripcion,
}: {
  ritmo: Muestra[];
  pulso: Muestra[];
  repeticiones: Repeticion[];
  lectura: Lectura;
  /** Instantes (s) en que se cruzó cada kilómetro; vacío si el troceado no es por km. */
  kilometros: number[];
  /** La lectura en palabras, para quien no ve el dibujo. */
  descripcion: string;
}) {
  const trozosRitmo = tramosContiguos(ritmo).map(suavizar);
  const trozosPulso = tramosContiguos(pulso).map(suavizar);
  if (trozosRitmo.length === 0) return null;

  const duracion = Math.max(
    ritmo[ritmo.length - 1]?.t ?? 0,
    pulso[pulso.length - 1]?.t ?? 0,
    ...repeticiones.map((r) => r.inicioS + r.duracionS),
  );
  const x = (t: number) => pt(CAJA.x + (t / duracion) * CAJA.ancho);

  const banda = lectura.banda;
  const escalaRitmo = extremos(
    trozosRitmo.flat().map((m) => m.v),
    banda?.eje === 'ritmo' ? [banda.rapidoSkm, banda.lentoSkm] : [],
  );
  const escalaPulso = extremos(
    trozosPulso.flat().map((m) => m.v),
    banda?.eje === 'pulso' ? [banda.minPpm, banda.maxPpm] : [],
  );

  // Ritmo: menos segundos = más rápido = más arriba. Pulso: más ppm = más arriba.
  const yRitmo = (v: number) => pt(CAJA.y + ((v - escalaRitmo.min) / (escalaRitmo.max - escalaRitmo.min)) * CAJA.alto);
  const yPulso = (v: number) =>
    pt(CAJA.y + CAJA.alto - ((v - escalaPulso.min) / (escalaPulso.max - escalaPulso.min)) * CAJA.alto);

  const camino = (trozo: Muestra[], y: (v: number) => number) =>
    trozo.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m.t)},${y(m.v)}`).join(' ');

  const trabajos = repeticiones.filter((r) => r.papel === 'trabajo');
  const conNumeros = trabajos.length > 0 && trabajos.length <= MAX_NUMEROS;
  const marcasKm = kilometros.length > 0 && kilometros.length <= MAX_MARCAS_KM ? kilometros : [];

  return (
    <div>
      <svg
        role="img"
        aria-label={descripcion}
        viewBox={`0 0 ${ANCHO_UTIL_PT} ${ALTO}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Las sombras de los tramos, DEBAJO de todo: son el suelo de la lectura. */}
        {trabajos.map((r) => (
          <rect
            key={`t${r.inicioS}`}
            x={x(r.inicioS)}
            y={CAJA.y}
            width={pt(Math.max(1.5, x(r.inicioS + r.duracionS) - x(r.inicioS)))}
            height={CAJA.alto}
            fill="color-mix(in srgb, var(--twin-fg) 8%, transparent)"
          />
        ))}

        {/* La franja de lo pedido, sobre el eje donde vive su objetivo. */}
        {banda?.eje === 'ritmo' && (
          <FranjaObjetivo
            tramos={trabajos.length > 0 ? trabajos.map((r) => [x(r.inicioS), x(r.inicioS + r.duracionS)]) : [[CAJA.x, CAJA.x + CAJA.ancho]]}
            arriba={yRitmo(banda.rapidoSkm)}
            abajo={yRitmo(banda.lentoSkm)}
            tono="var(--twin-ok)"
          />
        )}
        {banda?.eje === 'pulso' && (
          <FranjaObjetivo
            tramos={[[CAJA.x, CAJA.x + CAJA.ancho]]}
            arriba={yPulso(banda.maxPpm)}
            abajo={yPulso(banda.minPpm)}
            tono={`var(--twin-z${banda.zona})`}
          />
        )}

        {/* Los kilómetros, cuando son el troceado que toca. */}
        {marcasKm.map((t, i) => (
          <g key={`km${i}`}>
            <line x1={x(t)} y1={CAJA.y} x2={x(t)} y2={CAJA.y + CAJA.alto} stroke="var(--twin-hairline)" strokeWidth={1} />
            <text x={x(t)} y={ALTO - 6} textAnchor="middle" style={ESTILO_MICRO}>
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
            stroke="var(--twin-muted)"
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
            stroke="var(--twin-fg)"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* El eje del ritmo: tres marcas, ni una más. La unidad NO se repite en
            cada una — «3:25/km» son 38 pt sobre un carril de 34 y la unidad se
            dice una sola vez, en la línea de abajo. */}
        {[escalaRitmo.min, (escalaRitmo.min + escalaRitmo.max) / 2, escalaRitmo.max].map((v, i) => (
          <text key={`y${i}`} x={MARGEN.izquierda - 6} y={pt(yRitmo(v) + 3)} textAnchor="end" style={ESTILO_MICRO}>
            {reloj(v)}
          </text>
        ))}

        {conNumeros &&
          trabajos.map((r) => (
            <text
              key={`n${r.inicioS}`}
              x={pt((x(r.inicioS) + x(r.inicioS + r.duracionS)) / 2)}
              y={ALTO - 6}
              textAnchor="middle"
              style={ESTILO_MICRO}
            >
              {r.n}
            </text>
          ))}
      </svg>
      <Leyenda banda={lectura.banda} />
    </div>
  );
}

/** La franja, dibujada tramo a tramo: donde no se pidió nada, no hay franja. */
function FranjaObjetivo({
  tramos,
  arriba,
  abajo,
  tono,
}: {
  tramos: Array<[number, number]>;
  arriba: number;
  abajo: number;
  tono: string;
}) {
  return (
    <>
      {tramos.map(([x1, x2], i) => (
        <g key={i}>
          {/* Relleno bajo: cuando el atleta clava la sesión entera la franja se
              come casi todo el dibujo, y a 20% el gráfico se convierte en una
              mancha verde. El borde discontinuo es el que dice dónde está. */}
          <rect
            x={x1}
            y={pt(Math.min(arriba, abajo))}
            width={pt(Math.max(1.5, x2 - x1))}
            height={pt(Math.abs(abajo - arriba))}
            fill={`color-mix(in srgb, ${tono} 13%, transparent)`}
          />
          <line x1={x1} y1={pt(arriba)} x2={x2} y2={pt(arriba)} stroke={tono} strokeWidth={1} strokeOpacity={0.7} strokeDasharray="3 3" />
          <line x1={x1} y1={pt(abajo)} x2={x2} y2={pt(abajo)} stroke={tono} strokeWidth={1} strokeOpacity={0.7} strokeDasharray="3 3" />
        </g>
      ))}
    </>
  );
}

const ESTILO_MICRO: CSSProperties = {
  font: '600 9px var(--twin-font-mono)',
  fill: 'var(--twin-faint)',
  fontVariantNumeric: 'tabular-nums',
};

/** Qué se está mirando, en una línea y sin una sola palabra técnica. */
function Leyenda({ banda }: { banda: Lectura['banda'] }) {
  const partes = ['Ritmo por kilómetro, arriba más rápido', 'el pulso es la línea fina'];
  if (banda?.eje === 'ritmo') partes.push('la franja es lo que te pidieron');
  if (banda?.eje === 'pulso') partes.push(`la franja es tu Z${banda.zona}`);
  return (
    <span
      style={{
        display: 'block',
        marginTop: 6,
        textAlign: 'center',
        font: '500 10.5px/1.35 var(--twin-font-sans)',
        color: 'var(--twin-faint)',
      }}
    >
      {partes.join(' · ')}
    </span>
  );
}
