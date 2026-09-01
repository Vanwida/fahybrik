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

/**
 * EL EJE LO FIJA LO QUE SE CORRIÓ. **Andar y parar no es correr.**
 *
 * Bajar andando de una cuesta son 11:40/km. Metido en el eje junto a unas
 * subidas de 4:30 aplasta las ocho repeticiones contra el borde de arriba, y la
 * curva deja de leerse justo donde el sujeto es cuánto se cayó de la primera a
 * la última. Una curva que no se puede leer no cumple su función, que es hacer
 * VISIBLE el veredicto en vez de afirmarlo.
 *
 * ESTA REGLA SE HA AFINADO DOS VECES, y las dos versiones anteriores suenan
 * razonables — por eso queda escrito, para que nadie las reintroduzca:
 *
 *  1. «el eje sirve al TRABAJO» → rompía el ①: el calentamiento se salía y seis
 *     picos que nacían de un rodaje se quedaban en mesetas flotando.
 *  2. «al trabajo y lo CONTINUO; la recuperación entra si cabe» → mejor, pero el
 *     criterio era el PAPEL del tramo, que solo estaba correlacionado con lo que
 *     de verdad importa. Con recuperación en trote —que es lo normal en carrera—
 *     el ① se salvaba por dos segundos y el ⑧ de cinta ya salía roto.
 *  3. La buena: el criterio es la LOCOMOCIÓN. Un trote a 6:10 entre series a
 *     3:30 es correr, es parte de la misma lectura y de hecho es la explicación
 *     de que la quinta se caiga: va dentro. Andar es otra forma de moverse, y
 *     parar ya era un hueco.
 *
 * Sale de `modo`, que ya existe en el modelo: no hay ningún umbral que ajustar.
 * Lo que se queda fuera no se recorta en silencio — se dibuja a puntos, pegado
 * al suelo del eje, y la leyenda lo dice.
 */
function noSeCorrio(repeticiones: Repeticion[]): (t: number) => boolean {
  const ventanas = repeticiones
    .filter((r) => r.papel === 'recuperacion' && (r.modo === 'andando' || r.modo === 'parado'))
    .map((r) => [r.inicioS, r.inicioS + r.duracionS] as const);
  return (t) => ventanas.some(([desde, hasta]) => t >= desde && t < hasta);
}

/**
 * El dominio del eje del ritmo, en s/km. Vive suelto y exportado porque es la
 * regla de arriba hecha número: así se prueba sin montar un componente y así no
 * puede volver a afinarse por accidente sin que salte un test.
 *
 * Se calcula sobre la señal CRUDA a propósito — ver el comentario del llamador.
 */
export function dominioDelRitmo(
  ritmo: Muestra[],
  repeticiones: Repeticion[],
  banda: Lectura['banda'],
): { min: number; max: number } {
  const andandoOParado = noSeCorrio(repeticiones);
  const corrido = ritmo.filter((m) => !andandoOParado(m.t));
  // EL SUELO: si no se corrió NADA —una caminata, una vuelta a la calma andada
  // entera— andar deja de ser la excepción porque es lo único que hay, y manda.
  // Sin esto el eje se queda sin nada que lo fije y la curva sale degenerada.
  const mandan = corrido.length > 1 ? corrido : ritmo;
  return extremos(
    mandan.map((m) => m.v),
    banda?.eje === 'ritmo' ? [banda.rapidoSkm, banda.lentoSkm] : [],
  );
}

/** Un trazo partido en corridas de «dentro del eje» y «se sale por abajo». */
interface Corrida {
  puntos: Muestra[];
  fuera: boolean;
}

