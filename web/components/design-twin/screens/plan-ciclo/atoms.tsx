'use client';

// Las piezas de la espina del ciclo.
//
// Viven aparte de la composición porque son las que llevan el dibujo (el nodo
// que marca la posición, las semanas con el cursor, el rombo de un hito) y eso
// ensucia la lectura del layout. Ninguna es reutilizable fuera de esta pantalla:
// la semana y el día no pintan etapas, así que no suben al kit compartido.
//
// Ninguna inventa un color ni un tamaño: todo sale de los tokens `--twin-*` y
// del vocabulario de `plan/atoms.tsx`.

import { SP } from '../../kit';
import { Etiqueta } from '../../kit-composicion/chrome';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { Fila, Numeral, Pastilla, entradaStyle } from '../../plan/atoms';
import { cuandoElHito, plural, type Carrera, type Ciclo, type EstadoTramo, type Hito, type Tramo } from '../../plan/modelo';
import { fmtClock } from '../../sim';

/** El ancho de la columna de nodos: la espina se lee por sus marcas. */
export const RAIL = 11;

/** El plural cuando el número va en `Numeral` y la palabra viaja en el sufijo. */
export function sufijoSemanas(n: number): string {
  return n === 1 ? 'semana' : 'semanas';
}

// ---------------------------------------------------------------------------
// Una etapa de la espina
// ---------------------------------------------------------------------------

export function FilaTramo({
  tramo,
  estado,
  cursor,
  nivelComun,
  visible,
  retardo,
  onLog,
}: {
  tramo: Tramo;
  estado: EstadoTramo;
  /** Semana de la etapa donde cae hoy, 1-based. `null` = hoy no cae aquí. */
  cursor: number | null;
  nivelComun: string | null;
  visible: boolean;
  retardo: number;
  onLog: (linea: string) => void;
}) {
  const abierto = estado === 'actual';
  const etiqueta = etiquetaTramo(tramo, estado, cursor);

  return (
    <Fila
      acento={abierto}
      etiqueta={etiqueta}
      onTap={() => onLog(etiqueta)}
      style={{
        // La etapa abierta se lleva la mayor parte del sobrante: es la que
        // tiene algo que enseñar dentro (sus semanas y sus hitos).
        flex: abierto ? '3 1 auto' : '0 0 auto',
        minHeight: 0,
        alignItems: 'flex-start',
        ...entradaStyle(visible, retardo),
      }}
    >
      <Nodo tipo={estado} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s, alignSelf: 'stretch' }}>
        {abierto ? (
          <span style={{ display: 'flex' }}>
            <Pastilla tono="acento">Estás aquí</Pastilla>
          </span>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.m }}>
          <span
            style={{
              // Un nombre de etapa es un valor CATEGÓRICO (§4): gana por peso
              // y un escalón de la tipografía de TEXTO, no volviéndose un
              // instrumento de medida. Una etapa que ya pasó se apaga a `muted`
              // en vez de taparse con opacidad, que se come el contraste.
              font: '650 16px/1.25 var(--twin-font-sans)',
              color: estado === 'pasado' ? 'var(--twin-muted)' : 'var(--twin-fg)',
              flex: 1,
              minWidth: 0,
            }}
          >
            {tramo.nombre}
          </span>
          <Numeral tamano="s" sufijo={sufijoSemanas(tramo.semanas)}>
            {tramo.semanas}
          </Numeral>
        </div>

        {/* El nivel solo cuando se sale del que declara el resto del ciclo. */}
        {tramo.nivel && tramo.nivel !== nivelComun ? (
          <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{tramo.nivel}</span>
        ) : null}

        {abierto ? <Semanas semanas={tramo.semanas} cursor={cursor} /> : null}

        {tramo.hitos.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto' }}>
            <Etiqueta>En el calendario</Etiqueta>
            {tramo.hitos.map((hito, i) => (
              <LineaHito key={i} hito={hito} />
            ))}
          </div>
        ) : null}
      </div>
    </Fila>
  );
}

