'use client';

// El sujeto de la propuesta — la parte que ESCALA. Vive aparte de
// `propuesta.tsx` (que ya lleva el cromo, la cabecera y el aparato) sobre
// todo por longitud, pero también porque es la pieza que de verdad resuelve
// el diagnóstico de `hoy.tsx`: las cuatro escalas de `escala(n)`.

import { useEffect, useRef, useState } from 'react';
import type { ItemReal } from '../../datos-reales';
import { Card, Hairline, Label, Mono, SP } from '../../kit';
import { dosisConSeries, FilaTrabajo, leyendaSeries, pastillasDeSerie, PuntoModalidad } from './piezas';

/** Con cuánto peso se pinta cada ítem, según cuántos hay que pintar. */
export function escala(n: number): 'hero' | 'grande' | 'media' | 'fila' {
  if (n === 1) return 'hero'; // la dosis ES el número grande de la pantalla
  if (n === 2) return 'grande';
  if (n <= 4) return 'media';
  return 'fila'; // y a partir de 5, además, puede scrollear
}

// ---------------------------------------------------------------------------
// escala(1): hero
// ---------------------------------------------------------------------------

export function SujetoHero({ item }: { item: ItemReal }) {
  const dosis = dosisConSeries(item);
  const leyenda = leyendaSeries(item);
  const pastillas = pastillasDeSerie(item);
  return (
    // previsualiza degrada a centra: con UN ítem no hay «conjunto» que llenar,
    // así que el grupo entero se centra en su hueco en vez de fingir que hay
    // más contenido que enseñar (§6.1).
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', minWidth: 0 }}>
        {dosis ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PuntoModalidad modalidad={item.modalidad} />
              <span style={{ font: 'italic 800 22px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
            </div>
            <DosisHero>{dosis}</DosisHero>
          </>
        ) : (
          // Sin dosis (~38 % de la biblioteca sin medida, §7) no hay número que
          // fabricar: el SUJETO pasa a ser el nombre del ejercicio, con el
          // mismo autoescalado 96→72 que la dosis, para que el hueco lo llene
          // el nombre y no un hueco sin explicar.
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <PuntoModalidad modalidad={item.modalidad} />
            <DosisHero>{item.nombre}</DosisHero>
          </div>
        )}
        {item.objetivo && <span className="tw-pill">{item.objetivo}</span>}
        {/* Las pastillas y la leyenda son dos cosas, no una: una carrera
            estructurada no numera pastillas (su cuenta está en el titular) pero SÍ
            tiene algo que decir debajo — cómo se hace el OFF. */}
        {(pastillas !== null || leyenda) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {pastillas !== null && (
              <div style={{ display: 'flex', gap: 6 }} aria-hidden>
                {Array.from({ length: pastillas }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--twin-surface-elevated)',
                      border: '1px solid var(--twin-hairline-strong)',
                      font: '700 12px/1 var(--twin-font-mono)',
                      color: 'var(--twin-fg)',
                    }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            )}
            {leyenda && <Mono size={12} color="var(--twin-muted)">{leyenda}</Mono>}
          </div>
        )}
      </div>
    </div>
  );
}

/** La dosis a 96 px, o 72 si a 96 no cabe en una línea — medido, no adivinado
 * (mismo truco de ResizeObserver que `Muerto`/`Recortado` del kit). */
function DosisHero({ children }: { children: string }) {
  const [size, setSize] = useState(96);
  const contRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cont = contRef.current;
    const text = textRef.current;
    if (!cont || !text) return;
    const ro = new ResizeObserver(() => {
      setSize(text.scrollWidth > cont.clientWidth ? 72 : 96);
    });
    ro.observe(cont);
    ro.observe(text);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={contRef} style={{ width: '100%', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
      <span
        ref={textRef}
        style={{
          font: `italic 800 ${size}px/0.95 var(--twin-font-sans)`,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// escala(2): grande — sin escenario real que lo ejercite hoy, pero el modelo
// tiene que sostener 2 ítems tanto como 1 o 16 (build-right: el dominio
// entero, no el caso delante).
// ---------------------------------------------------------------------------

export function SujetoGrande({ items }: { items: ItemReal[] }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s, justifyContent: 'center' }}>
      {items.map((item, i) => {
        const dosis = dosisConSeries(item);
        return (
          <Card key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PuntoModalidad modalidad={item.modalidad} />
                <span style={{ font: 'italic 800 18px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
              </div>
              {dosis && (
                <span style={{ font: 'italic 800 40px/1 var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
                  {dosis}
                </span>
              )}
              {item.objetivo && <span className="tw-pill">{item.objetivo}</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// escala(3-4): media — el calentamiento de 4 ítems. Cabe entero, sin scroll.
// ---------------------------------------------------------------------------

export function SujetoMedia({ items }: { items: ItemReal[] }) {
  return (
    // `fill`: la tarjeta OCUPA el hueco y las filas se lo reparten. Sin esto,
    // cuatro filas de 60 pt dejaban ~300 pt de nada debajo — o sea, el mismo
    // fallo que esta pantalla viene a arreglar, colado dentro de la propuesta.
    // Con el sobrante dentro, un calentamiento se lee de un vistazo desde el
    // suelo en vez de apelotonarse arriba.
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Card padding={0} leftAccent fill>
        {items.map((item, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {i > 0 && <Hairline />}
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <PuntoModalidad modalidad={item.modalidad} />
                <span style={{ font: '600 17px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
                <span style={{ flex: 1 }} />
                <Mono size={20}>{dosisConSeries(item)}</Mono>
              </div>
              {item.objetivo && (
                <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', paddingLeft: 16 }}>
                  {item.objetivo}
                </span>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// escala(5+): fila — la simulación HYROX de 16. El único caso que desborda y
// el único que se gana el scroll.
// ---------------------------------------------------------------------------

export function SujetoFila({ items }: { items: ItemReal[] }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
        <Label>Lo que viene</Label>
        <span style={{ flex: 1 }} />
        <Mono size={13} color="var(--twin-muted)">
          {items.length} ítems
        </Mono>
      </div>
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Card padding={0} leftAccent>
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Hairline />}
              <FilaTrabajo item={item} paddingV={11} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
