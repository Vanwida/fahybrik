// prescriptionToText — un run ESTRUCTURADO (#61) se narra, no se resume.
//
// CASO REAL (10-ago-2026): el conector guardó «fartlek 16×500 Z4 / 1' Z2 al
// trote» con su estructura tipada, y la línea que leían el coach y el atleta era
// el PLANO: "16×500m @ Z4 · r1'" — con la recuperación ACTIVA (trotar en Z2)
// degradada a «descanso». Trotar no es pararse: es trabajo prescrito. Desde aquí
// la línea narra la estructura con el MISMO vocabulario del plano (medidas,
// zonas, ritmos y la grafía "rX" del descanso), y solo cae al plano cuando la
// estructura no se puede leer o no cabe en una línea.

import { describe, expect, test } from 'vitest';
import { prescriptionToText, type Prescription, type RunStructure } from '@fahybrid/shared/domain/prescription';

/** El fartlek real, tal y como lo dictó el coach por el conector. */
const FARTLEK: RunStructure = [
  {
    role: 'main',
    elements: [
      {
        times: 16,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 500 }, target: { type: 'hr_zone', zone: 4 } },
          {
            kind: 'recovery',
            measure: { type: 'duration', s: 60 },
            target: { type: 'hr_zone', zone: 2 },
            recovery_mode: 'trote',
          },
        ],
      },
    ],
  },
];

const FARTLEK_TEXT = "16×(500m @ Z4 / 1' trote Z2)";

function run(structure: RunStructure, flat: Partial<Prescription> = {}): Prescription {
  return { scheme: 'intervals', modality: 'run', ...flat, structure };
}

/** Una fase principal con un solo tramo de trabajo, para los casos de recuperación. */
function bout(recovery: Record<string, unknown>): RunStructure {
  return [
    {
      role: 'main',
      elements: [
        {
          times: 4,
          elements: [
            { kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'pace_zone', zone: 4 } },
            recovery as never,
          ],
        },
      ],
    },
  ];
}

describe('la estructura se narra (y el plano se calla)', () => {
  test('el caso real: el trabajo Y la recuperación activa con su zona', () => {
    // La prescripción canónica lleva estructura Y plano (contrato aditivo).
    const p = run(FARTLEK, {
      rounds: 16,
      rest_s: 60,
      target: { kind: 'hr_zone', value: 4 },
      sets: [{ measure: { kind: 'distance', meters: 500 }, rest_s: 60 }],
    });
    expect(prescriptionToText(p)).toBe(FARTLEK_TEXT);
    // Lo que ya NO dice: el resumen plano que degradaba el trote a descanso.
    expect(prescriptionToText(p)).not.toBe("16×500m @ Z4 · r1'");
  });

  test('estructura SOLA (lo que se escribió antes del contrato aditivo) también habla', () => {
    expect(prescriptionToText(run(FARTLEK))).toBe(FARTLEK_TEXT);
  });

  test('la nota del coach sigue cerrando la línea', () => {
    expect(prescriptionToText(run(FARTLEK, { note: 'los 4 últimos a tope' }))).toBe(
      `${FARTLEK_TEXT} · los 4 últimos a tope`,
    );
  });
});

describe('la recuperación dice CÓMO se recupera', () => {
  test('parada y sin objetivo: el descanso clásico "r1\'"', () => {
    const text = prescriptionToText(
      run(bout({ kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' })),
    );
    expect(text).toBe("4×(400m @ Z4 / r1')");
  });

  test('sin decir cómo y sin objetivo: también el descanso clásico', () => {
    const text = prescriptionToText(
      run(bout({ kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null })),
    );
    expect(text).toBe("4×(400m @ Z4 / r1')");
  });

  test('caminando y sin objetivo: la palabra se queda (caminar no es pararse)', () => {
    const text = prescriptionToText(
      run(bout({ kind: 'recovery', measure: { type: 'duration', s: 120 }, target: null, recovery_mode: 'caminar' })),
    );
    expect(text).toBe("4×(400m @ Z4 / 2' caminar)");
  });

  test('con objetivo y sin modo: la zona de la recuperación se dice', () => {
    const text = prescriptionToText(
      run(bout({ kind: 'recovery', measure: { type: 'duration', s: 90 }, target: { type: 'pace_zone', zone: 2 } })),
    );
    expect(text).toBe("4×(400m @ Z4 / 90'' Z2)");
  });

  test('la pendiente de la cuesta va en la línea (no es lo mismo en llano)', () => {
    const structure: RunStructure = [
      {
        role: 'main',
        elements: [
          {
            times: 8,
            elements: [
              {
                kind: 'work',
                measure: { type: 'duration', s: 45 },
                target: { type: 'rpe', min: 8, max: 9 },
                incline_pct: 8,
              },
              { kind: 'recovery', measure: { type: 'duration', s: 120 }, target: null, recovery_mode: 'caminar' },
            ],
          },
        ],
      },
    ];
    expect(prescriptionToText(run(structure))).toBe("8×(45'' @ RPE 8-9 al 8% / 2' caminar)");
  });

  test('pendiente decimal en castellano (6,5%) y sin objetivo', () => {
    const structure: RunStructure = [
      {
        role: 'main',
        elements: [{ kind: 'work', measure: { type: 'duration', s: 1200 }, target: null, incline_pct: 6.5 }],
      },
    ];
    expect(prescriptionToText(run(structure))).toBe("20' al 6,5%");
  });

  test('recuperación medida en distancia (200m al trote)', () => {
    const text = prescriptionToText(
      run(bout({ kind: 'recovery', measure: { type: 'distance', m: 200 }, target: null, recovery_mode: 'trote' })),
    );
    expect(text).toBe('4×(400m @ Z4 / 200m trote)');
  });
});

describe('fases y anidamiento', () => {
  test('calentamiento + principal + vuelta: se narra la principal y se suma el resto', () => {
    const structure: RunStructure = [
      { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 900 }, target: { type: 'pace_zone', zone: 1 } }] },
      ...FARTLEK,
      { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'pace_zone', zone: 1 } }] },
    ];
    expect(prescriptionToText(run(structure))).toBe(`${FARTLEK_TEXT} · con calentamiento y vuelta`);
  });

  test('solo calentamiento: se nombra solo él', () => {
    const structure: RunStructure = [
      { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 900 }, target: null }] },
      ...FARTLEK,
    ];
    expect(prescriptionToText(run(structure))).toBe(`${FARTLEK_TEXT} · con calentamiento`);
  });

  test('anidado 3×(4×400 / r3\'): los paréntesis dicen dónde acaba cada repetición', () => {
    const structure: RunStructure = [
      {
        role: 'main',
        elements: [
          {
            times: 3,
            elements: [
              {
                times: 4,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'rpe', value: 9 } },
                  { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' },
                ],
              },
              { kind: 'recovery', measure: { type: 'duration', s: 180 }, target: null, recovery_mode: 'parado' },
            ],
          },
        ],
      },
    ];
    expect(prescriptionToText(run(structure))).toBe("3×(4×(400m @ RPE 9 / r1') / r3')");
  });

  test('progresivo heterogéneo: tramo a tramo, sin inventar una repetición', () => {
    const structure: RunStructure = [
      {
        role: 'main',
        elements: [2, 3, 4].map((zone) => ({
          kind: 'work' as const,
          measure: { type: 'distance' as const, m: 1000 },
          target: { type: 'pace_zone' as const, zone },
        })),
      },
    ];
    expect(prescriptionToText(run(structure))).toBe('1000m @ Z2 / 1000m @ Z3 / 1000m @ Z4');
  });

  test('una repetición de un solo tramo no lleva paréntesis (el "4×1000m" de siempre)', () => {
    const structure: RunStructure = [
      {
        role: 'main',
        elements: [
          {
            times: 4,
            elements: [
              { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace', value_s: 250 } },
            ],
          },
        ],
      },
    ];
    expect(prescriptionToText(run(structure))).toBe('4×1000m @ 4:10/km');
  });
});

