// Prueba de humo del pintado de lo nuevo en el panel del coach: la tabla de
// series de un tramo, el chip de un libre en el calendario y su marca en los
// siete puntos. Renderizar a HTML no sustituye a verlo, pero caza lo que un test
// de dominio no ve: un campo nulo que revienta el pintado o un rótulo que falta.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActualDetail, actualTokens } from '@/components/v2/sesion/ItemPrescritoHecho';
import { SessionChip } from '@/components/v2/atleta-detalle/plan/SessionChip';
import { WeekDots } from '@/components/v2/shared/WeekDots';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import type { CalSession } from '@/lib/dashboard/v2/atleta-detalle-types';

const strength = {
  position: 1,
  item_uid: 'segment-9',
  modality: 'strength',
  started_at: null,
  duration_seconds: 900,
  reps_completed: null,
  weight_used_kg: 120,
  distance_meters: null,
  erg_splits: null,
  sets: [
    { set_index: 1, status: 'done', reps: 5, kg: 100, reps_prescribed: 5, kg_prescribed: 100, rpe: 7, rir: 3, tempo: null, rest_s: 120 },
    { set_index: 2, status: 'done', reps: 5, kg: 110, reps_prescribed: 5, kg_prescribed: 105, rpe: 7.5, rir: 2, tempo: null, rest_s: null },
    { set_index: 3, status: 'skipped', reps: null, kg: null, reps_prescribed: 3, kg_prescribed: 115, rpe: null, rir: null, tempo: null, rest_s: null },
  ],
  volume_kg: 1050,
} as unknown as SegmentActual;

describe('tramo con series', () => {
  it('los chips resumen series y volumen, sin el «@120 kg» ambiguo', () => {
    expect(actualTokens(strength)).toEqual(['2 series', '1050 kg vol.']);
  });

  it('la tabla pinta cada serie, lo pedido cuando difiere, RPE/RIR y la saltada', () => {
    const html = renderToStaticMarkup(createElement(ActualDetail, { a: strength }));
    expect(html).toContain('RPE');
    expect(html).toContain('RIR');
    expect(html).toContain('Desc.');
    expect(html).not.toContain('Tempo');
    expect(html).toContain('/105'); // pedido 105, hecho 110
    expect(html).toContain('saltada');
    expect(html).toContain('7.5');
  });
});

describe('un libre en el calendario y en la semana', () => {
  const libre: CalSession = {
    id: '7',
    date: '2026-09-22',
    title: 'Rodaje suave',
    modality: 'carrera',
    modality_label: 'Carrera',
    status: 'completed',
    done: true,
    missed: false,
    excluded: false,
    planned_min: null,
    planned_open: false,
    has_content: true,
    editable: false,
    rpe: 5,
    libre: true,
  };

  it('el chip dice «Libre», va discontinuo y no se arrastra', () => {
    const html = renderToStaticMarkup(
      createElement(SessionChip, { session: libre, onOpen: () => {}, dragging: false, onDragStart: () => {}, onDragEnd: () => {} }),
    );
    expect(html).toContain('Libre');
    expect(html).toContain('border-dashed');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('no cuenta en la adherencia');
  });

  it('el punto del día sigue siendo del plan y nombra el libre', () => {
    const html = renderToStaticMarkup(
      createElement(WeekDots, {
        days: [
          { date: '2026-09-22', state: 'rest', is_today: false, sessions: [{ title: 'Rodaje suave', done: true, libre: true }] },
        ],
      }),
    );
    expect(html).toContain('Rodaje suave (libre, hecho)');
    expect(html).toContain('descanso');
  });
});
