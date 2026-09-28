'use client';

// LA REJILLA, «LUEGO» Y LA TIRA (I5.5–I5.7) — lo que acompaña al sujeto.
//
//   Rejilla         2–4 métricas propias de la familia (`metricasDelPaso`), el
//                   pulso siempre. Es la franja ELÁSTICA de la anatomía: el
//                   sobrante del lienzo entra en sus celdas (§6.1, §10.3), así
//                   que a 932 pt de alto las celdas crecen y a 844 caben.
//                   Nunca desborda: cuatro celdas como máximo, en 2 × 2.
//   Luego           el siguiente PASO con su objetivo, y el «después» si lo que
//                   viene es recuperar. Se parte en dos líneas; nunca se trunca.
//   TiraEstructura  la sesión entera como barra segmentada por pasos: trabajo
//                   naranja, recuperación y descanso gris, el paso vivo marcado.
//                   Tocar abre la Estructura completa.

import { useLayoutEffect, useRef, useState } from 'react';
import type { ArcoDeTramo } from '../kit-watch/bisel';
import type { Metrica } from '../kit-reloj/metricas';
import type { LuegoVista } from '../kit-reloj/posicion';
import { ChipZona, Corazon, Cuerpo, Etiqueta, Numeral } from './piezas';
import { ALTO, CELDA, CI, HUECO, MARGEN, TI } from './tokens';

// ---------------------------------------------------------------------------
// La rejilla
// ---------------------------------------------------------------------------

/**
 * A partir de esta altura de celda el valor crece (30 → 40 pt): el sobrante
 * del lienzo entra en las filas y el dato lo aprovecha (§6.1, «gobierna»),
 * en vez de quedarse pequeño en una caja grande.
 */
const CELDA_ALTA = 132;

/**
 * `ancho`: el de la celda. El valor solo crece a 40 pt si la fila entera
 * («128 ppm ↓ Z1») cabe en UNA línea: se mide en el DOM tras pintar, y si
 * se partió, vuelve a 30. Se vuelve a intentar cuando cambia el ancho.
 */