/**
 * Las semanas de la etapa abierta, con el cursor de hoy encima.
 *
 * Son MARCAS DE POSICIÓN: todas miden lo mismo y solo cambia la de hoy. Si
 * alguna fuese más alta que otra estaríamos dibujando una rampa de carga
 * prevista, que es exactamente lo que esta pantalla viene a sustituir y lo que
 * el modelo se niega a guardar.
 *
 * Se lleva el sobrante de la fila y se centra en él: el hueco entra aquí, no en
 * una cola debajo de la espina (§6.1). Va `aria-hidden` porque la posición ya
 * se lee entera en el rótulo de su fila («estás en la semana 2»).
 */
function Semanas({ semanas, cursor }: { semanas: number; cursor: number | null }) {
  const marcas = Array.from({ length: semanas }, (_, i) => i + 1);
  return (
    <div
      aria-hidden
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 5,
        paddingTop: 2,
      }}
    >
      <div style={{ display: 'flex', gap: 4, height: 5 }}>
        {marcas.map((n) => (
          <span key={n} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            {n === cursor ? (
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '5px solid var(--twin-accent)',
                }}
              />
            ) : null}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {marcas.map((n) => (
          <span
            key={n}
            style={{
              flex: 1,
              height: n === cursor ? 10 : 8,
              borderRadius: 5,
              background:
                cursor !== null && n < cursor
                  ? 'var(--twin-muted)'
                  : n === cursor
                    ? 'var(--twin-accent)'
                    : 'var(--twin-hairline-strong)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Un hito decidido. El «cuándo» sale de `cuandoElHito`, que dice «en 12 días»
 * cuando hay fecha y «semana 1 · miércoles» cuando solo hay posición. Nunca se
 * inventa una fecha desde una posición.
 */
function LineaHito({ hito }: { hito: Hito }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          transform: 'rotate(45deg)',
          background: 'var(--twin-accent)',
          flex: '0 0 auto',
          alignSelf: 'center',
        }}
      />
      <span
        style={{
          font: '500 13px/1.3 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hito.nombre}
      </span>
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', flex: '0 0 auto' }}>
        {cuandoElHito(hito)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El agujero del final — un hecho de la estructura, no una pantalla rota
// ---------------------------------------------------------------------------

/**
 * Lo publicado se acaba y no hay siguiente. Es el estado REAL de todos los
 * atletas hoy (cero asignaciones futuras en toda la base), así que no es un
 * borde: es el caso.
 *
 * Se declara porque tiene dueño (§6.2 bis): el atleta no puede llenarlo, pero
 * sabe quién sí. Y se lleva su parte del sobrante, porque el agujero ocupa
 * tiempo de verdad entre lo último publicado y la carrera.
 */
export function Hueco({ ciclo, visible }: { ciclo: Ciclo; visible: boolean }) {
  return (
    <div
      style={{
        flex: '2 1 auto',
        minHeight: 0,
        display: 'grid',
        placeItems: 'center',
        ...entradaStyle(visible, 340),
      }}
    >
      <EstadoCentrado
        titulo="Aquí acaba lo publicado"
        cuerpo={
          ciclo.indiceActual < 0
            ? 'Lo que tu coach ha montado se termina antes de hoy.'
            : 'Después de esta etapa no hay nada montado todavía.'
        }
        salida={{ tipo: 'depende', quien: 'tu coach', cuando: 'Todavía no hay fecha' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// La carrera — lo que da sentido a todo lo de arriba
// ---------------------------------------------------------------------------

export function FilaCarrera({
  carrera,
  visible,
  onLog,
}: {
  carrera: Carrera;
  visible: boolean;
  onLog: (linea: string) => void;
}) {
  const etiqueta = etiquetaCarrera(carrera);
  return (
    <Fila
      etiqueta={etiqueta}
      onTap={() => onLog(etiqueta)}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        // Filo más firme que el de las filas: la espina termina aquí. El acento
        // no se usa porque ya lo lleva la etapa donde estás, y dos acentos en
        // la misma columna dejan de señalar nada.
        borderColor: 'var(--twin-hairline-strong)',
        ...entradaStyle(visible, 420),
      }}
    >
      <Nodo tipo="carrera" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Etiqueta>Tu carrera</Etiqueta>
        <span style={{ font: '650 16px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{carrera.nombre}</span>
        {/* Sin objetivo puesto no hay línea: un tiempo por defecto parecería
            del atleta, y ningún valor por defecto puede parecerlo (§7). */}
        {carrera.objetivoS !== null ? (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>objetivo</span>
            <Numeral tamano="s">{fmtClock(carrera.objetivoS)}</Numeral>
          </span>
        ) : null}
      </div>
      <Numeral tamano="m" sufijo={carrera.enDias === 1 ? 'día' : 'días'}>
        {carrera.enDias}
      </Numeral>
    </Fila>
  );
}

// ---------------------------------------------------------------------------
// El nodo de la espina
// ---------------------------------------------------------------------------

/**
 * La marca de posición de una fila. No se usan `Sello` ni `Aro` de `plan/atoms`
 * porque los dos piden una modalidad y una etapa del ciclo no tiene ninguna:
 * lo que distingue a estas marcas es dónde caen en el tiempo, no de qué van.
 */
function Nodo({ tipo }: { tipo: EstadoTramo | 'carrera' }) {
  if (tipo === 'carrera') {
    return (
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          transform: 'rotate(45deg)',
          borderRadius: 2,
          background: 'var(--twin-fg)',
          flex: '0 0 auto',
          margin: `0 ${(RAIL - 10) / 2}px`,
        }}
      />
    );
  }
  const actual = tipo === 'actual';
  return (
    <span
      aria-hidden
      style={{
        boxSizing: 'border-box',
        width: actual ? RAIL : 9,
        height: actual ? RAIL : 9,
        borderRadius: '50%',
        flex: '0 0 auto',
        // Cae a la altura de la primera línea de texto de la fila.
        marginTop: actual ? 5 : 6,
        marginLeft: actual ? 0 : 1,
        marginRight: actual ? 0 : 1,
        background: tipo === 'pasado' ? 'var(--twin-muted)' : actual ? 'var(--twin-accent)' : 'transparent',
        border: tipo === 'proximo' ? '1.6px solid var(--twin-hairline-strong)' : 'none',
        boxShadow: actual ? '0 0 0 3px color-mix(in srgb, var(--twin-accent) 22%, transparent)' : 'none',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Los rótulos accesibles — un solo sitio, y sin fabricar nada
// ---------------------------------------------------------------------------

/**
 * El rótulo accesible de una etapa.
 *
 * Sin cursor, `estadoDeTramo` devuelve 'proximo' para TODAS las etapas (no hay
 * desde dónde medir). Por eso el estado solo se dice con palabras cuando hoy
 * cae dentro de alguna: sin cursor no se sabe si una etapa queda por delante o
 * por detrás, y afirmarlo sería inventarlo.
 */
export function etiquetaTramo(tramo: Tramo, estado: EstadoTramo, cursor: number | null): string {
  const base = `${tramo.nombre}, ${tramo.semanas} ${sufijoSemanas(tramo.semanas)}`;
  const donde = cursor !== null ? `, estás en la semana ${cursor}` : estado === 'pasado' ? ', ya pasó' : '';
  const nivel = tramo.nivel ? `, nivel ${tramo.nivel}` : '';
  const hitos =
    tramo.hitos.length > 0
      ? `. ${plural(tramo.hitos.length, 'marca en el calendario', 'marcas en el calendario')}: ${tramo.hitos
          .map((h) => `${h.nombre}, ${cuandoElHito(h)}`)
          .join('; ')}`
      : '';
  return `${base}${donde}${nivel}${hitos}`;
}

export function etiquetaCarrera(carrera: Carrera): string {
  const objetivo = carrera.objetivoS !== null ? `, objetivo ${fmtClock(carrera.objetivoS)}` : '';
  return `Tu carrera: ${carrera.nombre}, en ${carrera.enDias} días${objetivo}`;
}
