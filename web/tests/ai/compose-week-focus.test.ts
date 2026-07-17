import { describe, expect, test } from 'vitest';
import { composeWeekHeuristic } from '@/lib/dashboard/coach/ai/compose-week-heuristic';
import { materializeLlmWeek } from '@/lib/dashboard/coach/ai/compose-week-llm';
import { blockIsTyped, summarizeUntypedGroups } from '@/lib/dashboard/coach/ai/blocks-catalog';
import type { ComposableBlock, MethodologyGroup } from '@/lib/dashboard/coach/ai/blocks-catalog';
import { untypedBlocksNotice, llmFallbackNotice } from '@/lib/dashboard/coach/ai/week-notices';

/**
 * El foco tiene que MANDAR — en los dos caminos (modelo y heurístico) — y lo que
 * no se pueda honrar tiene que DECIRSE. Estos tests son el contrato del fallo que
 * explotó en producción: se pidió doble sesión de running/híbrido enfocado en
 * HYROX y salió una rotación genérica, una sesión por día, sin avisar de nada.
 */

// Réplica reducida de la biblioteca REAL de coach 60 (verificada contra prod):
// running (grupo 4) y circuitos (9) tipados; simulaciones HYROX (7) y WODs (6)
// SIN tipar — que es exactamente por qué "enfocado en hyrox" no se puede servir.
const GROUPS: MethodologyGroup[] = [
  { id: 1, slug: 'fuerza-base', name_es: 'Fuerza Base' },
  { id: 4, slug: 'series-running', name_es: 'Series de Running' },
  { id: 5, slug: 'zona2-recuperacion', name_es: 'Zona 2 / Recuperación Aeróbica' },
  { id: 6, slug: 'wods-metcons', name_es: 'WODs / Metcons Competitivos' },
  { id: 7, slug: 'simulaciones-carrera', name_es: 'Simulaciones de Carrera (HYROX / DEKA)' },
  { id: 9, slug: 'circuitos-funcionales', name_es: 'Circuitos Funcionales de Fuerza-Resistencia' },
];

function block(id: number, group: number, title: string, typed = true): ComposableBlock {
  return {
    id,
    slug: `b-${id}`,
    title,
    description: title,
    methodology_group_id: group,
    format: null,
    source_ref: null,
    default_modifiers: null,
    exercises: typed
      ? [
          {
            exercise_id: 100 + id,
            exercise_name: 'Ejercicio',
            prescription_json: { modality: 'strength', sets: [{ reps: 10, load_pct: 70 }] },
            params_json: null,
            notes: null,
          },
        ]
      : [],
  };
}

const LIBRARY: ComposableBlock[] = [
  block(1, 1, 'Front squat 5 rounds'),
  block(2, 1, 'Deadlift 5r'),
  block(31, 4, 'Series pista: 2x1200'),
  block(32, 4, 'Treadmill Threshold 5x6'),
  block(50, 5, 'Run 1h15 zona 2'),
  block(51, 5, 'Run 1h10 zona 2'),
  block(90, 9, 'EMOM 15: 20 BW lunges'),
  block(91, 9, '6r Pull ups'),
  // Los de HYROX: SOLO PROSA (sin block_exercises) — no se pueden insertar.
  block(65, 7, 'HALF SIMULATION DEKA', false),
  block(66, 7, 'EMOM 10 sled push 170kg', false),
  block(70, 6, 'WOD competitivo', false),
];

const TYPED = LIBRARY.filter(blockIsTyped);

describe('el heurístico (fallback) HONRA el foco', () => {
  test('doble sesión → 2 sesiones cada día de entreno', () => {
    const res = composeWeekHeuristic({
      blocks: TYPED,
      training_days: [1, 2, 3],
      sessions_per_day: 2,
    });
    for (const dow of [1, 2, 3]) {
      const day = res.days.find((d) => d.day_of_week === dow)!;
      expect(day.sessions, `día ${dow}`).toHaveLength(2);
    }
  });

  test('sin pedir doble → 1 sesión (no se inventa una segunda)', () => {
    const res = composeWeekHeuristic({ blocks: TYPED, training_days: [1, 2, 3] });
    expect(res.days.find((d) => d.day_of_week === 1)!.sessions).toHaveLength(1);
  });

  test('grupos pedidos → SOLO se usan esos (el foco manda)', () => {
    const res = composeWeekHeuristic({
      blocks: TYPED,
      training_days: [1, 2, 3],
      sessions_per_day: 2,
      preferred_group_ids: [4, 5], // running + z2
    });
    const groups = new Set(res.matched.map((m) => m.methodology_group_id));
    expect([...groups].sort()).toEqual([4, 5]);
    // …y NADA de fuerza, que no la pidió.
    expect(groups.has(1)).toBe(false);
  });

  test('sin grupos pedidos → recorre la biblioteca entera (comportamiento de siempre)', () => {
    const res = composeWeekHeuristic({ blocks: TYPED, training_days: [1, 2, 3] });
    expect(new Set(res.matched.map((m) => m.methodology_group_id)).size).toBeGreaterThan(1);
  });

  test('un grupo pedido del que no queda nada usable no rompe la semana', () => {
    // 7 = simulaciones, todas sin tipar → no están en TYPED.
    const res = composeWeekHeuristic({
      blocks: TYPED,
      training_days: [1, 2],
      preferred_group_ids: [7, 4],
    });
    expect(res.matched.every((m) => m.methodology_group_id === 4)).toBe(true);
  });

  test('el slot es POSICIONAL: session_index 0 y 1 en el mismo día', () => {
    const res = composeWeekHeuristic({
      blocks: TYPED,
      training_days: [1],
      sessions_per_day: 2,
    });
    const lunes = res.matched.filter((m) => m.day_of_week === 1);
    expect(lunes.map((m) => m.session_index).sort()).toEqual([0, 1]);
  });
});

