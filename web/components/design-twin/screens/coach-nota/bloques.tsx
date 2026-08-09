'use client';

// Los bloques de un briefing. Cada clase sabe cómo se pinta, y por eso una
// cifra sale de cifra, un reparto sale de barra y doce semanas salen de espina.
//
// El fallo que esto evita es el de siempre: meter «1:15 a 1:18», «3 duras, 2
// moderadas y 1 de absorción» y la estructura del ciclo en el mismo párrafo
// gris. Son tres cosas distintas, se leen en tres momentos distintos, y el
// atleta vuelve a la del medio en octubre sin querer releer las otras dos.

import { Mono } from '../../kit';
import { S } from '../../kit-composicion/tokens';
import {
  COLOR_FASE,
  COLOR_INTENSIDAD,
  NOMBRE_INTENSIDAD,
  type BloqueNota,
  type HitoPlan,
  type ParteReparto,
} from '../../coach-com/modelo';

export function Bloque({ bloque }: { bloque: BloqueNota }) {
  switch (bloque.clase) {
    case 'texto':
      return (
        <p style={{ margin: 0, font: '400 14px/1.55 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {bloque.texto}
        </p>
      );
    case 'lista':
      return <Lista items={bloque.items} />;
    case 'objetivo':
      return <Objetivo desde={bloque.desde} hasta={bloque.hasta} pie={bloque.pie} />;
    case 'reparto':
      return <Reparto titular={bloque.titular} partes={bloque.partes} />;
    case 'linea-tiempo':
      return <LineaTiempo hitos={bloque.hitos} />;
  }
}

/** Las premisas que se rompen. Una por línea: cada una cambia una cosa distinta. */
function Lista({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: S.s }}>
      {items.map((item) => (
        <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: S.m }}>
          <span
            aria-hidden
            style={{
              flex: '0 0 auto',
              width: 5,
              height: 5,
              marginTop: 7,
              borderRadius: '50%',
              background: 'var(--twin-accent)',
            }}
          />
          <span style={{ font: '400 14px/1.5 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * El objetivo es el sujeto de la nota entera: se lee a tres metros y en mono,
 * porque es una marca de tiempo y se va a comparar con otras.
 *
 * El «a» que une los dos extremos va en SANS (§4): dentro del monoespaciado una
 * palabra ocupa una columna de instrumento y separa las dos cifras como si
 * fueran tres datos en vez de una banda.
 */
function Objetivo({ desde, hasta, pie }: { desde: string; hasta: string; pie: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: S.s }}>
        <Mono size={38} weight={800} color="var(--twin-fg)">
          {desde}
        </Mono>
        <span style={{ font: '500 17px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>a</span>
        <Mono size={38} weight={800} color="var(--twin-fg)">
          {hasta}
        </Mono>
      </span>
      <span style={{ font: '400 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{pie}</span>
    </div>
  );
}

/**
 * El reparto de la semana. La barra se reparte POR SESIONES, que es la unidad
 * en la que el coach lo decidió: los minutos por intensidad no se saben, y una
 * barra que finja saberlos mentiría (§7).
 */
function Reparto({ titular, partes }: { titular: string; partes: ParteReparto[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
      <span style={{ font: '650 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{titular}</span>
      <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {partes.map((p) => (
          <span
            key={p.intensidad}
            aria-hidden
            style={{ flex: p.sesiones, minWidth: 4, borderRadius: 4, background: COLOR_INTENSIDAD[p.intensidad] }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: S.l, flexWrap: 'wrap' }}>
        {partes.map((p) => (
          <span key={p.intensidad} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: COLOR_INTENSIDAD[p.intensidad],
                flex: '0 0 auto',
              }}
            />
            <Mono size={13} weight={700}>
              {p.sesiones}
            </Mono>
            <span style={{ font: '500 12.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {NOMBRE_INTENSIDAD[p.intensidad]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Las doce semanas como espina vertical. El color del nodo es la fase, así que
 * las descargas y el simulacro se ven de un vistazo sin leer una palabra: son
 * justo lo que el atleta busca cuando vuelve aquí en octubre.
 */
function LineaTiempo({ hitos }: { hitos: HitoPlan[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {hitos.map((h, i) => (
        <Hito key={h.semanas} hito={h} primero={i === 0} ultimo={i === hitos.length - 1} />
      ))}
    </div>
  );
}

const RAIL = 13;
const NODO = 9;

function Hito({ hito, primero, ultimo }: { hito: HitoPlan; primero: boolean; ultimo: boolean }) {
  const color = COLOR_FASE[hito.fase];
  const destacado = hito.fase === 'descarga' || hito.fase === 'simulacro';

  return (
    <div style={{ display: 'flex', gap: S.m, alignItems: 'stretch' }}>
      <div style={{ flex: `0 0 ${RAIL}px`, position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: primero ? 12 : 0,
            bottom: ultimo ? 'auto' : 0,
            height: ultimo ? 12 : undefined,
            width: 1,
            background: 'var(--twin-hairline-strong)',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'relative',
            marginTop: 8,
            width: NODO,
            height: NODO,
            borderRadius: '50%',
            flex: '0 0 auto',
            background: destacado ? color : 'var(--twin-bg)',
            border: `1.6px solid ${color}`,
            boxShadow: destacado ? `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` : 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: `4px 0 ${S.m}px` }}>
        <Mono size={11} weight={700} color={color} style={{ letterSpacing: '0.06em' }}>
          {hito.semanas}
        </Mono>
        <span
          style={{
            font: `${destacado ? 650 : 550} 14px/1.3 var(--twin-font-sans)`,
            color: 'var(--twin-fg)',
          }}
        >
          {hito.titulo}
        </span>
        {hito.detalle ? (
          <span style={{ font: '400 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {hito.detalle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
