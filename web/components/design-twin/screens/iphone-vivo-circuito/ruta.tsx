'use client';

// LA ESTRUCTURA DE UN CIRCUITO EN EL IPHONE — la ruta del kit (`rutaDe`, la
// misma que la Ruta de la muñeca) con sitio: cada tramo de carrera, estación
// y AMRAP en el orden en que se hace, agrupados por ronda cuando el coach
// escribió rondas; lo hecho con su parcial (el tiempo, el /km o el /500 y el
// pulso medio del paso), lo de ahora con su crono en tinta, lo que viene con
// su dosis. La Roxzone y el descanso, ya pasados, como filas sueltas. Arriba,
// la Roxzone sumada (si el coach la activó) o cuántas piezas van.
//
// Es la única lista larga del vivo y por eso scrollea (I6); al abrirse, lo de
// ahora queda a la vista.

import { useEffect, useRef } from 'react';
import { Cuerpo, Etiqueta, Numeral } from '../../kit-iphone-vivo/piezas';
import { CI, MARGEN, RADIO, TI } from '../../kit-iphone-vivo/tokens';
import { fmtReloj, type Secuencia } from '../../kit-reloj';
import { nombreEnRuta, ritmoDeParcial, roxzoneDe, rutaDe, type FilaPasoRuta } from '../../kit-reloj/ruta';
import type { Circuito } from '../reloj-circuito/planes';
import { dosisCompleta } from '../reloj-circuito/texto';

const PUNTO = 9;

function Punto({ estado }: { estado: FilaPasoRuta['estado'] }) {
  return (
    <span
      aria-hidden
      style={{
        marginTop: 6,
        width: PUNTO,
        height: PUNTO,
        borderRadius: PUNTO / 2,
        flex: '0 0 auto',
        background: estado === 'ahora' ? CI.tinta : estado === 'hecho' ? CI.tinta2 : 'transparent',
        boxShadow: estado === 'pendiente' ? `inset 0 0 0 1.5px ${CI.tinta2}` : undefined,
      }}
    />
  );
}

/**
 * Lo que se dice bajo el nombre: el /km o el /500 y el pulso de lo hecho; la
 * dosis (y el objetivo) de lo que viene, sin repetir lo que el nombre ya dice
 * («Run 400 m» no lleva «400 m» debajo).
 */
function detalleDe(f: FilaPasoRuta, nombre: string): string | null {
  if (f.parcial) {
    return [ritmoDeParcial(f.paso, f.parcial), f.parcial.ppm != null ? `${f.parcial.ppm} ppm` : null].filter(Boolean).join(' · ') || null;
  }
  return dosisCompleta(f.paso).filter((x) => !nombre.includes(x)).join(' · ') || null;
}

function FilaPaso({ f, t, hyrox }: { f: FilaPasoRuta; t: number; hyrox: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const ahora = f.estado === 'ahora';
  // Lo de ahora, a la vista al abrir: se desplaza SOLO la lista (scrollIntoView
  // arrastraría también el paginador de las páginas laterales).
  useEffect(() => {
    const el = ref.current;
    const lista = el?.parentElement;
    if (!ahora || !el || !lista) return;
    lista.scrollTop = Math.max(0, el.offsetTop - lista.clientHeight / 2 + el.clientHeight / 2);
  }, [ahora]);
  const nombre = nombreEnRuta(f.paso, hyrox);
  const valor = f.parcial ? fmtReloj(f.parcial.segundos) : ahora ? fmtReloj(t) : null;
  if (f.suelta) {
    // Lo que no está en la lista del coach: una línea menor, con su tiempo.
    return (
      <div ref={ref} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: `2px 14px 2px ${14 + PUNTO + 10}px` }}>
        <Etiqueta tono={ahora ? CI.tinta : CI.tinta2}>{nombre}</Etiqueta>
        {valor ? <Numeral texto={valor} cuerpo={TI.etiqueta.cuerpo} tono={ahora ? CI.tinta : CI.tinta2} /> : null}
      </div>
    );
  }
  const detalle = detalleDe(f, nombre);
  return (
    <div
      ref={ref}
      style={{
        background: ahora ? CI.superficie : 'transparent',
        borderRadius: RADIO.superficie,
        padding: ahora ? '12px 14px' : '8px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <Punto estado={f.estado} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
        <Cuerpo tono={f.estado === 'pendiente' ? CI.tinta2 : CI.tinta} peso={600}>
          {nombre}
        </Cuerpo>
        {detalle ? <Etiqueta estilo={{ whiteSpace: 'normal' }}>{detalle}</Etiqueta> : null}
      </div>
      {valor ? <Numeral texto={valor} cuerpo={TI.datoTexto.cuerpo} tono={ahora ? CI.tinta : CI.tinta2} estilo={{ flex: '0 0 auto', marginTop: 1 }} /> : null}
    </div>
  );
}

/** LA ESTRUCTURA DEL CIRCUITO: la ruta con sus parciales. Sustituye a la página Estructura del kit en esta familia. */
export function RutaCircuito({ c, seq }: { c: Circuito; seq: Secuencia }) {
  const { estado, lecturas } = seq;
  const hyrox = c.formato === 'hyrox';
  const filas = rutaDe(c.plan.pasos, estado, { desde: c.inicio, cabecerasDeRonda: !hyrox, sueltas: 'pasadas' });
  const listadas = filas.filter((f): f is FilaPasoRuta => f.tipo === 'paso' && !f.suelta);
  const hechas = listadas.filter((f) => f.estado === 'hecho').length;
  const rox = c.roxzone ? roxzoneDe(c.plan.pasos, estado) : null;
  return (
    <div className="twin-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: `12px ${MARGEN}px calc(var(--twin-safe-bottom) + 24px)`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ position: 'sticky', top: -12, zIndex: 1, background: CI.fondo, padding: '12px 0 8px', marginTop: -12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: TI.posicion.peso, color: CI.tinta }}>Estructura</span>
        {rox != null ? (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <Etiqueta>Roxzone</Etiqueta>
            <Numeral texto={fmtReloj(rox)} cuerpo={TI.datoTexto.cuerpo} />
          </span>
        ) : (
          <Etiqueta>{`${hechas}/${listadas.length} hechas`}</Etiqueta>
        )}
      </div>
      {filas.map((f) =>
        f.tipo === 'ronda' ? (
          <div key={`r${f.n}`} style={{ padding: '10px 14px 2px' }}>
            <Etiqueta>{`Ronda ${f.n}/${f.de}`}</Etiqueta>
          </div>
        ) : (
          <FilaPaso key={f.i} f={f} t={lecturas.t} hyrox={hyrox} />
        ),
      )}
    </div>
  );
}