describe('materializeLlmWeek — respeta las sesiones que eligió el modelo', () => {
  test('dos sesiones por día → doble sesión materializada', () => {
    const res = materializeLlmWeek(
      {
        days: [
          {
            day_of_week: 1,
            kind: 'workout',
            sessions: [
              { blocks: [{ block_id: 31 }], focus: 'Series' },
              { blocks: [{ block_id: 1 }], focus: 'Fuerza' },
            ],
          },
          { day_of_week: 2, kind: 'rest' },
        ],
      },
      { blocks: TYPED, training_days: [1] },
    );
    const lunes = res.days.find((d) => d.day_of_week === 1)!;
    expect(lunes.sessions).toHaveLength(2);
    expect(lunes.sessions[0]!.focus).toBe('Series');
    expect(lunes.sessions[1]!.focus).toBe('Fuerza');
    expect(res.matched.map((m) => m.session_index)).toEqual([0, 1]);
  });

  test('compat: bloques colgando del día = una sola sesión', () => {
    const res = materializeLlmWeek(
      { days: [{ day_of_week: 1, kind: 'workout', block_ids: [31] }] },
      { blocks: TYPED, training_days: [1] },
    );
    expect(res.days.find((d) => d.day_of_week === 1)!.sessions).toHaveLength(1);
  });

  test('un block_id inventado se descarta y se anota (nunca se inventa contenido)', () => {
    const res = materializeLlmWeek(
      { days: [{ day_of_week: 1, kind: 'workout', sessions: [{ blocks: [{ block_id: 9999 }] }] }] },
      { blocks: TYPED, training_days: [1] },
    );
    expect(res.notes).toContain('9999');
  });
});

describe('avisos honestos — lo que NO se pudo hacer se dice', () => {
  test('el contenido HYROX sin tipar se resume con su nombre REAL y su cuenta', () => {
    const summary = summarizeUntypedGroups({
      blocks: LIBRARY,
      groups: GROUPS,
      requested_group_ids: [7, 6], // pidió hyrox
    });
    expect(summary).toEqual([
      { name: 'Simulaciones de Carrera (HYROX / DEKA)', count: 2, requested: true },
      { name: 'WODs / Metcons Competitivos', count: 1, requested: true },
    ]);
  });

  test('si lo sin tipar es lo que PIDIÓ → warning que lo nombra, con salida a la Biblioteca', () => {
    const notice = untypedBlocksNotice([
      { name: 'Simulaciones de Carrera (HYROX / DEKA)', count: 14, requested: true },
      { name: 'WODs / Metcons Competitivos', count: 9, requested: true },
    ])!;
    expect(notice.tone).toBe('warning');
    expect(notice.message).toContain('14 «Simulaciones de Carrera (HYROX / DEKA)»');
    expect(notice.message).toContain('9 «WODs / Metcons Competitivos»');
    expect(notice.message).toContain('no he podido usarlos');
    expect(notice.href).toBe('/biblioteca');
  });

  test('si no lo pidió → info, no warning (no se le da la brasa)', () => {
    const notice = untypedBlocksNotice([{ name: 'Tapering', count: 2, requested: false }])!;
    expect(notice.tone).toBe('info');
  });

  test('sin bloques sin tipar → no hay aviso', () => {
    expect(untypedBlocksNotice([])).toBeNull();
  });

  test('el fallback NUNCA es mudo: dice que no hubo IA y por qué', () => {
    const notice = llmFallbackNotice('respondió algo que no he podido leer');
    expect(notice.tone).toBe('warning');
    expect(notice.message).toContain('No he podido usar la IA');
    expect(notice.message).toContain('respondió algo que no he podido leer');
  });
});
