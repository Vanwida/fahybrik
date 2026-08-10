'use client';

// EL CONTADOR — la misma lista, con el cursor abierto.
//
// No es una pantalla nueva ni otra metáfora: es la lista de rondas colapsada
// sobre su cursor. Arriba la que acabas de cerrar (tachada, con lo que te
// costó), en el numeral la que haces, abajo la que viene. El atleta que venía
// de un WOD de cinco rondas reconoce lo mismo — no reencuadra (§10.3).
//
// LO QUE EL COLAPSO GANA, y es lo que lo justifica: una lista de doce rondas
// escribe el mismo trabajo doce veces. Escrito UNA vez, cabe grande, debajo del
// número, que es donde el §10.6 dice que va lo que de verdad haces. La lista
// gastaba 681 pt en repetirse; el contador gasta lo mismo con cuatro rondas que
// con treinta.
//
// POR QUÉ EL SUJETO ES LA CUENTA Y NO EL TRABAJO. Con cinco rondas siempre
// sabes por dónde vas. Con doce, no: es exactamente el dato que se te cae de la
// cabeza mientras sudas, y por eso en el box la gente mueve discos por el suelo
// para acordarse. Cuando el trabajo es idéntico en todas las rondas, el número
// pasa a gobernar la pantalla y el trabajo baja a segundo (§10.6). Con pocas
// rondas manda el trabajo y de esto no hace falta nada.

import { useCallback, useEffect, useRef } from 'react';
import { reloj } from '../../datos-reales';
import { EtiquetaSujeto, Numeral } from '../../kit-vivo';
import { Label, Mono } from '../../kit';
import { RONDAS_MAX_HILO, type Metcon, lineaDe } from './data';

/** Lo que tarda un mantenido en contar como mantenido, igual que en iOS. */
const MANTENIDO_MS = 500;

// ---------------------------------------------------------------------------
// El sujeto — la cuenta, el trabajo y las dos rondas insinuadas
// ---------------------------------------------------------------------------

/**
 * La ronda anterior, insinuada y tachada.
 *
 * Se mantiene pulsada para deshacerla, que es el mismo gesto que la lista de
 * hoy (`StrikeList` deshace la última con un `LongPressGesture`). Colapsar la
 * lista no puede llevarse por delante lo que la lista sabía hacer: si el
 * contador no dejara deshacer, el rediseño estaría quitando una función y
 * llamándolo mejora.
 */
