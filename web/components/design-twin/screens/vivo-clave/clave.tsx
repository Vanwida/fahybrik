'use client';

// LA CLAVE — una línea, bajo el nombre del movimiento.
//
// En vivo manda la clave, no el vídeo. Lo que el atleta quiere en mitad de una
// serie no es un tutorial: es la frase que le corrige el gesto, leída de un
// vistazo y sin soltar el ritmo. El vídeo se queda donde está, en el cromo,
// para quien sí quiera parar el cronómetro y mirar.
//
// Las tres reglas que la definen, y las tres son de jerarquía:
//
//   1. Es un SUSURRO. Tinta atenuada, cuerpo de texto, nunca el naranja de
//      acento: el acento se reserva para lo que hay que accionar (§9.1), y una
//      clave no se acciona, se lee. El sujeto sigue siendo la serie.
//   2. Una línea, SIEMPRE una. Si no cabe se corta; la banda del sujeto (§10.3)
//      no puede crecer con la longitud de lo que el coach escribió, o el
//      numeral bailaría de un ejercicio a otro.
//   3. Cuando se corta, se puede tocar y la ficha la sirve entera. El punto
//      suspensivo no es un callejón sin salida.
//
// Y una cuarta que es del §7: sin contenido no hay línea. Ni un texto de
// relleno ni un «sin técnica disponible» — ocuparían el mismo sitio sin decir
// nada, y el atleta dejaría de mirar ahí para siempre.

import { useEffect, useRef, useState } from 'react';
import { IconChevron, SP } from '../../kit';

/**
 * ¿Se está cortando el texto? Lo MIDE del layout, no lo estima por número de
 * caracteres: la misma frase cabe o no según el ancho del lienzo y el cuerpo de
 * la fuente, y contar letras acabaría enseñando la salida cuando no hace falta.
 */
function useCortado(ref: React.RefObject<HTMLElement | null>): boolean {
  const [cortado, setCortado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // +1 px de holgura: el redondeo subpíxel del navegador da diferencias de
    // fracciones de píxel en textos que caben justos.
    const medir = () => setCortado(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cortado;
}

/**
 * La línea. Recibe el texto ya resuelto por `claveDe` — aquí no se decide QUÉ
 * se pinta, solo CÓMO: si esta pieza volviera a mirar la nota y los consejos,
 * habría dos sitios donde cambiar la precedencia y acabarían discrepando.
 */
export function LineaClave({
  texto,
  nombre,
  onAbrir,
}: {
  texto: string;
  /** Para la etiqueta accesible: qué ficha se abre al tocar. */
  nombre: string;
  onAbrir: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const cortado = useCortado(ref);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${texto} Abre la ficha de ${nombre}.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.xs,
        width: '100%',
        minWidth: 0,
        // Área de toque cómoda de pie y sudando, sin que la línea parezca una
        // fila de lista: el relleno es del botón, no una superficie.
        padding: `${SP.s}px ${SP.m}px`,
        background: 'transparent',
        border: 0,
        color: 'var(--twin-muted)',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <span
        ref={ref}
        style={{
          font: '500 13px/1.3 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {texto}
      </span>
      {/* La salida solo aparece cuando hay algo más que leer. Un chevrón fijo
          prometería una ficha con más de lo que ya está en pantalla. */}
      {cortado && (
        <span aria-hidden style={{ color: 'var(--twin-faint)', display: 'inline-flex', flex: '0 0 auto' }}>
          <IconChevron size={11} />
        </span>
      )}
    </button>
  );
}
