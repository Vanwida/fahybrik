'use client';

// «Tus marcas» — espejo de ios/FAHYBRIK/Marks/MarksLibraryView.swift.
//
// Tres grupos, tres orígenes, una lista. Cada fila lleva la mejor marca
// comparable, cuánto hace y de dónde salió; «Aún sin marca» es una invitación,
// no un vacío triste.

import { useState, type ReactNode } from 'react';
import {
  Card,
  ChevronRight,
  EmptySymbol,
  Hairline,
  Micro,
  Mono,
  NAVBAR_H,
  NavBar,
  Spinner,
  VacioHonesto,
} from './chrome';
import { best, markValue, originLabel, paceLine, relative, type Mark } from './fixtures';

/** Los cuatro estados de `MarksLibraryView.content`: cargando → fallo → catálogo vacío → lista. */
export type MarksEstado = 'cargando' | 'fallo' | 'lista';

export function MarksLibrary({
  marks,
  estado,
  onOpen,
  onRetry,
}: {
  marks: readonly Mark[];
  estado: MarksEstado;
  onOpen: (mark: Mark) => void;
  onRetry: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);

  return (
    <>
      {/* La biblioteca se abre desde Perfil, Inicio y el plan libre: sin un
          «anterior» único, iOS deja el galón pelado. Ese destino vive fuera del doble.
          El título se mantiene en los cuatro estados — sólo cambia el contenido. */}
      <NavBar title="Tus marcas" back={{}} scrolled={scrolled} />

      {estado === 'cargando' ? (
        <Centro>
          <Spinner size={28} />
        </Centro>
      ) : estado === 'fallo' ? (
        <Centro>
          <VacioHonesto
            simbolo={<EmptySymbol tipo="reintentar" />}
            titulo="No pudimos cargar tus marcas"
            mensaje="Revisa tu conexión e inténtalo de nuevo."
            salida={{ tipo: 'accion', texto: 'REINTENTAR', onTap: onRetry }}
          />
        </Centro>
      ) : marks.length === 0 ? (
        // Preguntamos y no hay catálogo: no es un hueco que el atleta pueda
        // llenar con ningún acto suyo, así que la salida se explica.
        <Centro>
          <VacioHonesto
            simbolo={<EmptySymbol tipo="cronometro" />}
            titulo="Todavía no hay marcas"
            mensaje="Aquí verás tus mejores tiempos de cada prueba."
            salida={{
              tipo: 'explicado',
              nota: 'Tu coach define qué pruebas entran, y aparecen aquí en cuanto las publique.',
            }}
          />
        </Centro>
      ) : (
        <div
          className="twin-scroll"
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          style={{
            position: 'absolute',
            inset: 0,
            paddingTop: NAVBAR_H + 16,
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Grupo titulo="Correr" items={marks.filter((m) => m.group === 'run')} {...{ onOpen, pressed, setPressed }} />
          <Grupo
            titulo="Remo y SkiErg"
            items={marks.filter((m) => m.group === 'ergo')}
            {...{ onOpen, pressed, setPressed }}
          />
          <Grupo
            titulo="Carreras"
            items={marks.filter((m) => m.group === 'race')}
            {...{ onOpen, pressed, setPressed }}
          />
        </div>
      )}
    </>
  );
}

/** El hueco de `CenteredScreen`: bajo la barra, centrado en el resto de la pantalla. */
function Centro({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: NAVBAR_H,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

interface GrupoProps {
  titulo: string;
  items: Mark[];
  onOpen: (mark: Mark) => void;
  pressed: string | null;
  setPressed: (slug: string | null) => void;
}

function Grupo({ titulo, items, onOpen, pressed, setPressed }: GrupoProps) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Micro>{titulo}</Micro>
      <Card padding={0}>
        {items.map((mark, i) => (
          <div key={mark.slug}>
            <Fila
              mark={mark}
              pressed={pressed === mark.slug}
              onPress={setPressed}
              onOpen={() => onOpen(mark)}
            />
            {i < items.length - 1 && <Hairline inset={16} />}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Fila({
  mark,
  pressed,
  onPress,
  onOpen,
}: {
  mark: Mark;
  pressed: boolean;
  onPress: (slug: string | null) => void;
  onOpen: () => void;
}) {
  const mejor = best(mark);
  const ritmo = mejor ? paceLine(mark, mejor.value) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={() => onPress(mark.slug)}
      onPointerUp={() => onPress(null)}
      onPointerLeave={() => onPress(null)}
      onPointerCancel={() => onPress(null)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        border: 0,
        background: pressed ? 'var(--twin-surface-elevated)' : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background-color 120ms ease-out',
      }}
    >
      <span
        aria-hidden
        style={{ width: 3, height: 30, borderRadius: 2, flexShrink: 0, background: colorDeGrupo(mark) }}
      />

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ font: '600 16px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{mark.label}</span>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {subtitulo(mark)}
        </span>
      </span>

      {mejor && (
        // Sin marca no hay número que enseñar — la fila entera pasa a EmptyView
        // en este lado (§6.2 bis/§7): el hueco ya está dicho con palabras en el
        // subtítulo, y un guion aquí sería fingir una medida que no existe.
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Mono size={15}>{markValue(mark, mejor.value)}</Mono>
          {ritmo && (
            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{ritmo}</span>
          )}
        </span>
      )}

      <span style={{ color: 'var(--twin-faint)', display: 'inline-flex' }}>
        <ChevronRight />
      </span>
    </button>
  );
}

/**
 * «hace 3 semanas · test del coach» — antigüedad más el sello del origen.
 * La fila pinta el MEJOR resultado, así que fecha y sello describen ESE, no el
 * último: usar `latest` aquí fue lo que dejaba una fecha reciente sobre un
 * número declarado hace meses.
 */
function subtitulo(mark: Mark): string {
  const mejor = best(mark);
  if (!mejor) {
    return mark.measuredBy === 'registered' ? 'Aún sin tiempo' : `Aún sin marca · ${mark.approxLabel}`;
  }
  const partes: string[] = [relative(mejor.daysAgo)];
  // El sello sale cuando el número NO es una medición propia del atleta:
  // del coach, de una carrera, o declarado al entrar. `athlete_test` es el
  // caso por defecto de esta biblioteca y se deja implícito.
  if (mejor.source !== 'athlete_test') {
    const origen = originLabel(mejor.source, mejor.eventName);
    if (origen) partes.push(origen);
  }
  return partes.length > 0 ? partes.join(' · ') : mark.approxLabel;
}

function colorDeGrupo(mark: Mark): string {
  if (mark.group === 'run') return 'var(--twin-accent)';
  if (mark.group === 'ergo') return 'var(--twin-info)';
  return 'var(--twin-modality-hyrox)';
}
