'use client';

// «Tus marcas» — espejo de ios/FAHYBRIK/Marks/MarksLibraryView.swift.
//
// Tres grupos, tres orígenes, una lista. Cada fila lleva la mejor marca
// comparable, cuánto hace y de dónde salió; «Aún sin marca» es una invitación,
// no un vacío triste.

import { useState } from 'react';
import { Card, ChevronRight, Hairline, Micro, Mono, NAVBAR_H, NavBar } from './chrome';
import { best, latest, markValue, paceLine, relative, type Mark } from './fixtures';

export function MarksLibrary({ marks, onOpen }: { marks: readonly Mark[]; onOpen: (mark: Mark) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);

  return (
    <>
      {/* La biblioteca se abre desde Perfil, Inicio y el plan libre: sin un
          «anterior» único, iOS deja el galón pelado. Ese destino vive fuera del doble. */}
      <NavBar title="Tus marcas" back={{}} scrolled={scrolled} />
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
        <Grupo titulo="Carreras" items={marks.filter((m) => m.group === 'race')} {...{ onOpen, pressed, setPressed }} />
      </div>
    </>
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

      {mejor ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Mono size={15}>{markValue(mark, mejor.value)}</Mono>
          {ritmo && (
            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{ritmo}</span>
          )}
        </span>
      ) : (
        <Mono size={15} color="var(--twin-faint)">
          —
        </Mono>
      )}

      <span style={{ color: 'var(--twin-faint)', display: 'inline-flex' }}>
        <ChevronRight />
      </span>
    </button>
  );
}

/** «hace 3 semanas · test del coach» — antigüedad más el sello del origen. */
function subtitulo(mark: Mark): string {
  const ultima = latest(mark);
  if (!ultima) {
    return mark.measuredBy === 'registered' ? 'Aún sin tiempo' : `Aún sin marca · ${mark.approxLabel}`;
  }
  const partes: string[] = [relative(ultima.daysAgo)];
  if (ultima.source === 'coach_test') partes.push('test del coach');
  if (ultima.source === 'registered' && ultima.eventName) partes.push(ultima.eventName);
  return partes.join(' · ');
}

function colorDeGrupo(mark: Mark): string {
  if (mark.group === 'run') return 'var(--twin-accent)';
  if (mark.group === 'ergo') return 'var(--twin-info)';
  return 'var(--twin-modality-hyrox)';
}
