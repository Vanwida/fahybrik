/**
 * Coach IA — composición de semana desde la BIBLIOTECA DE BLOQUES (0037).
 *
 * Dos capas:
 *   1) Funciones puras (sin DB): el heurístico determinista compone día/semana
 *      desde bloques ya cargados, respetando fase ATR + variedad de grupos +
 *      balance de carga; y el materializador de la respuesta LLM resuelve
 *      block_ids reales, descarta inventados y nunca repite el mismo bloque.
 *   2) Real DB (describeWithDb): el servicio completo `suggestWeekFromBlocks`
 *      contra la biblioteca seeded, SIN LLM (env limpio), produce una semana
 *      que referencia block_ids reales — el fallback heurístico de producción.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  composeWeekHeuristic,
  materializeLlmWeek,
  suggestWeekFromBlocks,
  type ComposableBlock,
} from '@/lib/dashboard/coach/ai/suggest-week-from-blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

// Env vars que, si están, enrutarían al LLM. Las limpiamos para forzar el
// camino determinista (y restauramos después).
const LLM_ENV_KEYS = [
  'PABLO_IA_MODEL',
  'PABLO_IA_API_KEY',
  'LLM_PROVIDER',
  'LLM_CHAT_MODEL',
  'LLM_MODEL',
  'LLM_API_KEY',
  'OPENROUTER_API_KEY',
];

// Biblioteca mínima: 2 bloques en cada uno de varios grupos cubriendo las 4
// clases (strength=1, cardio=3, recovery=5, metcon=7). Las descripciones son
// verbatim-like; el heurístico no las parsea.
function fixtureBlocks(): ComposableBlock[] {
  const mk = (
    id: number,
    title: string,
    group: number,
    format: string,
    mods: ComposableBlock['default_modifiers'] = null,
  ): ComposableBlock => ({
    id,
    slug: `block-${id}`,
    title,
    description: `${title} — prescripción verbatim de Pablo`,
    methodology_group_id: group,
    format,
    source_ref: `S1 – Día ${id}`,
    default_modifiers: mods,
  });
  return [
    mk(1, 'Front squat 5x10', 1, 'strength_block', { intensity_pct: 70 }),
    mk(2, 'Strict press 5x8', 1, 'strength_block'),
    mk(3, 'Row 4x3min', 3, 'erg_intervals'),
    mk(4, 'SkiErg 6x500m', 3, 'erg_intervals'),
    mk(5, 'Z2 run 45min', 5, 'zone2'),
    mk(6, 'Core circuit', 5, 'core_mobility'),
    mk(7, 'HYROX sim half', 7, 'race_sim'),
    mk(8, 'Metcon AMRAP', 7, 'metcon'),
  ];
}

describe('composeWeekHeuristic (pure, no LLM)', () => {
  const blocks = fixtureBlocks();
  const trainingDays = [1, 2, 3, 4, 5, 6]; // 7 días → 6 entreno + domingo rest

  test('compone una semana: días de entreno con bloques reales + domingo rest', () => {
    const res = composeWeekHeuristic({ blocks, training_days: trainingDays });

    expect(res.days).toHaveLength(7);
    expect(res.rest_days).toEqual([7]);

    // cada matched referencia un block_id que existe en la biblioteca
    const ids = new Set(blocks.map((b) => b.id));
    expect(res.matched.length).toBeGreaterThan(0);
    for (const m of res.matched) {
      expect(ids.has(m.block_id)).toBe(true);
    }

    // los 6 días de entreno tienen exactamente 1 sesión con >=1 bloque materializado
    const trainDays = res.days.filter((d) => trainingDays.includes(d.day_of_week));
    expect(trainDays).toHaveLength(6);
    for (const d of trainDays) {
      expect(d.sessions).toHaveLength(1);
      expect(d.sessions[0]!.blocks?.length).toBeGreaterThan(0);
      // el contenido verbatim viaja en coach_note; items vacío (Model A)
      const part = d.sessions[0]!.blocks![0]!;
      expect(part.items).toEqual([]);
      expect(part.coach_note && part.coach_note.length).toBeGreaterThan(0);
    }
  });

  test('varía grupos y no repite el mismo bloque dentro de la semana', () => {
    const res = composeWeekHeuristic({ blocks, training_days: trainingDays });
    const usedBlockIds = res.matched.map((m) => m.block_id);
    // sin repetidos (la biblioteca tiene suficientes bloques distintos)
    expect(new Set(usedBlockIds).size).toBe(usedBlockIds.length);
    // al menos 2 grupos distintos aparecen (variedad)
    const groups = new Set(res.matched.map((m) => m.methodology_group_id));
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  test('es determinista: misma entrada → misma salida (block_ids idénticos)', () => {
    const a = composeWeekHeuristic({ blocks, training_days: trainingDays });
    const b = composeWeekHeuristic({ blocks, training_days: trainingDays });
    expect(a.matched.map((m) => m.block_id)).toEqual(b.matched.map((m) => m.block_id));
  });

  test('inyecta el nivel del atleta en los modificadores', () => {
    const res = composeWeekHeuristic({
      blocks,
      training_days: [1],
      level: 'elite',
    });
    expect(res.matched[0]!.modifiers?.level).toBe('elite');
  });

  test('default_modifiers con claves null no rompe la materialización (block_modifiers limpio)', () => {
    // jsonb de la biblioteca puede traer placeholders a null; blockUseModifiersSchema
    // los rechaza. El materializador debe omitirlos, no propagarlos a block_modifiers.
    const dirty = fixtureBlocks().map((b) =>
      b.id === 1
        ? {
            ...b,
            default_modifiers: {
              intensity_pct: null,
              level: null,
              duration_min: null,
              rounds: null,
            } as unknown as ComposableBlock['default_modifiers'],
          }
        : b,
    );
    // No debe lanzar (antes weekDaySchema.parse rechazaba block_modifiers con null).
    const res = composeWeekHeuristic({ blocks: dirty, training_days: [1] });
    const part = res.days.find((d) => d.day_of_week === 1)!.sessions[0]!.blocks![0]!;
    expect(part.source_block_id).toBe(1);
    // todos null → sin block_modifiers (no un objeto vacío)
    expect(part.block_modifiers).toBeUndefined();
  });

  test('default_modifiers mezcla null + valor → conserva solo el valor real', () => {
    const dirty = fixtureBlocks().map((b) =>
      b.id === 1
        ? {
            ...b,
            default_modifiers: {
              intensity_pct: 85,
              level: null,
              duration_min: null,
              rounds: null,
            } as unknown as ComposableBlock['default_modifiers'],
          }
        : b,
    );
    const res = composeWeekHeuristic({ blocks: dirty, training_days: [1] });
    const part = res.days.find((d) => d.day_of_week === 1)!.sessions[0]!.blocks![0]!;
    expect(part.block_modifiers).toEqual({ intensity_pct: 85 });
  });
});

describe('materializeLlmWeek (parseo respuesta LLM, pure)', () => {
  const blocks = fixtureBlocks();

  test('resuelve block_ids reales del LLM a la semana materializada', () => {
    const res = materializeLlmWeek(
      {
        days: [
          { day_of_week: 1, kind: 'workout', blocks: [{ block_id: 1, modifiers: { intensity_pct: 80 } }] },
          { day_of_week: 2, kind: 'workout', block_ids: [3] },
          { day_of_week: 3, kind: 'rest' },
        ],
      },
      { blocks, training_days: [1, 2] },
    );

    expect(res.matched.map((m) => m.block_id).sort()).toEqual([1, 3]);
    // modificador del LLM se conserva
    const day1 = res.matched.find((m) => m.day_of_week === 1)!;
    expect(day1.modifiers?.intensity_pct).toBe(80);
    // día 3 marcado rest; días 4..7 sin item del LLM → también rest
    expect(res.rest_days).toContain(3);
  });

  test('descarta block_ids inventados y lo anota en notes', () => {
    const res = materializeLlmWeek(
      {
        days: [{ day_of_week: 1, kind: 'workout', block_ids: [999, 1] }],
      },
      { blocks, training_days: [1] },
    );
    // solo el 1 (real) se materializa; el 999 se descarta
    expect(res.matched.map((m) => m.block_id)).toEqual([1]);
    expect(res.notes).toContain('999');
  });

  test('día con TODOS los block_ids inventados → slot pendiente (no rest)', () => {
    const res = materializeLlmWeek(
      {
        days: [{ day_of_week: 1, kind: 'workout', block_ids: [999], focus: 'fuerza' }],
      },
      { blocks, training_days: [1] },
    );
    expect(res.matched).toHaveLength(0);
    const day1 = res.days.find((d) => d.day_of_week === 1)!;
    expect(day1.sessions).toHaveLength(1); // slot vacío, no descanso
    expect(day1.sessions[0]!.blocks ?? []).toEqual([]);
  });

  test('no repite el mismo bloque aunque el LLM lo ponga dos veces', () => {
    const res = materializeLlmWeek(
      {
        days: [{ day_of_week: 1, kind: 'workout', block_ids: [1, 1, 2] }],
      },
      { blocks, training_days: [1] },
    );
    expect(res.matched.map((m) => m.block_id)).toEqual([1, 2]);
  });
});

// Real-DB: el servicio completo SIN LLM contra la biblioteca seeded.
// Skipped (loud) si TEST_DATABASE_URL no está — nunca un falso verde.
describeWithDb('suggestWeekFromBlocks heuristic fallback (real DB, no LLM)', () => {
  const sql = getTestSql();
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of LLM_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of LLM_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('compone semana ACC desde bloques reales sin LLM', async () => {
    const res = await suggestWeekFromBlocks({
      coach_id: 1,
      body: { focus: 'acumulación volumen + ergómetros', mode: 'fast' },
      client: sql,
    });

    expect(res.source).toBe('library');
    expect(res.days).toHaveLength(7);
    expect(res.matched_blocks.length).toBeGreaterThan(0);

    // todos los block_id materializados existen realmente en la biblioteca
    const ids = res.matched_blocks.map((m) => m.block_id);
    const real = await sql<Array<{ id: number }>>`
      select id from blocks where id in ${sql(ids)}
    `;
    expect(real.length).toBe(new Set(ids).size);
  });
});