function partirPorEscala(trozo: Muestra[], suelo: number): Corrida[] {
  const corridas: Corrida[] = [];
  for (const m of trozo) {
    const fuera = m.v > suelo;
    const ultima = corridas[corridas.length - 1];
    if (ultima && ultima.fuera === fuera) {
      ultima.puntos.push(m);
      continue;
    }
    // El punto de cruce entra en las DOS corridas: sin él la línea se rompe
    // justo donde el lector necesita ver que se va de escala.
    corridas.push({ fuera, puntos: ultima ? [ultima.puntos[ultima.puntos.length - 1]!, m] : [m] });
  }
  return corridas.filter((c) => c.puntos.length > 1);
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
  // Sobre la señal CRUDA y no la suavizada: la media móvil cruza la frontera de
  // un tramo, así que la última muestra de una subida ya lleva dentro los
  // 11:40/km del paseo que viene detrás. Filtrando la suavizada, lo andado se
  // colaba por la puerta de atrás y el eje seguía estirado. La escala es
  // propiedad del DATO; el suavizado, solo del dibujo.
  const escalaRitmo = dominioDelRitmo(ritmo, repeticiones, banda);
  const escalaPulso = extremos(
    trozosPulso.flat().map((m) => m.v),
    banda?.eje === 'pulso' ? [banda.minPpm, banda.maxPpm] : [],
  );

  // Ritmo: menos segundos = más rápido = más arriba. Pulso: más ppm = más arriba.
  // Lo más lento que cabe queda PINCHADO en el suelo del eje: se dibuja a puntos,
  // así que no finge un valor — dice «por aquí abajo, y más lento».
  const yRitmo = (v: number) =>
    pt(CAJA.y + (Math.min(v, escalaRitmo.max) - escalaRitmo.min) / (escalaRitmo.max - escalaRitmo.min) * CAJA.alto);
  const yPulso = (v: number) =>
    pt(CAJA.y + CAJA.alto - ((v - escalaPulso.min) / (escalaPulso.max - escalaPulso.min)) * CAJA.alto);

  const camino = (trozo: Muestra[], y: (v: number) => number) =>
    trozo.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m.t)},${y(m.v)}`).join(' ');

  const trabajos = repeticiones.filter((r) => r.papel === 'trabajo');
  // Solo las que TIENEN ritmo: sobre un parado no hay franja que dibujar.
  const recuperaciones = repeticiones.filter((r) => r.papel === 'recuperacion' && r.ritmoSkm != null);
  const conNumeros = trabajos.length > 0 && trabajos.length <= MAX_NUMEROS;
  const marcasKm = kilometros.length > 0 && kilometros.length <= MAX_MARCAS_KM ? kilometros : [];
  // ¿Hubo algo más lento de lo que cabe? Entonces hay que DECIRLO, y la leyenda
  // es donde se dice. Sin esto, la línea de puntos sería un adorno sin explicar.
  const seSale = trozosRitmo.some((trozo) => trozo.some((m) => m.v > escalaRitmo.max));

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

        {/*
         * Y la del TROTE, cuando el coach también lo prescribió.
         *
         * Dos corredores verdes en el mismo dibujo suenan a confusión, y no lo
         * son: viven en ventanas de tiempo DISTINTAS —donde hay serie no hay
         * trote y al revés—, así que en cualquier vertical hay como mucho una.
         * Lo único que se toca es el peso: la del trabajo manda y la del trote
         * va más apagada, porque el sujeto de la sesión sigue siendo el trabajo.
         */}
        {lectura.bandaRecuperacion && recuperaciones.length > 0 && (
          <FranjaObjetivo
            tramos={recuperaciones.map((r) => [x(r.inicioS), x(r.inicioS + r.duracionS)])}
            arriba={yRitmo(lectura.bandaRecuperacion.rapidoSkm)}
            abajo={yRitmo(lectura.bandaRecuperacion.lentoSkm)}
            tono="var(--twin-ok)"
            secundaria
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

        {/* El ritmo: el sujeto del dibujo. Lo que se sale del eje por abajo va a
            puntos y apagado, pegado al suelo: sigue ahí y se ve que se va. */}
        {trozosRitmo.flatMap((trozo, i) =>
          partirPorEscala(trozo, escalaRitmo.max).map((corrida, j) => (
            <path
              key={`r${i}-${j}`}
              d={camino(corrida.puntos, yRitmo)}
              fill="none"
              stroke="var(--twin-fg)"
              strokeWidth={corrida.fuera ? 1.4 : 1.9}
              strokeOpacity={corrida.fuera ? 0.45 : 1}
              strokeDasharray={corrida.fuera ? '2 3' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )),
        )}

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
      <Leyenda banda={lectura.banda} seSale={seSale} />
    </div>
  );
}

/** La franja, dibujada tramo a tramo: donde no se pidió nada, no hay franja. */
function FranjaObjetivo({
  tramos,
  arriba,
  abajo,
  tono,
  secundaria = false,
}: {
  tramos: Array<[number, number]>;
  arriba: number;
  abajo: number;
  tono: string;
  /** La del trote: mismo color, menos peso. El trabajo manda. */
  secundaria?: boolean;
}) {
  const opacidad = secundaria ? 0.5 : 1;
  return (
    <>
      {tramos.map(([x1, x2], i) => (
        <g key={i} opacity={opacidad}>
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
function Leyenda({ banda, seSale }: { banda: Lectura['banda']; seSale: boolean }) {
  const partes = ['Ritmo por kilómetro, arriba más rápido', 'el pulso es la línea fina'];
  if (banda?.eje === 'ritmo') partes.push('la franja es lo que te pidieron');
  if (banda?.eje === 'pulso') partes.push(`la franja es tu Z${banda.zona}`);
  // Se dice en cristiano: los puntos de abajo no son un adorno ni un dato roto.
  if (seSale) partes.push('lo punteado de abajo iba más lento de lo que cabe en el eje');
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