describe('degradación: nunca peor que el plano', () => {
  /** Una pirámide de 7 tramos con su recuperación: 14 elementos, línea kilométrica. */
  const PYRAMID: RunStructure = [
    {
      role: 'main',
      elements: [200, 400, 600, 800, 600, 400, 200].flatMap((m) => [
        { kind: 'work' as const, measure: { type: 'distance' as const, m }, target: { type: 'pace' as const, value_s: 240 } },
        { kind: 'recovery' as const, measure: { type: 'duration' as const, s: 90 }, target: null, recovery_mode: 'trote' as const },
      ]),
    },
  ];

  test('narración que no cabe en una línea + plano presente → el plano resume', () => {
    const p = run(PYRAMID, {
      rounds: 7,
      rest_s: 90,
      target: { kind: 'pace', unit: 'per_km', value_s: 240 },
      sets: [{ measure: { kind: 'distance', meters: 200 }, rest_s: 90 }],
    });
    expect(prescriptionToText(p)).toBe("7×200m @ 4:00/km · r90''");
  });

  test('narración que no cabe PERO sin plano → larga antes que muda', () => {
    const text = prescriptionToText(run(PYRAMID));
    expect(text).toContain('800m @ 4:00/km');
    expect(text).not.toBe('');
  });

  test('estructura corrupta (un tramo sin medida) → el plano de siempre', () => {
    const corrupt = [
      { role: 'main', elements: [{ kind: 'work', target: { type: 'pace_zone', zone: 4 } }] },
    ] as unknown as RunStructure;
    const p = run(corrupt, { rounds: 6, rest_s: 60, sets: [{ measure: { kind: 'distance', meters: 800 }, rest_s: 60 }] });
    expect(prescriptionToText(p)).toBe("6×800m · r1'");
  });

  test('estructura sin fase principal → el plano de siempre', () => {
    const noMain = [
      { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }] },
    ] as unknown as RunStructure;
    expect(prescriptionToText(run(noMain, { total_s: 2700, scheme: 'steady', target: { kind: 'hr_zone', value: 2 } }))).toBe(
      "45' @ Z2",
    );
  });
});

describe('sin estructura, la línea no cambia', () => {
  test('fuerza, series de carrera, rodaje y AMRAP siguen igual', () => {
    expect(
      prescriptionToText({
        scheme: 'sets',
        modality: 'strength',
        sets: Array.from({ length: 5 }, () => ({
          measure: { kind: 'reps' as const, value: 5 },
          target: { kind: 'percent_rm' as const, value: 75 },
          rest_s: 120,
        })),
      }),
    ).toBe("5×5 @ 75% RM · descanso 2'");
    expect(
      prescriptionToText({
        scheme: 'intervals',
        modality: 'run',
        rounds: 4,
        rest_s: 120,
        sets: [{ measure: { kind: 'distance', meters: 1000 } }],
        target: { kind: 'pace', unit: 'per_km', value_s: 250 },
      }),
    ).toBe("4×1000m @ 4:10/km · r2'");
    expect(prescriptionToText({ scheme: 'steady', modality: 'run', total_s: 2700, target: { kind: 'hr_zone', value: 2 } })).toBe(
      "45' @ Z2",
    );
    expect(prescriptionToText({ scheme: 'amrap', modality: 'functional', total_s: 720 })).toBe("AMRAP 12'");
  });
});