function Celda({ m, alta, compacta, ancho }: { m: Metrica; alta: boolean; compacta: boolean; ancho?: number }) {
  const fila = useRef<HTMLSpanElement>(null);
  const quiereCrecer = alta && !m.texto;
  const piezas = [m.unidad, m.tendencia, m.zona?.n, m.aviso?.texto].filter((x) => x != null).length;
  // Lo medido vale para ESTE ancho y estas piezas: si cambian, se vuelve a intentar a 40.
  const [medida, setMedida] = useState<{ ancho?: number; piezas: number; ok: boolean } | null>(null);
  const cabe = medida && medida.ancho === ancho && medida.piezas === piezas ? medida.ok : true;
  useLayoutEffect(() => {
    const el = fila.current;
    if (!el || !quiereCrecer || !cabe) return;
    const comprobar = () => {
      const hijos = Array.from(el.children);
      const arriba = hijos[0]?.getBoundingClientRect().top ?? 0;
      if (hijos.some((h) => h.getBoundingClientRect().top > arriba + 2)) setMedida({ ancho, piezas, ok: false });
    };
    comprobar();
  });
  const crece = quiereCrecer && cabe;
  const cuerpo = crece ? TI.trabajo.cuerpo : compacta ? TI.datoTexto.cuerpo + 2 : TI.dato.cuerpo;
  return (
    <div
      style={{
        background: CI.celda,
        borderRadius: CELDA.radio,
        padding: compacta ? `0 ${CELDA.padding + 2}px` : CELDA.padding,
        minHeight: compacta ? CELDA.compacta : CELDA.minAlto,
        flex: '1 1 auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: compacta ? 'row' : 'column',
        // La celda normal reparte etiqueta y valor; la alta (el sobrante del
        // lienzo) los centra como una losa, con el valor crecido.
        justifyContent: alta ? 'center' : 'space-between',
        alignItems: compacta ? 'center' : undefined,
        gap: 6,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {m.glifo === 'pulso' ? <Corazon talla={13} /> : null}
        <Etiqueta>{m.etiqueta}</Etiqueta>
      </span>
      {m.texto ? (
        <span style={{ fontSize: alta ? TI.datoTexto.cuerpo + 4 : TI.datoTexto.cuerpo, fontWeight: TI.datoTexto.peso, color: CI.tinta, lineHeight: 1.15, textWrap: 'balance', overflowWrap: 'anywhere' }}>{m.valor}</span>
      ) : (
        <span ref={fila} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', flexWrap: 'wrap', rowGap: 2 }}>
          <Numeral texto={m.valor} cuerpo={cuerpo} />
          {m.unidad ? <Etiqueta>{m.unidad}</Etiqueta> : null}
          {m.tendencia ? <Etiqueta tono={CI.tinta}>{m.tendencia === 'baja' ? '↓' : '↑'}</Etiqueta> : null}
          {m.zona ? <ChipZona n={m.zona.n} color={m.zona.color} /> : null}
          {m.aviso ? <Etiqueta tono={CI.tinta}>{`${m.aviso.marca} ${m.aviso.texto}`}</Etiqueta> : null}
        </span>
      )}
    </div>
  );
}

/** Un texto largo («12 Wall Ball · 9 kg») va a lo ancho; uno corto («1/4») comparte fila. */
const aLoAncho = (m: Metrica) => !!m.texto && m.valor.length > 12;

/** Cuántas filas ocupan las celdas en dos columnas: las anchas, una cada una; las demás, de dos en dos. */
function filasDe(celdas: Metrica[]): number {
  const anchas = celdas.filter(aLoAncho).length;
  const resto = celdas.length - anchas;
  return anchas + Math.ceil(resto / 2);
}

/**
 * LA REJILLA DE APOYO. Siempre dos columnas: a 390 pt tres columnas no dan
 * sitio a «171 ppm Z4» a 30 pt sin cortar. Dos celdas van en una fila; tres,
 * dos y la tercera a lo ancho; cuatro, en 2 × 2. Es la franja ELÁSTICA: el
 * sobrante del lienzo entra en las celdas, y si la celda es alta el valor
 * crece. `children`: lo que la familia mete ANTES de las celdas en la misma
 * franja (la anotación de la serie en el descanso de fuerza).
 */
export function Rejilla({ metricas, children, compacta = false }: { metricas: Metrica[]; children?: React.ReactNode; compacta?: boolean }) {
  const celdas = metricas.slice(0, 4);
  const ref = useRef<HTMLDivElement>(null);
  const [altoCelda, setAltoCelda] = useState(0);
  const [anchoRejilla, setAnchoRejilla] = useState(0);
  const filas = filasDe(celdas);
  // Con N impar sin anchas, la última va a lo ancho para no dejar un hueco.
  const ultimaSuelta = celdas.length % 2 === 1 && !celdas.some(aLoAncho);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      setAltoCelda((el.clientHeight - HUECO * (filas - 1)) / filas);
      setAnchoRejilla(el.clientWidth);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filas]);
  const alta = !compacta && altoCelda >= CELDA_ALTA;
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, padding: `0 ${MARGEN}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: HUECO }}>
      {children}
      {/* También en compacta el sobrante entra en las celdas (§6.1): nunca una cola vacía entre la rejilla y la tira. */}
      {celdas.length > 0 ? (
        <div ref={ref} style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: HUECO }}>
          {celdas.map((m, k) => {
            const ancha = aLoAncho(m) || (ultimaSuelta && k === celdas.length - 1);
            return (
            <div key={`${m.clave}-${k}`} style={{ display: 'flex', minHeight: 0, gridColumn: ancha ? '1 / -1' : undefined }}>
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Celda m={m} alta={alta} compacta={compacta} ancho={anchoRejilla > 0 ? (ancha ? anchoRejilla : (anchoRejilla - HUECO) / 2) : undefined} />
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: '1 1 auto' }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Luego
// ---------------------------------------------------------------------------

/** «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55». `viene`: en un descanso se rotula «Viene:». */
export function Luego({ luego, prefijo = 'Luego' }: { luego: LuegoVista | null; prefijo?: 'Luego' | 'Viene' }) {
  if (!luego) return <div style={{ height: ALTO.luego, flex: '0 0 auto' }} />;
  return (
    <div style={{ minHeight: ALTO.luego, flex: '0 0 auto', padding: `0 ${MARGEN}px`, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
      <Cuerpo>
        <span style={{ color: CI.tinta2 }}>{prefijo === 'Luego' ? 'Luego · ' : 'Viene: '}</span>
        {luego.que}
        {luego.despues ? (
          <>
            <span style={{ color: CI.tinta2 }}> · después </span>
            {luego.despues}
          </>
        ) : null}
      </Cuerpo>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La tira de estructura
// ---------------------------------------------------------------------------

/** El ancho mínimo de un segmento: un stride de 20″ tiene que verse. */
const MIN_SEGMENTO = 3;
const HUECO_SEGMENTO = 2;

/**
 * LA SESIÓN ENTERA EN UNA TIRA: un segmento por paso, proporcional a lo que
 * dura (el estimador del kit), trabajo en naranja y lo demás en gris. El
 * brillo dice dónde estás (hecho pleno, en curso con su avance, lo que viene
 * apenas). Tocar abre la Estructura completa.
 */
export function TiraEstructura({ arcos, enCurso, fraccion, onAbrir }: { arcos: ArcoDeTramo[]; enCurso: number; fraccion: number; onAbrir?: () => void }) {
  const total = arcos.reduce((a, x) => a + Math.max(0, x.peso), 0) || arcos.length;
  const avance = Math.min(1, Math.max(0, fraccion));
  return (
    <button
      type="button"
      aria-label="Abrir la estructura de la sesión"
      onClick={(e) => {
        e.stopPropagation();
        onAbrir?.();
      }}
      style={{
        height: ALTO.tira,
        flex: '0 0 auto',
        margin: `0 ${MARGEN}px`,
        padding: 0,
        border: 0,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: HUECO_SEGMENTO,
        cursor: 'pointer',
      }}
    >
      {arcos.map((a, i) => {
        const peso = (Math.max(0, a.peso) || total / arcos.length) / total;
        const color = a.trabajo ? CI.accion : CI.tinta2;
        const opacidad = i < enCurso ? 1 : i === enCurso ? 0.45 : 0.22;
        return (
          <span
            key={i}
            style={{
              position: 'relative',
              flex: `${peso} 1 ${MIN_SEGMENTO}px`,
              minWidth: MIN_SEGMENTO,
              height: 7,
              borderRadius: 3.5,
              background: color,
              opacity: opacidad,
              overflow: 'hidden',
            }}
          >
            {i === enCurso && avance > 0 ? (
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${avance * 100}%`, background: color, opacity: 1 / opacidad, transition: 'width 900ms linear' }} />
            ) : null}
          </span>
        );
      })}
    </button>
  );
}
