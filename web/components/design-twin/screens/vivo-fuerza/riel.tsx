'use client';

// EL RIEL DE SERIES — dónde vas, y cómo fueron las anteriores.
//
// Es la LISTA de esta familia, y su problema no es el de la lista de rondas. Una
// lista de rondas crece hacia abajo y empuja lo que tiene debajo; el riel es una
// FILA, así que crece hacia dentro: con doce series cada peldaño se queda en 26
// pt y ahí no cabe ni «S12». Lo que se pierde no es el alto de la pantalla, es lo
// único que el riel sabe decir.
//
// Y no se colapsa a un cursor como el contador de rondas, porque las series NO
// son homogéneas: la forma dominante del corpus es la pirámide (6-6-4-4-3,
// 10-8-8-6-4), así que la fila 4 no repite la 3 y colapsarlas destruye
// información. Para lo heterogéneo la respuesta ya estaba decidida el 10-ago y es
// la de las estaciones de un HYROX: la VENTANA alrededor del cursor — la cerrada
// de antes, la que haces, la que viene. Con las tres, las dos preguntas que se
// hace el que está levantando («cómo fue la última», «cambia la siguiente»)
// siguen contestadas; con doce peldaños ilegibles, ninguna.
//
// Lo que la ventana NO se lleva por delante: tocar un peldaño sigue abriendo su
// ajuste, que es lo que el riel hacía (`RielDeSeries.alTocar` → `EditorDeSerie`).
// Un rediseño que quita una función y se llama mejora es lo que el contador de
// rondas tuvo prohibido con el deshacer.

import { IconCheckCircle, Label, Mono, RAD } from '../../kit';
import {
  UMBRAL_VENTANA,
  hechaEnLinea,
  peldanosVisibles,
  serieEnLinea,
  type Ejercicio,
  type SerieHecha,
} from './modelo';

type Estado = 'hecha' | 'ajustada' | 'saltada' | 'actual' | 'futura';

function estadoDe(i: number, activa: number, hechas: Record<number, SerieHecha>): Estado {
  const h = hechas[i];
  if (h) return h.estado;
  return i === activa ? 'actual' : 'futura';
}

/**
 * Un peldaño. La marca de la serie cerrada dice CÓMO se cerró: verde la que se
 * hizo como estaba escrita, ámbar la que se ajustó — mismo criterio que
 * `RielDeSeries` en Swift (`status == "scaled"`).
 */
function Peldano({
  numero,
  dosis,
  estado,
  onClick,
}: {
  numero: number;
  dosis: string | null;
  estado: Estado;
  onClick: () => void;
}) {
  const actual = estado === 'actual';
  const cerrada = estado === 'hecha' || estado === 'ajustada';
  const voz =
    estado === 'saltada'
      ? 'saltada'
      : cerrada
        ? estado === 'hecha'
          ? 'hecha'
          : 'ajustada'
        : actual
          ? 'la que toca'
          : 'pendiente';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Serie ${numero}, ${voz}${dosis ? `, ${dosis}` : ''}. Tocar para ajustar`}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: '9px 4px',
        borderRadius: RAD.m,
        cursor: 'pointer',
        // Translúcida: el tinte de zona se ve DEBAJO de los apoyos, o el ambiente
        // se corta en una línea recta a media pantalla.
        background: actual
          ? 'color-mix(in srgb, var(--twin-accent) 16%, transparent)'
          : 'color-mix(in srgb, var(--twin-surface) 78%, transparent)',
        border: `${actual ? 1.5 : 1}px solid ${actual ? 'var(--twin-accent-text)' : 'var(--twin-hairline)'}`,
        opacity: estado === 'saltada' ? 0.5 : 1,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {cerrada && (
          <span
            style={{
              color: estado === 'ajustada' ? 'var(--twin-warning)' : 'var(--twin-ok)',
              display: 'inline-flex',
            }}
          >
            <IconCheckCircle size={11} />
          </span>
        )}
        <span
          style={{
            font: `italic 800 11px/1.1 var(--twin-font-sans)`,
            letterSpacing: '0.04em',
            color: actual ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
          }}
        >
          {`S${numero}`}
        </span>
      </span>
      {/* Una serie pendiente SÍ dice su dosis, y aquí está la mitad del valor del
          riel: en una pirámide la siguiente no es la de ahora. Lo que no dice es
          un guion cuando no hay dosis escrita — se calla (§7). */}
      {dosis && (
        <Mono
          size={11}
          weight={actual ? 800 : 600}
          color={actual ? 'var(--twin-fg)' : 'var(--twin-muted)'}
          style={{
            textDecoration: estado === 'saltada' ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {dosis}
        </Mono>
      )}
    </button>
  );
}

export function Riel({
  ejercicio,
  activa,
  hechas,
  onAjustar,
}: {
  ejercicio: Ejercicio;
  /** Índice base 0 de la serie que tienes delante. */
  activa: number;
  hechas: Record<number, SerieHecha>;
  onAjustar: (i: number) => void;
}) {
  const total = ejercicio.series.length;
  const visibles = peldanosVisibles(total, activa);
  const esVentana = total >= UMBRAL_VENTANA;
  const cerradas = Object.keys(hechas).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
      {/* La cabecera solo cuando es ventana: enseñando tres de doce hay que decir
          que son tres de doce, o el atleta cree que su ejercicio tiene tres. */}
      {esVentana && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Label size={10}>Tus series</Label>
          <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {`${cerradas} cerradas de ${total}`}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        {visibles.map((i) => {
          const h = hechas[i];
          return (
            <Peldano
              key={i}
              numero={i + 1}
              // La cerrada enseña lo que se REGISTRÓ, no lo que se pidió: si en la
              // 3 bajaste el peso, eso es justo lo que quieres ver antes de
              // decidir la 4.
              dosis={h ? hechaEnLinea(h) : serieEnLinea(ejercicio.series[i])}
              estado={estadoDe(i, activa, hechas)}
              onClick={() => onAjustar(i)}
            />
          );
        })}
      </div>
    </div>
  );
}
