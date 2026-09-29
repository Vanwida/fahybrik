'use client';

// EL SUJETO DE LA PORTADA — el Estado, con el cascarón editorial de «El día»
// (`kit-dia/hero`): la palabra de hoy en display de marca, una línea que la
// explica (el veredicto), las tres cifras de carga en teselas y la disposición
// con su arco. Lo pinta desde `SujetoEstado` (`sujeto.ts`) y no decide nada.
//
// Aquí ninguna acción es «haz esto ahora», así que NO hay naranja sólido: el
// tinte suave dice cómo estás y el color de estado va en la marca y en el arco,
// nunca en una cifra (un 38 no se lee como alarma ni un 91 como aplauso). Todo
// el texto va en la tinta del tema: sobre un tinte el gris de apoyo no llega a
// 4,5:1, y la jerarquía la dan el peso y el tamaño.

import { useEffect, useState, type CSSProperties } from 'react';
import { Abajo, Apoyo, Arriba, Hero, Kicker, Titulo } from '../kit-dia/hero';
import { fuente, RADIO, TABULAR, TAM, velo } from '../kit-dia/tokens';
import { BotonAccion, Plazo } from './piezas';
import type { MarcaEstado, SujetoEstado } from './sujeto';
import type { NivelDisposicion } from './metodo';

const COLOR_MARCA: Record<MarcaEstado, string> = {
  ok: 'var(--twin-ok)',
  aviso: 'var(--twin-warning)',
  peligro: 'var(--twin-danger)',
  info: 'var(--twin-info)',
  neutra: 'var(--twin-muted)',
};

/** El color del arco de la disposición: por tercio del espectro, no por número (los cortes son del coach). */
const COLOR_NIVEL: Record<NivelDisposicion, string> = {
  bajo: 'var(--twin-danger)',
  medio: 'var(--twin-warning)',
  alto: 'var(--twin-ok)',
};

/** Una pieza que enseña un dato dentro del sujeto: un velo de la tinta del tema sobre el tinte, con su raya. */
const INSERTO: CSSProperties = {
  boxSizing: 'border-box',
  borderRadius: RADIO.fila,
  background: velo('var(--twin-fg)', 6),
  border: `1px solid ${velo('var(--twin-fg)', 14)}`,
  color: 'var(--twin-fg)',
};

const ANILLO = 60;
const TRAZO = 6;

/** El anillo de la disposición (el mismo de «Cómo llegas hoy»): el color va en el arco, la cifra en la tinta del tema. */
function Anillo({ valor, nivel }: { valor: number; nivel: NivelDisposicion }) {
  const r = (ANILLO - TRAZO) / 2;
  const c = 2 * Math.PI * r;
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const fraccion = Math.min(1, Math.max(0, valor / 100));
  return (
    <span style={{ position: 'relative', width: ANILLO, height: ANILLO, flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
      <svg width={ANILLO} height={ANILLO} viewBox={`0 0 ${ANILLO} ${ANILLO}`} aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={ANILLO / 2} cy={ANILLO / 2} r={r} fill="none" stroke={velo('var(--twin-fg)', 16)} strokeWidth={TRAZO} />
        <circle
          className="hd-arco"
          cx={ANILLO / 2}
          cy={ANILLO / 2}
          r={r}
          fill="none"
          stroke={COLOR_NIVEL[nivel]}
          strokeWidth={TRAZO}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={lleno ? c * (1 - fraccion) : c}
        />
      </svg>
      <span style={{ ...fuente(800, 24, 1, true), ...TABULAR, letterSpacing: '-0.03em', color: 'var(--twin-fg)' }}>{Math.round(valor)}</span>
    </span>
  );
}

export function EstadoSujeto({ s, onGlosa, onSalida }: { s: SujetoEstado; onGlosa: () => void; onSalida: (texto: string) => void }) {
  return (
    <Hero tono={s.tono} etiqueta="Tu estado hoy">
      <Arriba>
        <Kicker
          tono={s.tono}
          aparte={
            <button
              type="button"
              className="hd-toque"
              onClick={onGlosa}
              aria-label="Qué significa cada número"
              style={{ width: 44, height: 44, margin: '-6px -8px -6px 0', borderRadius: '50%', display: 'grid', placeItems: 'center', ...fuente(800, TAM.cuerpo, 1), color: 'var(--twin-fg)' }}
            >
              <span aria-hidden className="hd-circulo" style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', background: velo('var(--twin-fg)', 8), border: `1px solid ${velo('var(--twin-fg)', 20)}` }}>
                ?
              </span>
            </button>
          }
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MARCA[s.marca], boxShadow: `0 0 0 3px ${velo(COLOR_MARCA[s.marca], 24)}` }} />
            Tu estado hoy
          </span>
        </Kicker>
        <Titulo tono={s.tono}>{s.titulo}</Titulo>
        {s.apoyo ? <Apoyo tono={s.tono}>{s.apoyo}</Apoyo> : null}
      </Arriba>

      {s.plazo || s.celdas.length > 0 || s.disposicion || s.salida ? (
        <Abajo>
          {s.plazo ? <Plazo llevas={s.plazo.llevas} hacen={s.plazo.hacen} tono="var(--twin-fg)" /> : null}

          {s.celdas.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.celdas.length}, minmax(0, 1fr))`, gap: 8 }}>
              {s.celdas.map((c) => (
                <button
                  key={c.clave}
                  type="button"
                  className="hd-toque"
                  onClick={onGlosa}
                  aria-label={`${c.etiqueta}: ${c.texto}. Qué es`}
                  style={{ ...INSERTO, padding: '12px 12px 10px', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6, minWidth: 0 }}
                >
                  <span style={{ ...fuente(700, TAM.suelo, 1.2) }}>{c.etiqueta}</span>
                  <span style={{ ...fuente(800, TAM.dato, 1, true), ...TABULAR, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{c.texto}</span>
                </button>
              ))}
            </div>
          ) : null}

          {s.disposicion ? (
            <button type="button" className="hd-toque" onClick={onGlosa} aria-label={`Disposición: ${Math.round(s.disposicion.valor)} de 100, ${s.disposicion.palabra}. Qué es`} style={{ ...INSERTO, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <Anillo valor={s.disposicion.valor} nivel={s.disposicion.nivel} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ ...fuente(700, TAM.suelo, 1.2) }}>Disposición de hoy</span>
                <span style={{ ...fuente(800, TAM.cuerpo, 1.2, true) }}>{s.disposicion.palabra}</span>
              </span>
            </button>
          ) : null}

          {s.salida?.tipo === 'accion' ? <BotonAccion texto={s.salida.texto} onTap={() => onSalida(s.salida!.texto)} /> : null}
          {s.salida?.tipo === 'espera' && !s.plazo ? <Apoyo tono={s.tono}>{s.salida.texto}</Apoyo> : null}
        </Abajo>
      ) : null}
    </Hero>
  );
}