function RondaAnterior({ indice, parcialS, onDeshacer }: { indice: number; parcialS: number; onDeshacer: () => void }) {
  const temporizador = useRef<number | null>(null);

  const soltar = useCallback(() => {
    if (temporizador.current != null) {
      window.clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  // El temporizador tiene que morir con el componente: si la escena se remonta
  // a mitad de un mantenido, el deshacer no puede dispararse sobre el estado
  // nuevo.
  useEffect(() => soltar, [soltar]);

  const agarrar = useCallback(() => {
    soltar();
    temporizador.current = window.setTimeout(onDeshacer, MANTENIDO_MS);
  }, [onDeshacer, soltar]);

  return (
    <button
      type="button"
      onPointerDown={agarrar}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      aria-label={`Ronda ${indice}, cerrada en ${reloj(parcialS)}. Mantén pulsado para deshacerla.`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '3px 10px',
        border: 0,
        borderRadius: 999,
        background: 'transparent',
        cursor: 'pointer',
        // Táctil de 44 pt sin ocupar 44 de dibujo: el área crece hacia fuera.
        margin: -6,
        font: 'inherit',
      }}
    >
      {/* `muted` y no `faint`: las filas tachadas de una lista van en `faint`,
          pero ahí son una entre muchas y el tachado ya las subordina. Aquí esta
          línea es la ÚNICA memoria de lo que costó la ronda anterior y además es
          el blanco del deshacer, así que tiene que pasar el contraste AA (faint
          se queda en 3,4:1 sobre el lienzo). Subordinada lo está de sobra: 13 px
          contra un numeral de 125. */}
      <span
        style={{
          font: '600 13px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          textDecoration: 'line-through',
        }}
      >
        {`Ronda ${indice}`}
      </span>
      <Mono size={12} weight={600} color="var(--twin-muted)">
        {reloj(parcialS)}
      </Mono>
    </button>
  );
}

/** La que viene: solo su número. Una ronda pendiente no tiene nada que decir (§7). */
function RondaSiguiente({ indice }: { indice: number }) {
  return (
    <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{`Ronda ${indice}`}</span>
  );
}

/**
 * El trabajo de la ronda, escrito una vez.
 *
 * Un movimiento por línea y no todos en una: «8 Back Squat · 75% · 12,5 m Sled
 * Push · 260 kg · 2:00 Run…» en una tira no se lee de pie ni se puede localizar
 * de un vistazo. Cuatro líneas cortas sí, y es lo que el atleta tiene delante.
 */
function TrabajoDeLaRonda({ metcon }: { metcon: Metcon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      {metcon.ronda.map((mov) => (
        <span
          key={mov.nombre}
          style={{
            font: 'italic 800 17px/1.2 var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
            textAlign: 'center',
          }}
        >
          {lineaDe(mov)}
        </span>
      ))}
    </div>
  );
}

export function SujetoContador({
  metcon,
  activa,
  cerradas,
  onDeshacer,
}: {
  metcon: Metcon;
  /** Índice base 0 de la ronda en curso. */
  activa: number;
  cerradas: readonly number[];
  onDeshacer: () => void;
}) {
  const anteriorS = cerradas.length > 0 ? cerradas[cerradas.length - 1] : null;
  const haySiguiente = activa + 1 < metcon.rondas;
  return (
    <>
      {anteriorS != null ? (
        <RondaAnterior indice={activa} parcialS={anteriorS} onDeshacer={onDeshacer} />
      ) : (
        // La fila se reserva igual: sin ella el numeral subiría en la primera
        // ronda y bajaría en la segunda, y el sujeto no puede bailar (§10.3).
        <span style={{ height: 19 }} aria-hidden />
      )}
      <EtiquetaSujeto>Ronda</EtiquetaSujeto>
      <Numeral>{`${activa + 1}/${metcon.rondas}`}</Numeral>
      <TrabajoDeLaRonda metcon={metcon} />
      {haySiguiente ? <RondaSiguiente indice={activa + 2} /> : <span style={{ height: 16 }} aria-hidden />}
    </>
  );
}

// ---------------------------------------------------------------------------
// El hilo — los parciales que la lista escribía uno por fila
// ---------------------------------------------------------------------------

/** El hilo es FINO: dice dónde vas, no compite con el sujeto (§10.4). */
const ALTO_HILO_PT = 6;
/** La ronda en curso asoma un poco más, como la aguja de un dial. */
const ALTO_AGUJA_PT = 11;

/**
 * EL HILO — un tramo por ronda, y dónde vas dentro de ellos.
 *
 * Tres decisiones, y ninguna es de pintura:
 *
 *  1. Es FINO. La primera versión pintaba cada ronda como una barra de 46 pt de
 *     alto, con la altura proporcional a su parcial, y en pantalla dejaba de ser
 *     un hilo: eran ocho bloques que pesaban lo mismo que el numeral y le
 *     robaban la mirada. El §10.4 lo dice del revés pero es lo mismo: si un
 *     apoyo compite con el sujeto, el sujeto deja de mandar.
 *  2. Por eso los parciales NO se dibujan. Se DICEN, en la línea de lectura de
 *     abajo («la última te costó 8 s más que tu media»), que además es precisa:
 *     un dibujo de barras casi iguales obliga a comparar alturas a ojo para
 *     acabar adivinando lo que una frase afirma. La historia completa de
 *     parciales es del resumen al acabar, no de una pantalla que se mira de
 *     reojo jadeando.
 *  3. La ronda en curso no se rellena a medias. Por dónde vas DENTRO de una
 *     ronda es justo lo que nadie cuenta, así que un relleno parcial se estaría
 *     inventando un progreso (§7): es una aguja, no una barra que crece.
 *
 * Y esto no es la barra de progreso del bloque: el único progreso que se pinta
 * es el tope de tiempo, y ese vive en la franja de contexto. Dos barras
 * compitiendo por decir «cuánto queda» es como se pierde la que importa.
 */
export function HiloDeRondas({
  metcon,
  activa,
  cerradas,
}: {
  metcon: Metcon;
  activa: number;
  cerradas: readonly number[];
}) {
  // Por encima de este número de rondas un tramo baja de 4 pt de ancho y el
  // hilo deja de leerse como tramos: pasa a ser continuo y la cuenta la lleva
  // el numeral. Un «death by» de cien rondas llega aquí.
  const porTramos = metcon.rondas <= RONDAS_MAX_HILO;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label size={10}>Por dónde vas</Label>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {`${cerradas.length} de ${metcon.rondas} cerradas`}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${cerradas.length} rondas cerradas de ${metcon.rondas}. Vas por la ${activa + 1}.`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: porTramos ? 3 : 1,
          height: ALTO_AGUJA_PT,
        }}
      >
        {Array.from({ length: metcon.rondas }, (_, i) => {
          const hecha = i < cerradas.length;
          const enCurso = i === activa;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: enCurso ? ALTO_AGUJA_PT : ALTO_HILO_PT,
                borderRadius: 3,
                background: hecha
                  ? 'color-mix(in srgb, var(--twin-fg) 58%, transparent)'
                  : enCurso
                    ? 'var(--twin-accent)'
                    : 'var(--twin-hairline-strong)',
                transition: 'height 300ms ease-out, background-color 300ms linear',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
