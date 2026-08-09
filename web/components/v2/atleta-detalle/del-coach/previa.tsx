'use client';

// LA PREVIA — el móvil del atleta con lo que el coach acaba de escribir.
//
// No es decoración: es el control de calidad. Si la frase se lee rara en este
// móvil, se leerá rara en el suyo.
//
// POR QUÉ SE MONTA ASÍ (decisión de la tanda): el marco, los tokens y los átomos
// son los del DOBLE, importados tal cual — `DeviceFrame` da el lienzo lógico de
// 402×874 pt y `twin.css` los colores de la app, que NO son los del dashboard
// (sus grises son más cálidos y su naranja se apoya en un glifo marrón). Lo
// único propio son los cuerpos de las cinco pantallas (`previa-pantallas.tsx`),
// y son propios porque tienen que leer el BORRADOR de verdad: las pantallas del
// doble están cableadas a su escenario (`PROTOCOLO_CALENTAMIENTO`,
// `PREGUNTA_WAVE`…) y su modelo de nota admite bloques —cifras, repartos,
// líneas de tiempo— que el modelo real todavía no tiene. Adaptar el borrador a
// ese modelo obligaría a inventar datos; esto no forkea el modelo ni un color.

import '@/app/[locale]/(design)/design/twin.css';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DeviceFrame } from '@/components/design-twin/DeviceFrame';
import type { CommunicationKind } from '@fahybrid/shared/domain/coach-communications';
import type { Borrador } from '@/lib/dashboard/v2/del-coach';
import { PantallaDelTipo, TIPO_TWIN } from './previa-pantallas';

/** El bisel del doble: lienzo lógico del iPhone 17 Pro (402×874 pt) + 14 px de
 *  marco por lado (`DeviceFrame`, constante IPHONE). */
const MARCO_ANCHO = 402 + 28;
const MARCO_ALTO = 874 + 28;

/**
 * El móvil, a la altura que le den. El lienzo es 402×874 pt de verdad: lo que
 * aquí desborda desborda también en su mano, en vez de fingir una pantalla más
 * larga de la que tiene.
 *
 * La escala la aplica ESTE envoltorio y no `DeviceFrame`: el suyo escala un hijo
 * que en el layout sigue midiendo 902 px de alto, así que en un hueco más bajo el
 * navegador lo alinea arriba y el móvil aparece 200 px desplazado, medio fuera de
 * su columna (medido). Aquí la caja mide ya lo ESCALADO —así centra de verdad— y
 * dentro se escala desde la esquina. El marco recibe su tamaño natural, de modo
 * que su propia escala se queda en 1 y no hay dos escalados encadenados.
 */
export function PreviaMovil({ b, coachName }: { b: Borrador; coachName: string }) {
  const hueco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  useEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setEscala(Math.min(1, el.clientWidth / MARCO_ANCHO, el.clientHeight / MARCO_ALTO));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hueco} className="relative grid h-full w-full place-items-center">
      <div style={{ width: MARCO_ANCHO * escala, height: MARCO_ALTO * escala }}>
        <div
          style={{
            position: 'relative',
            width: MARCO_ANCHO,
            height: MARCO_ALTO,
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
          }}
        >
          <DeviceFrame device="iphone" orientation="portrait" appearance="dark">
            <div
              className="twin-screen-safe"
              style={{ pointerEvents: 'none' }}
              role="img"
              aria-label={`Previsualización: cómo le queda ${TIPO_TWIN[b.kind]} en su móvil`}
            >
              <PantallaDelTipo b={b} coachName={coachName} />
            </div>
          </DeviceFrame>
        </div>
      </div>
    </div>
  );
}

/** La línea de debajo del móvil: qué está enseñando y qué NO. */
export function PieDePrevia({ b }: { b: Borrador }) {
  const texto: Record<CommunicationKind, ReactNode> = {
    protocol: (
      <>
        <b>Se marca paso a paso.</b> La acción de abajo no se le enciende hasta que no queda
        ninguno sin marcar, y ahí es cuando lo ves cerrado.
      </>
    ),
    question: (
      <>
        <b>Las opciones son la respuesta.</b> No hay botón de enviar: toca una y ya está
        contestado, con la consecuencia delante.
      </>
    ),
    task: (
      <>
        <b>Una tarea no abre pantalla.</b> Vive en su bandeja y se cierra con un toque. El día
        que vence sube arriba, en ámbar.
      </>
    ),
    note: (
      <>
        <b>Una nota se lee por capítulos.</b> Cada sección con su cabecera, no todo en el mismo
        párrafo gris.
      </>
    ),
    focus: (
      <>
        <b>El foco tampoco abre pantalla.</b> Se queda fijo arriba de su bandeja, no caduca y no
        le reclama nada: acompaña.
      </>
    ),
  };
  return (
    <p className="text-label leading-relaxed text-[color:var(--v2-muted)] [&_b]:font-semibold [&_b]:text-[color:var(--v2-fg)]">
      {texto[b.kind]}
    </p>
  );
}
